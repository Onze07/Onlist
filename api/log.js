// POST /api/log — erro capturado no app (tela, gravação que falhou, chamada ao servidor)
// Exige login; aceita até 20 registros por chamada do mesmo aparelho em sequência.
import { initializeApp, cert, getApps } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'
import { logError } from './_lib/errlog.js'
import { hit } from './_lib/ratelimit.js'
import { appCheckOk } from './_lib/appcheck.js'

function app() {
  if (getApps().length) return getApps()[0]
  return initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) })
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST' })
  if (!process.env.FIREBASE_SERVICE_ACCOUNT) return res.status(204).end()
  try {
    app()
    const idToken = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '')
    let token
    try { token = await getAuth().verifyIdToken(idToken) } catch { return res.status(401).json({ error: 'Faça login novamente' }) }

    // Chamada de fora do app (sem App Check válido) é recusada quando APPCHECK_ENFORCE=1
    if (!(await appCheckOk(req))) return res.status(204).end()

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {}
    const items = (Array.isArray(body.errors) ? body.errors : [body]).slice(0, 20)
    const fs = getFirestore()
    // Acima do limite, descarta em silêncio (o app não precisa saber)
    // Conta cada registro, não cada chamada: no máximo 60 por hora por pessoa
    try { await hit(fs, `log_${token.uid}`, { limit: 60, windowSec: 3600, cost: items.length }) } catch { return res.status(204).end() }
    await Promise.all(items.map(e => logError(fs, {
      source: 'app',
      kind: e.kind,
      message: e.message,
      detail: e.detail,
      path: e.path,
      appVersion: e.appVersion,
      userAgent: req.headers['user-agent'],
      uid: token.uid,
      email: token.email,
    })))
    return res.status(204).end()
  } catch (e) {
    console.error('log', e)
    return res.status(204).end()
  }
}
