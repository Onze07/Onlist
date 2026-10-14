// Limite de uso por usuário, guardado no Firestore (rateLimits/{chave}), só o servidor acessa.
// Duas peças:
//  - hit(): no máximo N chamadas por janela de tempo (ex.: 60 leituras de nota por hora)
//  - tentativas erradas com bloqueio que aumenta a cada erro (ex.: código da família)
import { Timestamp } from 'firebase-admin/firestore'

export class RateLimitError extends Error {
  constructor(message, retryAfterSec) {
    super(message)
    this.status = 429
    this.retryAfter = retryAfterSec
  }
}

const docId = key => String(key).replace(/[^\w.-]/g, '_').slice(0, 300)

export function waitText(sec) {
  if (sec < 60) return `${Math.max(1, Math.ceil(sec))} segundos`
  const min = Math.ceil(sec / 60)
  if (min < 60) return min === 1 ? '1 minuto' : `${min} minutos`
  const h = Math.ceil(min / 60)
  return h === 1 ? '1 hora' : `${h} horas`
}

// Conta uma chamada; passou do limite na janela atual -> RateLimitError
export async function hit(fs, key, { limit, windowSec, message = 'Muitas tentativas seguidas.' }, now = Date.now()) {
  const ref = fs.collection('rateLimits').doc(docId(key))
  await fs.runTransaction(async tx => {
    const snap = await tx.get(ref)
    const d = snap.exists ? snap.data() : {}
    const start = d.windowStart?.toMillis?.() ?? 0
    const fresh = now - start >= windowSec * 1000
    const count = fresh ? 0 : d.count || 0
    if (count >= limit) {
      const retry = Math.ceil((start + windowSec * 1000 - now) / 1000)
      throw new RateLimitError(`${message} Tente de novo em ${waitText(retry)}.`, retry)
    }
    tx.set(ref, {
      count: count + 1,
      windowStart: fresh ? Timestamp.fromMillis(now) : d.windowStart,
      expiresAt: Timestamp.fromMillis(now + windowSec * 1000 * 2),
    }, { merge: true })
  })
}

// Tentativas erradas: a partir de `free` erros, bloqueia 1 min, depois 2, 4, 8... (máx. 24 h)
export const FAIL_POLICY = { free: 5, baseSec: 60, maxSec: 24 * 3600 }

export async function assertNotBlocked(fs, key, now = Date.now()) {
  const snap = await fs.collection('rateLimits').doc(docId(key)).get()
  const until = snap.exists ? snap.data().blockedUntil?.toMillis?.() ?? 0 : 0
  if (until > now) {
    const retry = Math.ceil((until - now) / 1000)
    throw new RateLimitError(`Muitos códigos errados. Por segurança, aguarde ${waitText(retry)} e tente de novo.`, retry)
  }
}

export async function registerFail(fs, key, policy = FAIL_POLICY, now = Date.now()) {
  const ref = fs.collection('rateLimits').doc(docId(key))
  return fs.runTransaction(async tx => {
    const snap = await tx.get(ref)
    const fails = (snap.exists ? snap.data().fails || 0 : 0) + 1
    const over = fails - policy.free
    const blockSec = over >= 0 ? Math.min(policy.maxSec, policy.baseSec * 2 ** over) : 0
    tx.set(ref, {
      fails,
      blockedUntil: blockSec ? Timestamp.fromMillis(now + blockSec * 1000) : null,
      expiresAt: Timestamp.fromMillis(now + 7 * 86400000),
    }, { merge: true })
    return { fails, blockSec }
  })
}

export async function resetFails(fs, key) {
  await fs.collection('rateLimits').doc(docId(key)).delete().catch(() => {})
}
