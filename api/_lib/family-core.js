// Troca de família ("entrar em outra família"), com opção de levar os dados.
// Recebe o Firestore do Admin SDK para poder ser testado no emulador.
import { FieldValue } from 'firebase-admin/firestore'
import { assertNotBlocked, registerFail, resetFails, RateLimitError, waitText } from './ratelimit.js'

export const DEFAULT_SEATS = 20
const PRICE_HISTORY_MAX = 60

export class FamilyError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

function firstName(name) {
  return String(name || '').trim().split(/\s+/)[0] || 'outra família'
}

// Junta dois históricos de preço sem repetir (mesmo dia + mercado + preço) e mantém os mais recentes
export function mergePriceHistory(a = [], b = [], max = PRICE_HISTORY_MAX) {
  const seen = new Set()
  const all = []
  for (const h of [...a, ...b]) {
    if (!h?.date || !(Number(h.price) > 0)) continue
    const key = `${h.date}|${String(h.mercado || '').trim().toLowerCase()}|${Number(h.price)}`
    if (seen.has(key)) continue
    seen.add(key)
    all.push(h)
  }
  all.sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : 0))
  return all.slice(-max)
}

// Mesmo produto nas duas famílias (mesmo id = nome em minúsculas): o destino manda, a origem completa
export function mergeCatalogItem(target, source) {
  const priceHistory = mergePriceHistory(target.priceHistory, source.priceHistory)
  const last = priceHistory[priceHistory.length - 1]
  const merged = { ...source, ...target, priceHistory }
  for (const k of ['category', 'unit']) if (!target[k] && source[k]) merged[k] = source[k]
  if (last) merged.lastPrice = Number(last.price)
  return merged
}

async function readAll(ref) {
  const snap = await ref.get()
  return snap.docs
}

// Copia os dados de uma família para outra. Nada é apagado aqui.
export async function mergeFamilyData(fs, fromFid, toFid, ownerName) {
  const from = fs.doc(`families/${fromFid}`)
  const to = fs.doc(`families/${toFid}`)
  const writer = fs.bulkWriter()
  const stats = { catalog: 0, history: 0, lists: 0 }

  // Catálogo: mescla pelo id (nome em minúsculas)
  const [srcCatalog, dstCatalog] = await Promise.all([readAll(from.collection('catalog')), readAll(to.collection('catalog'))])
  const dst = new Map(dstCatalog.map(d => [d.id, d.data()]))
  for (const d of srcCatalog) {
    const data = dst.has(d.id) ? mergeCatalogItem(dst.get(d.id), d.data()) : d.data()
    writer.set(to.collection('catalog').doc(d.id), data)
    stats.catalog++
  }

  // Compras: mesmo id (ex.: chave da nota fiscal) = mesma compra, não duplica
  const [srcHistory, dstHistory] = await Promise.all([readAll(from.collection('history')), readAll(to.collection('history'))])
  const dstHistoryIds = new Set(dstHistory.map(d => d.id))
  for (const d of srcHistory) {
    if (dstHistoryIds.has(d.id)) continue
    writer.set(to.collection('history').doc(d.id), d.data())
    stats.history++
  }

  // Mercados (id = nome em minúsculas) e escolhas das notas (código do produto)
  for (const d of await readAll(from.collection('mercados'))) {
    writer.set(to.collection('mercados').doc(d.id), d.data(), { merge: true })
  }
  const dstMap = new Set((await readAll(to.collection('nfceMap'))).map(d => d.id))
  for (const d of await readAll(from.collection('nfceMap'))) {
    if (!dstMap.has(d.id)) writer.set(to.collection('nfceMap').doc(d.id), d.data())
  }

  // Listas com itens viram listas novas, identificadas por quem trouxe
  for (const list of await readAll(from.collection('lists'))) {
    const entries = await readAll(list.ref.collection('entries'))
    if (entries.length === 0) continue
    // Id fixo: se a troca for retomada depois de uma falha, a lista não é copiada duas vezes
    const newList = to.collection('lists').doc(`m_${fromFid}_${list.id}`)
    writer.set(newList, { ...list.data(), name: `${list.data().name || 'Lista'} (de ${firstName(ownerName)})` })
    for (const e of entries) writer.set(newList.collection('entries').doc(e.id), e.data())
    stats.lists++
  }

  await writer.close()
  return stats
}

