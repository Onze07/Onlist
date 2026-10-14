// Registro de erros para o painel (/admin → Erros). Só o servidor grava (Admin SDK);
// as regras do Firestore não dão acesso a errorLogs para ninguém pelo app.
import { createHash } from 'node:crypto'
import { FieldValue, Timestamp } from 'firebase-admin/firestore'

export const ERROR_SOURCES = ['app', 'server', 'nfce']
const KEEP_DAYS = 30

// Nada de dados pessoais: CPF mascarado, imagens em base64 removidas, tamanho limitado
export function sanitize(text, max = 2000) {
  return String(text ?? '')
    // CPF em qualquer formato: 000.000.000-00, 000 000 000 00, 00000000000 (sem pegar pedaço da chave de 44 dígitos)
    .replace(/(?<!\d)\d{3}[\s.]?\d{3}[\s.]?\d{3}[\s-]?\d{2}(?!\d)/g, '[cpf]')
    .replace(/base64,[A-Za-z0-9+/=]+/g, 'base64,[img]')
    .replace(/Bearer\s+[\w.-]+/gi, 'Bearer [token]')
    .slice(0, max)
}

// Mesma falha (números e ids trocados por #) = mesmo grupo no painel
export function fingerprint({ source, kind, message }) {
  const norm = String(message || '').toLowerCase().replace(/[0-9a-f]{8,}/g, '#').replace(/\d+/g, '#').slice(0, 300)
  return createHash('sha1').update(`${source}|${kind}|${norm}`).digest('hex').slice(0, 16)
}

// Nunca lança: registrar o erro não pode derrubar a resposta ao usuário
export async function logError(fs, { source = 'server', kind = 'error', message, detail, uid, email, path, userAgent, appVersion } = {}) {
  try {
    if (!fs) return null
    const src = ERROR_SOURCES.includes(source) ? source : 'server'
    const msg = sanitize(message || 'Erro sem mensagem', 300)
    const doc = {
      source: src,
      kind: sanitize(kind, 40),
      message: msg,
      detail: detail ? sanitize(detail, 4000) : null,
      fp: fingerprint({ source: src, kind, message: msg }),
      uid: uid || null,
      email: email || null,
      path: path ? sanitize(path, 200) : null,
      userAgent: userAgent ? sanitize(userAgent, 300) : null,
      appVersion: appVersion ? sanitize(appVersion, 40) : null,
      createdAt: FieldValue.serverTimestamp(),
      // Para a política de TTL do Firestore (opcional) apagar sozinho depois de 30 dias
      expiresAt: Timestamp.fromMillis(Date.now() + KEEP_DAYS * 86400000),
    }
    const ref = await fs.collection('errorLogs').add(doc)
    return ref.id
  } catch (e) {
    console.error('errlog', e)
    return null
  }
}

// Painel: agrupa por fingerprint (quantas vezes, quantas pessoas, última vez)
export async function listErrors(fs, { days = 7, limit = 500, now = Date.now() } = {}) {
  const snap = await fs.collection('errorLogs')
    .where('createdAt', '>=', Timestamp.fromMillis(now - days * 86400000))
    .orderBy('createdAt', 'desc').limit(limit).get()
  const groups = new Map()
  let last24h = 0
  for (const d of snap.docs) {
    const e = d.data()
    const at = e.createdAt?.toMillis ? e.createdAt.toMillis() : now
    if (now - at <= 86400000) last24h++
    let g = groups.get(e.fp)
    if (!g) {
      g = { fp: e.fp, source: e.source, kind: e.kind, message: e.message, count: 0, users: new Set(), lastAt: at, firstAt: at, samples: [] }
      groups.set(e.fp, g)
    }
    g.count++
    if (e.uid) g.users.add(e.uid)
    g.lastAt = Math.max(g.lastAt, at)
    g.firstAt = Math.min(g.firstAt, at)
    if (g.samples.length < 5) {
      g.samples.push({ id: d.id, at: new Date(at).toISOString(), email: e.email, path: e.path, userAgent: e.userAgent, detail: e.detail, appVersion: e.appVersion })
    }
  }
  return {
    total: snap.size,
    last24h,
    groups: [...groups.values()]
      .map(g => ({ ...g, users: g.users.size, lastAt: new Date(g.lastAt).toISOString(), firstAt: new Date(g.firstAt).toISOString() }))
      .sort((a, b) => b.lastAt.localeCompare(a.lastAt)),
  }
}

// "Resolvido": apaga as ocorrências daquele grupo
export async function clearErrorGroup(fs, fp) {
  if (!fp || typeof fp !== 'string') return { deleted: 0 }
  const snap = await fs.collection('errorLogs').where('fp', '==', fp).limit(500).get()
  const writer = fs.bulkWriter()
  snap.docs.forEach(d => writer.delete(d.ref))
  await writer.close()
  return { deleted: snap.size }
}
