// Suporte: mensagem do usuário (com aviso por e-mail ao dono do app) e resposta de volta ao usuário.
import { FieldValue } from 'firebase-admin/firestore'

export const FEEDBACK_TYPES = ['sugestao', 'problema', 'elogio']

export class SupportError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

const escapeHtml = s => String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const TYPE_LABEL = { sugestao: 'Sugestão', problema: 'Problema', elogio: 'Elogio' }

// Grava a mensagem. familyId só é aceito se a pessoa for mesmo membro.
export async function createFeedback({ fs, uid, email, body }) {
  const message = String(body?.message || '').trim().slice(0, 2000)
  if (!message) throw new SupportError(400, 'Escreva a mensagem')
  const type = FEEDBACK_TYPES.includes(body?.type) ? body.type : 'sugestao'
  let familyId = null
  if (typeof body?.familyId === 'string' && body.familyId) {
    const fam = await fs.doc(`families/${body.familyId}`).get()
    if (fam.exists && (fam.data().members || []).includes(uid)) familyId = body.familyId
  }
  const ref = fs.collection('feedback').doc()
  const data = {
    uid, email: email || null, familyId, type, message,
    userAgent: String(body?.userAgent || '').slice(0, 300),
    status: 'new',
    createdAt: FieldValue.serverTimestamp(),
  }
  await ref.set(data)
  return { id: ref.id, ...data }
}

export function supportEmail(fb, panelUrl) {
  const label = TYPE_LABEL[fb.type] || 'Mensagem'
  const subject = `[Onlist] ${label} de ${fb.email || 'usuário'}`
  const text = `${label} de ${fb.email || 'usuário'}\n\n${fb.message}\n\nResponder no painel: ${panelUrl}`
  const html = `<div style="font-family:system-ui,sans-serif;max-width:560px">
<p style="color:#6b7280;margin:0 0 8px">${escapeHtml(label)} de <b>${escapeHtml(fb.email || 'usuário')}</b></p>
<p style="white-space:pre-wrap;font-size:15px;line-height:1.5;margin:0 0 16px">${escapeHtml(fb.message)}</p>
<a href="${escapeHtml(panelUrl)}" style="display:inline-block;background:#22c55e;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">Abrir no painel</a>
</div>`
  return { subject, text, html }
}

// Envio pelo Resend (https://resend.com). Sem chave configurada, não envia e não dá erro.
export async function sendEmail({ apiKey, from, to, subject, text, html, replyTo }, fetchImpl = fetch) {
  if (!apiKey || !to?.length) return { sent: false, reason: 'not-configured' }
  const res = await fetchImpl('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to, subject, text, html, ...(replyTo ? { reply_to: replyTo } : {}) }),
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    return { sent: false, reason: `http-${res.status}`, detail: detail.slice(0, 300) }
  }
  return { sent: true }
}

// Resposta ao usuário quando o suporte é resolvido: cartão no app (users/{uid}.supportReply) + push no celular
export async function notifyResolved({ fs, messaging, feedback, reply }) {
  if (!feedback?.uid) return { pushed: 0 }
  const text = String(reply || '').trim().slice(0, 500)
  const userRef = fs.doc(`users/${feedback.uid}`)
  await userRef.set({
    supportReply: {
      feedbackId: feedback.id,
      question: String(feedback.message || '').slice(0, 200),
      reply: text,
      at: FieldValue.serverTimestamp(),
      seen: false,
    },
  }, { merge: true })

  const tokens = (await userRef.get()).data()?.fcmTokens || []
  if (!messaging || tokens.length === 0) return { pushed: 0 }
  const result = await messaging.sendEachForMulticast({
    tokens,
    data: {
      title: 'Sua solicitação foi atendida ✅',
      body: text || 'Abra o Onlist para ver a resposta.',
      url: '/',
      tag: 'support',
    },
    webpush: { headers: { Urgency: 'normal', TTL: '604800' } },
  })
  return { pushed: result.successCount }
}
