import { auth } from '../firebase'

// POST nas funções da Vercel (/api/*) com o login do usuário
export async function apiPost(path, payload) {
  const idToken = await auth.currentUser?.getIdToken()
  if (!idToken) throw new Error('Faça login novamente')
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
    body: JSON.stringify(payload),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || 'Erro de conexão')
  return data
}
