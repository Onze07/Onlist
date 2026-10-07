// Roda com: npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sendEmail, supportEmail } from '../api/_lib/support-core.js'

test('e-mail do suporte: assunto, link do painel e HTML escapado', () => {
  const m = supportEmail({ type: 'problema', email: 'ana@x.com', message: 'Não salva <script>' }, 'https://onlist.app/admin')
  assert.equal(m.subject, '[Onlist] Problema de ana@x.com')
  assert.ok(m.html.includes('&lt;script&gt;'))
  assert.ok(!m.html.includes('<script>'))
  assert.ok(m.text.includes('https://onlist.app/admin'))
})

test('envio: sem chave não envia; com chave chama o Resend com remetente, destino e resposta', async () => {
  assert.deepEqual(await sendEmail({ apiKey: '', to: ['a@x.com'] }), { sent: false, reason: 'not-configured' })
  let call
  const fakeFetch = async (url, opts) => { call = { url, opts }; return { ok: true } }
  const r = await sendEmail({ apiKey: 'k', from: 'Onlist <o@x.com>', to: ['eu@x.com'], subject: 's', text: 't', html: 'h', replyTo: 'ana@x.com' }, fakeFetch)
  assert.equal(r.sent, true)
  assert.equal(call.url, 'https://api.resend.com/emails')
  assert.equal(call.opts.headers.Authorization, 'Bearer k')
  const body = JSON.parse(call.opts.body)
  assert.deepEqual(body.to, ['eu@x.com'])
  assert.equal(body.reply_to, 'ana@x.com')
  const fail = await sendEmail({ apiKey: 'k', to: ['eu@x.com'] }, async () => ({ ok: false, status: 403, text: async () => 'domínio' }))
  assert.equal(fail.sent, false)
  assert.equal(fail.reason, 'http-403')
})
