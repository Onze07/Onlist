// POST /api/feedback — mensagem de suporte enviada pelo app; avisa o dono do app por e-mail
// Variáveis na Vercel: FIREBASE_SERVICE_ACCOUNT (já existe), RESEND_API_KEY (e-mail) e
// opcionais SUPPORT_EMAIL_TO (padrão: ADMIN_EMAILS) e RESEND_FROM (padrão: remetente de teste do Resend)
import { initializeApp, cert, getApps } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'
import { SupportError, createFeedback, sendEmail, supportEmail } from './_lib/support-core.js'

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
    const fb = await createFeedback({ fs: getFirestore(), uid: token.uid, email: token.email, body })

    // O e-mail é um extra: se falhar, a mensagem já está salva e aparece no painel
    const to = String(process.env.SUPPORT_EMAIL_TO || process.env.ADMIN_EMAILS || '')
      .split(',').map(s => s.trim()).filter(Boolean)
    const host = req.headers['x-forwarded-host'] || req.headers.host
    const mail = supportEmail(fb, `https://${host}/admin`)
    const email = await sendEmail({
      apiKey: process.env.RESEND_API_KEY,
      from: process.env.RESEND_FROM || 'Onlist <onboarding@resend.dev>',
      to,
      replyTo: fb.email || undefined,
      ...mail,
    }).catch(e => ({ sent: false, reason: e.message }))
    if (!email.sent && email.reason !== 'not-configured') console.error('feedback email', email)

    return res.status(200).json({ id: fb.id })
  } catch (e) {
    if (e instanceof SupportError) return res.status(e.status).json({ error: e.message })
    console.error('feedback', e)
    return res.status(500).json({ error: 'Não foi possível enviar. Tente de novo.' })
  }
}
