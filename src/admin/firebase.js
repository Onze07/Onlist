import { initializeApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider } from 'firebase/auth'
import { firebaseConfig } from '../firebaseConfig'

// Instância separada ("admin"): o login do painel não se mistura com o login do app no mesmo navegador
const app = initializeApp(firebaseConfig, 'admin')
export const adminAuth = getAuth(app)
export const adminProvider = new GoogleAuthProvider()
// Sempre deixa escolher a conta (ex.: usar um e-mail só para administrar)
adminProvider.setCustomParameters({ prompt: 'select_account' })

export async function adminApi(action, payload = {}) {
  const idToken = await adminAuth.currentUser?.getIdToken()
  if (!idToken) throw new Error('Faça login novamente')
  const res = await fetch('/api/admin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ action, ...payload }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || 'Erro de conexão')
  return data
}