// Apaga a família inteira (subcoleções incluídas) e o código de convite
export async function deleteFamily(fs, fid) {
  const ref = fs.doc(`families/${fid}`)
  const snap = await ref.get()
  const code = snap.exists ? snap.data().code : null
  await fs.recursiveDelete(ref)
  if (code) {
    const codeRef = fs.doc(`familyCodes/${code}`)
    const codeSnap = await codeRef.get()
    if (codeSnap.exists && codeSnap.data().familyId === fid) await codeRef.delete()
  }
}

// mode: 'merge' (levar meus dados) | 'fresh' (começar do zero)
// profile: { name, email, photoURL } de quem está entrando
export async function switchFamily({ fs, uid, profile, code, mode }) {
  const cleanCode = String(code || '').trim().toUpperCase()
  if (!/^[A-Z0-9]{6}$/.test(cleanCode)) throw new FamilyError(400, 'Código inválido')
  if (!['merge', 'fresh'].includes(mode)) throw new FamilyError(400, 'Pedido inválido')

  const codeSnap = await fs.doc(`familyCodes/${cleanCode}`).get()
  if (!codeSnap.exists) throw new FamilyError(404, 'Código não encontrado')
  const newFid = codeSnap.data().familyId

  const userRef = fs.doc(`users/${uid}`)
  const userSnap = await userRef.get()
  const oldFid = userSnap.exists ? userSnap.data().familyId || null : null
  if (oldFid === newFid) {
    // Troca interrompida no meio (queda do servidor): termina em vez de recusar
    if ((await fs.doc(`moves/${uid}`).get()).exists) return resumeMove({ fs, uid, profile })
    throw new FamilyError(400, 'Você já está nesta família')
  }

  let old = null
  if (oldFid) {
    const s = await fs.doc(`families/${oldFid}`).get()
    if (s.exists && (s.data().members || []).includes(uid)) old = s.data()
  }
  const isOwner = !!old && old.createdBy === uid
  if (isOwner && old.members.length > 1) {
    throw new FamilyError(409, 'Você é o dono da sua família atual. Passe a posse para outra pessoa antes de sair.')
  }

  // Entra na nova família (com checagem de vagas na mesma transação)
  const newRef = fs.doc(`families/${newFid}`)
  await fs.runTransaction(async tx => {
    const s = await tx.get(newRef)
    if (!s.exists) throw new FamilyError(404, 'Família não encontrada')
    const members = s.data().members || []
    const seats = s.data().plan?.seats ?? DEFAULT_SEATS
    if (!members.includes(uid) && members.length >= seats) {
      throw new FamilyError(403, 'Esta família está com todas as vagas ocupadas.')
    }
    tx.update(newRef, { members: FieldValue.arrayUnion(uid) })
    tx.set(newRef.collection('profiles').doc(uid), {
      name: profile?.name || profile?.email || 'Sem nome',
      email: profile?.email || null,
      photoURL: profile?.photoURL || null,
      joinedAt: FieldValue.serverTimestamp(),
      lastSeenAt: FieldValue.serverTimestamp(),
    }, { merge: true })
    tx.set(userRef, { familyId: newFid, joinCode: FieldValue.delete(), movePending: old ? true : FieldValue.delete() }, { merge: true })
    // Anota a saída da família antiga em moves/{uid} (só o servidor lê/grava; o app não consegue
    // forjar). Se algo falhar depois daqui, resumeMove termina o serviço.
    if (old) tx.set(fs.doc(`moves/${uid}`), { from: oldFid, to: newFid, owner: isOwner, mode, at: FieldValue.serverTimestamp() })
  })

  const stats = old ? await leaveOld(fs, uid, { from: oldFid, to: newFid, owner: isOwner, mode }, profile) : null
  return { familyId: newFid, merged: stats }
}

