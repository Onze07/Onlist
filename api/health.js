// GET /api/health — para monitor de disponibilidade (ex.: UptimeRobot a cada 5 min).
// 200 = servidor e banco respondendo; 503 = algo fora. Não expõe dados nem exige login.
// Resultado guardado por 60 s: muitos acessos não viram muitas leituras no Firestore.
import { initializeApp, cert, getApps } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

let last = null // { at, status, body }

function app() {
  if (getApps().length) return getApps()[0]
  return initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) })
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'GET' && req.method !== 'HEAD') return res.status(405).json({ error: 'Use GET' })
  if (last && Date.now() - last.at < 60_000) return res.status(last.status).json(last.body)

  const started = Date.now()
  let status = 200
  const body = { ok: true, server: 'ok', firestore: 'ok' }
  try {
    if (!process.env.FIREBASE_SERVICE_ACCOUNT) throw new Error('sem configuração')
    app()
    await Promise.race([
      getFirestore().doc('config/announcement').get(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000)),
    ])
  } catch (e) {
    status = 503
    body.ok = false
    body.firestore = e.message === 'timeout' ? 'lento' : 'fora'
  }
  body.ms = Date.now() - started
  body.at = new Date().toISOString()
  last = { at: Date.now(), status, body }
  return res.status(status).json(body)
}
