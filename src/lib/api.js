import { auth } from '../firebase'
import { reportError } from './errorReporter'

// POST nas funções da Vercel (/api/*) com o login do usuário
// freshToken: força um token novo (ex.: logo depois de entrar de novo com o Google)
export async function apiPost(path, payload, { freshToken = false } = {}) {
  const idToken = await auth.currentUser?.getIdToken(freshToken)
  if (!idToken) throw new Error('Faça login novamente')
  let res
  try {
    res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
      body: JSON.stringify(payload),
    })
  } catch (e) {
    reportError('servidor', `Sem resposta de ${path}: ${e.message}`)
    throw new Error(navigator.onLine ? 'Erro de conexão. Tente de novo.' : 'Sem internet. Tente quando a conexão voltar.')
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    // Função que caiu sem responder JSON (timeout, falha da plataforma) não chega ao log do servidor
    if (res.status >= 500 && !data.error) reportError('servidor', `${path} respondeu ${res.status}`)
    // Mantém o corpo da resposta (ex.: reason/retryLater da leitura da nota)
    const err = new Error(data.error || 'Erro de conexão')
    err.status = res.status
    err.data = data
    throw err
  }
  return data
}
