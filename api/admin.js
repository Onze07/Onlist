// POST /api/admin — painel administrativo do dono do app
// Variáveis na Vercel: FIREBASE_SERVICE_ACCOUNT (já existe) e ADMIN_EMAILS (e-mails com acesso, separados por vírgula)
import { initializeApp, cert, getApps } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { logError } from './_lib/errlog.js'
import { getFirestore } from 'firebase-admin/firestore'
import { getMessaging } from 'firebase-admin/messaging'
import { AdminError, isAdminEmail, isRecentLogin, overview, familyDetail, setPlan, listFeedback, setFeedbackStatus, audit, listAudit, getAnnouncement, setAnnouncement } from './_lib/admin-core.js'
import { notifyResolved } from './_lib/support-core.js'
import { listErrors, clearErrorGroup } from './_lib/errlog.js'

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
    // Painel exige login recente: sessão esquecida aberta num computador não dá acesso para sempre
    if (!isRecentLogin(token)) return res.status(401).json({ error: 'Por segurança, entre de novo no painel.', reauth: true })

    const fs = getFirestore()
    const auth = getAuth()
    switch (body.action) {
      case 'overview': return res.status(200).json(await overview({ fs, auth }))
      case 'family': return res.status(200).json(await familyDetail({ fs, auth, familyId: body.familyId }))
      case 'setPlan': {
        const r = await setPlan({ fs, familyId: body.familyId, plan: body.plan, adminEmail: token.email })
        await audit(fs, { email: token.email, action: body.plan ? 'Plano alterado' : 'Plano removido', target: body.familyId, details: body.plan || null })
        return res.status(200).json(r)
      }
      case 'audit': return res.status(200).json({ audit: await listAudit({ fs }) })
      case 'announcement': return res.status(200).json(await getAnnouncement({ fs }))
      case 'setAnnouncement': {
        const r = await setAnnouncement({ fs, message: body.message, level: body.level, active: body.active, adminEmail: token.email })
        await audit(fs, { email: token.email, action: r.active ? 'Aviso geral publicado' : 'Aviso geral desligado', target: 'config/announcement', details: r.active ? { mensagem: r.message } : null })
        return res.status(200).json(r)
      }
      case 'feedback': return res.status(200).json({ feedback: await listFeedback({ fs }) })
      case 'errors': return res.status(200).json(await listErrors(fs, { days: Number(body.days) || 7 }))
      case 'clearErrors': {
        const r = await clearErrorGroup(fs, body.fp)
        await audit(fs, { email: token.email, action: 'Erro marcado como resolvido', target: body.fp, details: { apagados: r.deleted } })
        return res.status(200).json(r)
      }
      case 'feedbackStatus': {
        const r = await setFeedbackStatus({
          fs, id: body.id, status: body.status, note: body.note, reply: body.reply, adminEmail: token.email,
          // Resolvido: cartão no app + push "Sua solicitação foi atendida" (falha no push não desfaz a mudança)
          onResolved: ({ feedback, reply }) => notifyResolved({ fs, messaging: getMessaging(), feedback, reply })
            .catch(e => { console.error('support notify', e); return { pushed: 0, error: true } }),
        })
        const label = { new: 'reaberto', doing: 'em andamento', done: 'resolvido' }[body.status] || body.status
        await audit(fs, { email: token.email, action: `Suporte: ${label}`, target: body.id, details: body.reply ? { resposta: String(body.reply).slice(0, 200) } : null })
        return res.status(200).json(r)
      }
      default: return res.status(400).json({ error: 'Pedido inválido' })
    }
  } catch (e) {
    if (e instanceof AdminError) return res.status(e.status).json({ error: e.message })
    console.error('admin', e)
    await logError(getApps().length ? getFirestore() : null, { source: 'server', kind: 'exception', message: `/api/admin: ${e.message}`, detail: e.stack, path: '/api/admin' })
    return res.status(500).json({ error: 'Erro no painel. Tente de novo.' })
  }
}
