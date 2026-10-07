// Painel administrativo (dono do app). Tudo passa pelo servidor com o Admin SDK:
// as regras do Firestore continuam sem dar a ninguém acesso aos dados de outras famílias.
import { FieldValue, Timestamp } from 'firebase-admin/firestore'

export class AdminError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

// ADMIN_EMAILS="a@x.com, b@y.com" na Vercel
export function isAdminEmail(token, envValue = process.env.ADMIN_EMAILS) {
  const list = String(envValue || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
  const email = String(token?.email || '').toLowerCase()
  return !!email && token?.email_verified !== false && list.includes(email)
}

const DAY = 86400000
const ms = ts => (ts?.toMillis ? ts.toMillis() : ts ? new Date(ts).getTime() : null)
const iso = ts => (ms(ts) ? new Date(ms(ts)).toISOString() : null)

export const PLAN_STATUS = ['trial', 'active', 'past_due', 'canceled']
export const PLAN_INTERVAL = ['monthly', 'annual', 'lifetime', 'none']
// Tipo do plano: base para liberar/limitar funções quando a cobrança começar
export const PLAN_TIERS = ['founder', 'basic', 'premium', 'custom']
export const FEEDBACK_STATUS = ['new', 'doing', 'done']

// Valida o plano digitado no painel. null = remover plano (volta ao acesso livre).
export function cleanPlan(input) {
  if (input === null) return null
  if (!input || typeof input !== 'object') throw new AdminError(400, 'Plano inválido')
  const name = String(input.name || '').trim().slice(0, 40)
  if (!name) throw new AdminError(400, 'Dê um nome ao plano')
  if (!PLAN_STATUS.includes(input.status)) throw new AdminError(400, 'Situação inválida')
  if (!PLAN_INTERVAL.includes(input.interval)) throw new AdminError(400, 'Período inválido')
  const tier = input.tier ?? 'custom'
  if (!PLAN_TIERS.includes(tier)) throw new AdminError(400, 'Tipo de plano inválido')
  const seats = Number(input.seats)
  if (!Number.isInteger(seats) || seats < 1 || seats > 50) throw new AdminError(400, 'Vagas: de 1 a 50')
  const price = Number(input.price || 0)
  if (!(price >= 0) || price > 10000) throw new AdminError(400, 'Valor inválido')
  let validUntil = null
  if (input.validUntil) {
    const d = new Date(`${String(input.validUntil).slice(0, 10)}T23:59:59-03:00`)
    if (Number.isNaN(d.getTime())) throw new AdminError(400, 'Data de validade inválida')
    validUntil = Timestamp.fromDate(d)
  }
  return {
    tier, name, status: input.status, interval: input.interval, seats,
    price: Math.round(price * 100) / 100,
    validUntil,
    notes: String(input.notes || '').trim().slice(0, 500),
  }
}

function planOut(plan) {
  if (!plan) return null
  return { ...plan, validUntil: iso(plan.validUntil), updatedAt: iso(plan.updatedAt) }
}

async function listAllUsers(auth) {
  const users = []
  let token
  do {
    const page = await auth.listUsers(1000, token)
    users.push(...page.users)
    token = page.pageToken
  } while (token)
  return users
}

// Resumo de uma família para a lista do painel
async function familySummary(fs, doc, since30) {
  const f = doc.data()
  const ref = doc.ref
  const [historyCount, recentCount, lastBuy, profiles] = await Promise.all([
    ref.collection('history').count().get(),
    ref.collection('history').where('createdAt', '>=', since30).count().get(),
    ref.collection('history').orderBy('createdAt', 'desc').limit(1).get(),
    ref.collection('profiles').get(),
  ])
  const owner = profiles.docs.find(p => p.id === f.createdBy)?.data() || {}
  const lastSeen = Math.max(0, ...profiles.docs.map(p => ms(p.data().lastSeenAt) || 0))
  const lastPurchase = lastBuy.docs[0] ? ms(lastBuy.docs[0].data().createdAt) : null
  return {
    id: doc.id,
    name: f.name || 'Sem nome',
    code: f.code || null,
    createdAt: iso(f.createdAt),
    owner: { uid: f.createdBy, name: owner.name || null, email: owner.email || null },
    members: (f.members || []).length,
    purchases: historyCount.data().count,
    purchases30: recentCount.data().count,
    lastPurchase: lastPurchase ? new Date(lastPurchase).toISOString() : null,
    lastSeen: lastSeen ? new Date(lastSeen).toISOString() : null,
    plan: planOut(f.plan),
  }
}

export async function overview({ fs, auth, now = Date.now() }) {
  // Sem collectionGroup: não exige índice extra no Firestore
  const [familiesSnap, users, feedbackSnap] = await Promise.all([
    fs.collection('families').get(),
    listAllUsers(auth),
    fs.collection('feedback').select('status').get(),
  ])
  const since30 = Timestamp.fromMillis(now - 30 * DAY)
  const families = await Promise.all(familiesSnap.docs.map(d => familySummary(fs, d, since30)))
  families.sort((a, b) => (b.lastSeen || '').localeCompare(a.lastSeen || ''))

  const inFamily = new Set()
  familiesSnap.docs.forEach(d => (d.data().members || []).forEach(uid => inFamily.add(uid)))
  const active = days => families.filter(f => f.lastSeen && now - Date.parse(f.lastSeen) <= days * DAY).length
  // Pagante = plano ativo com valor (Fundador e Básico gratuitos não contam)
  const paying = families.filter(f => f.plan?.status === 'active' && f.plan.price > 0).length
  const byTier = tier => families.filter(f => f.plan?.status === 'active' && f.plan.tier === tier).length
  const openFeedback = feedbackSnap.docs.filter(d => (d.data().status || 'new') !== 'done').length

  return {
    generatedAt: new Date(now).toISOString(),
    kpis: {
      users: users.length,
      usersNoFamily: users.filter(u => !inFamily.has(u.uid)).length,
      families: families.length,
      familiesWithPurchase: families.filter(f => f.purchases > 0).length,
      familiesBuying30: families.filter(f => f.purchases30 > 0).length,
      familiesBuying30: families.filter(f => f.purchases30 > 0).length,
      active7: active(7),
      active30: active(30),
      purchases30: families.reduce((s, f) => s + f.purchases30, 0),
      paying,
      mrr: Math.round(families.reduce((s, f) => {
        if (f.plan?.status !== 'active') return s
        if (f.plan.interval === 'monthly') return s + f.plan.price
        if (f.plan.interval === 'annual') return s + f.plan.price / 12
        return s
      }, 0) * 100) / 100,
      founders: byTier('founder'),
      basic: byTier('basic'),
      premium: byTier('premium'),
      feedback: feedbackSnap.size,
      feedbackOpen: openFeedback,
    },
    families,
    // Cadastrou e não criou nem entrou em família: quem precisa de ajuda no começo
    usersNoFamily: users.filter(u => !inFamily.has(u.uid)).map(u => ({
      uid: u.uid, name: u.displayName || null, email: u.email || null,
      createdAt: u.metadata.creationTime ? new Date(u.metadata.creationTime).toISOString() : null,
      lastSignIn: u.metadata.lastSignInTime ? new Date(u.metadata.lastSignInTime).toISOString() : null,
    })),
  }
}

// Detalhe: membros e números de uso. Não mostra itens das compras (privacidade).
export async function familyDetail({ fs, auth, familyId }) {
  if (!familyId || typeof familyId !== 'string') throw new AdminError(400, 'Família inválida')
  const ref = fs.doc(`families/${familyId}`)
  const snap = await ref.get()
  if (!snap.exists) throw new AdminError(404, 'Família não encontrada')
  const f = snap.data()
  const [profiles, lists, catalog, history, nfce, recent] = await Promise.all([
    ref.collection('profiles').get(),
    ref.collection('lists').count().get(),
    ref.collection('catalog').count().get(),
    ref.collection('history').count().get(),
    ref.collection('history').where('source', '==', 'nfce').count().get(),
    ref.collection('history').orderBy('createdAt', 'desc').limit(10).get(),
  ])
  const byUid = Object.fromEntries(profiles.docs.map(p => [p.id, p.data()]))
  const authUsers = (f.members || []).length
    ? (await auth.getUsers((f.members || []).map(uid => ({ uid })))).users
    : []
  const authByUid = Object.fromEntries(authUsers.map(u => [u.uid, u]))
  const admins = f.admins || []
  return {
    id: snap.id,
    name: f.name || 'Sem nome',
    code: f.code || null,
    createdAt: iso(f.createdAt),
    brandsEnabled: !!f.brandsEnabled,
    plan: planOut(f.plan),
    counts: { lists: lists.data().count, catalog: catalog.data().count, purchases: history.data().count, nfce: nfce.data().count },
    members: (f.members || []).map(uid => {
      const p = byUid[uid] || {}
      const a = authByUid[uid]
      return {
        uid,
        name: p.name || a?.displayName || null,
        email: p.email || a?.email || null,
        role: uid === f.createdBy ? 'Dono' : admins.includes(uid) ? 'Admin' : 'Membro',
        joinedAt: iso(p.joinedAt),
        lastSeenAt: iso(p.lastSeenAt),
        pushEnabled: !!p.pushEnabled,
        createdAt: a?.metadata.creationTime ? new Date(a.metadata.creationTime).toISOString() : null,
      }
    }),
    recent: recent.docs.map(d => {
      const r = d.data()
      return { id: d.id, createdAt: iso(r.createdAt), mercado: r.mercado || null, total: r.total || 0, items: (r.items || []).length, source: r.source || 'manual' }
    }),
  }
}

export async function setPlan({ fs, familyId, plan, adminEmail }) {
  if (!familyId || typeof familyId !== 'string') throw new AdminError(400, 'Família inválida')
  const ref = fs.doc(`families/${familyId}`)
  if (!(await ref.get()).exists) throw new AdminError(404, 'Família não encontrada')
  const clean = cleanPlan(plan)
  await ref.update({
    plan: clean ? { ...clean, updatedAt: FieldValue.serverTimestamp(), updatedBy: adminEmail || null } : FieldValue.delete(),
  })
  return { ok: true }
}

export async function listFeedback({ fs, limit = 100 }) {
  const snap = await fs.collection('feedback').orderBy('createdAt', 'desc').limit(limit).get()
  return snap.docs.map(d => {
    const f = d.data()
    return {
      id: d.id, createdAt: iso(f.createdAt), email: f.email || null, familyId: f.familyId || null, type: f.type || null,
      message: f.message || '', userAgent: f.userAgent || null,
      status: f.status || 'new', adminNote: f.adminNote || '', handledAt: iso(f.handledAt), handledBy: f.handledBy || null,
    }
  })
}

// Atendimento: novo -> em andamento -> resolvido, com anotação interna
export async function setFeedbackStatus({ fs, id, status, note, adminEmail }) {
  if (!id || typeof id !== 'string') throw new AdminError(400, 'Mensagem inválida')
  if (!FEEDBACK_STATUS.includes(status)) throw new AdminError(400, 'Situação inválida')
  const ref = fs.doc(`feedback/${id}`)
  if (!(await ref.get()).exists) throw new AdminError(404, 'Mensagem não encontrada')
  await ref.update({
    status,
    ...(note !== undefined ? { adminNote: String(note || '').trim().slice(0, 1000) } : {}),
    handledAt: FieldValue.serverTimestamp(),
    handledBy: adminEmail || null,
  })
  return { ok: true }
}
