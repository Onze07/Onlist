// POST /api/notify — envia aviso push para membros da família (Firebase Cloud Messaging)
// Variável de ambiente na Vercel: FIREBASE_SERVICE_ACCOUNT (JSON da conta de serviço)
import { initializeApp, cert, getApps } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { getMessaging } from 'firebase-admin/messaging'
import { planNotification } from './_lib/notify-core.js'

function app() {
  if (getApps().length) return getApps()[0]
  return initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) })
}

const INVALID_TOKEN = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
  'messaging/invalid-argument',
])

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST' })
  if (!process.env.FIREBASE_SERVICE_ACCOUNT) return res.status(500).json({ error: 'Servidor sem configuração de avisos' })

  try {
    app()
    const idToken = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '')
    let uid
    try {
      uid = (await getAuth().verifyIdToken(idToken)).uid
    } catch {
      return res.status(401).json({ error: 'Faça login novamente' })
    }

    const firestore = getFirestore()
    const db = {
      async get(path) {
        const snap = await firestore.doc(path).get()
        return { exists: snap.exists, data: snap.data() || {} }
      },
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body
    const plan = await planNotification({ db, uid, body })
    if (plan.status !== 200) return res.status(plan.status).json({ error: plan.error })

    let sent = 0
    if (plan.tokens.length) {
      const result = await getMessaging().sendEachForMulticast({
        tokens: plan.tokens.map(t => t.token),
        data: plan.payload,
        webpush: { headers: { Urgency: 'high', TTL: '86400' } },
      })
      sent = result.successCount
      // Remove aparelhos que não existem mais
      const stale = {}
      result.responses.forEach((r, i) => {
        if (!r.success && INVALID_TOKEN.has(r.error?.code)) {
          const { uid: owner, token } = plan.tokens[i]
          ;(stale[owner] ||= []).push(token)
        }
      })
      await Promise.all(Object.entries(stale).map(([owner, tokens]) =>
        firestore.doc(`users/${owner}`).update({ fcmTokens: FieldValue.arrayRemove(...tokens) }).catch(() => {})))
    }

    await firestore.doc(plan.logPath).set({ [body.type]: Date.now() }, { merge: true })
    return res.status(200).json({ sent, targets: plan.targets.length, withoutDevice: plan.withoutDevice })
  } catch (e) {
    console.error('notify', e)
    return res.status(500).json({ error: 'Não foi possível enviar o aviso' })
  }
}