// Sai da família antiga (copiando os dados, se pedido). Pode rodar mais de uma vez sem duplicar nada.
async function leaveOld(fs, uid, move, profile) {
  let stats = null
  const oldRef = fs.doc(`families/${move.from}`)
  if (move.owner) {
    if ((await oldRef.get()).exists) {
      if (move.mode === 'merge') stats = await mergeFamilyData(fs, move.from, move.to, profile?.name)
      await deleteFamily(fs, move.from)
    }
  } else if ((await oldRef.get()).exists) {
    const batch = fs.batch()
    batch.update(oldRef, { members: FieldValue.arrayRemove(uid), admins: FieldValue.arrayRemove(uid) })
    batch.delete(oldRef.collection('profiles').doc(uid))
    batch.delete(oldRef.collection('presence').doc(uid))
    await batch.commit()
  }
  await fs.doc(`moves/${uid}`).delete()
  await fs.doc(`users/${uid}`).set({ movePending: FieldValue.delete() }, { merge: true })
  return stats
}

// Termina uma troca de família que parou no meio
export async function resumeMove({ fs, uid, profile }) {
  const snap = await fs.doc(`moves/${uid}`).get()
  const move = snap.exists ? snap.data() : null
  if (!move?.from) {
    await fs.doc(`users/${uid}`).set({ movePending: FieldValue.delete() }, { merge: true })
    return { familyId: null, merged: null }
  }
  const stats = await leaveOld(fs, uid, move, profile)
  return { familyId: move.to, merged: stats }
}

// Exclusão de conta pelo servidor: apaga tudo de uma vez, mesmo se o app fechar no meio.
// Dono sozinho: apaga a família inteira. Membro: só sai. Dono com outros membros: recusa.
export async function deleteAccount({ fs, auth, uid }) {
  const userRef = fs.doc(`users/${uid}`)
  const userSnap = await userRef.get()
  const fid = userSnap.exists ? userSnap.data().familyId || null : null
  if (fid) {
    const famRef = fs.doc(`families/${fid}`)
    const fam = await famRef.get()
    if (fam.exists && (fam.data().members || []).includes(uid)) {
      const members = fam.data().members || []
      if (fam.data().createdBy === uid) {
        if (members.length > 1) throw new FamilyError(409, 'Você é o dono da família. Passe a posse ou remova os outros membros antes de excluir sua conta.')
        await deleteFamily(fs, fid)
      } else {
        const batch = fs.batch()
        batch.update(famRef, { members: FieldValue.arrayRemove(uid), admins: FieldValue.arrayRemove(uid) })
        batch.delete(famRef.collection('profiles').doc(uid))
        batch.delete(famRef.collection('presence').doc(uid))
        await batch.commit()
      }
    }
  }
  await fs.recursiveDelete(userRef)
  await fs.doc(`moves/${uid}`).delete()
  await auth.deleteUser(uid).catch(e => { if (e?.code !== 'auth/user-not-found') throw e })
  return { deleted: true, familyId: fid }
}

// Entrar com código passando pelo limite de tentativas: código errado conta como erro e,
// a partir do 5º, bloqueia por 1 min, 2, 4, 8... Acertar zera a contagem.
export async function joinWithCode({ fs, uid, profile, code, mode, now = Date.now() }) {
  const key = `join_${uid}`
  await assertNotBlocked(fs, key, now)
  try {
    const result = await switchFamily({ fs, uid, profile, code, mode })
    await resetFails(fs, key)
    return result
  } catch (e) {
    const wrongCode = e instanceof FamilyError && (e.status === 404 || e.message === 'Código inválido')
    if (!wrongCode) throw e
    const { blockSec } = await registerFail(fs, key, undefined, now)
    if (blockSec) throw new RateLimitError(`Código não encontrado. Por segurança, aguarde ${waitText(blockSec)} antes de tentar de novo.`, blockSec)
    throw e
  }
}
