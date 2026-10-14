// POST /api/family — entrar em outra família (levando ou não os dados da atual)
// Variável de ambiente na Vercel: FIREBASE_SERVICE_ACCOUNT (JSON da conta de serviço)
import { initializeApp, cert, getApps } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { logError } from './_lib/errlog.js'
import { getFirestore } from 'firebase-admin/firestore'
import { FamilyError, joinWithCode } from './_lib/family-core.js'
import { RateLimitError, hit } from './_lib/ratelimit.js'

export const config = { maxDuration: 60 }

function app() {
  if (getApps().length) return getApps()[0]
  return initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) })
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST' })
  if (!process.env.FIREBASE_SERVICE_ACCOUNT) return res.status(500).json({ error: 'Servidor sem configuração' })

  try {
    app()
    const idToken = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '')
    let token
    try {
      token = await getAuth().verifyIdToken(idToken)
    } catch {
      return res.status(401).json({ error: 'Faça login novamente' })
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {}
    if (body.action !== 'switch') return res.status(400).json({ error: 'Pedido inválido' })

    const fs = getFirestore()
    await hit(fs, `family_${token.uid}`, { limit: 20, windowSec: 3600, message: 'Muitas tentativas de entrar em família.' })
    const result = await joinWithCode({
      fs,
      uid: token.uid,
      profile: { name: token.name, email: token.email, photoURL: token.picture },
      code: body.code,
      mode: body.mode,
    })
    return res.status(200).json(result)
  } catch (e) {
    if (e instanceof FamilyError) return res.status(e.status).json({ error: e.message })
    if (e instanceof RateLimitError) return res.status(429).json({ error: e.message, retryAfter: e.retryAfter })
    console.error('family', e)
    await logError(getApps().length ? getFirestore() : null, { source: 'server', kind: 'exception', message: `/api/family: ${e.message}`, detail: e.stack, path: '/api/family' })
    return res.status(500).json({ error: 'Não foi possível trocar de família. Tente de novo.' })
  }
}
