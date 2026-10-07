// POST /api/admin — painel administrativo do dono do app
// Variáveis na Vercel: FIREBASE_SERVICE_ACCOUNT (já existe) e ADMIN_EMAILS (e-mails com acesso, separados por vírgula)
import { initializeApp, cert, getApps } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'
import { AdminError, isAdminEmail, overview, familyDetail, setPlan, listFeedback, setFeedbackStatus } from './_lib/admin-core.js'

export const config = { maxDuration: 60 }

function app() {
  if (getApps().length) return getApps()[0]
  return initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) })
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST' })
  if (!process.env.FIREBASE_SERVICE_ACCOUNT) return res.status(500).json({ error: 'Servidor sem configuração' })
  res.setHeader('Cache-Control', 'no-store')

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
    const admin = isAdminEmail(token)
    // "whoami" responde a qualquer um (só diz se é admin), para o app mostrar ou não o atalho
    if (body.action === 'whoami') return res.status(200).json({ admin })
    if (!admin) return res.status(403).json({ error: 'Acesso restrito' })

    const fs = getFirestore()
    const auth = getAuth()
    switch (body.action) {
      case 'overview': return res.status(200).json(await overview({ fs, auth }))
      case 'family': return res.status(200).json(await familyDetail({ fs, auth, familyId: body.familyId }))
      case 'setPlan': return res.status(200).json(await setPlan({ fs, familyId: body.familyId, plan: body.plan, adminEmail: token.email }))
      case 'feedback': return res.status(200).json({ feedback: await listFeedback({ fs }) })
      case 'feedbackStatus': return res.status(200).json(await setFeedbackStatus({ fs, id: body.id, status: body.status, note: body.note, adminEmail: token.email }))
      default: return res.status(400).json({ error: 'Pedido inválido' })
    }
  } catch (e) {
    if (e instanceof AdminError) return res.status(e.status).json({ error: e.message })
    console.error('admin', e)
    return res.status(500).json({ error: 'Erro no painel. Tente de novo.' })
  }
}
