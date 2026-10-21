// Envia ao painel (/admin → Erros) as falhas que o usuário não vê: erro de tela,
// promessa sem tratamento, gravação que não subiu. Limitado para não virar spam.
import { auth, appCheckHeader } from '../firebase'

const MAX_PER_SESSION = 15
const seen = new Set()
let sent = 0
let queue = []
let timer = null

async function flush() {
  timer = null
  const batch = queue.splice(0, 20)
  if (!batch.length) return
  try {
    const idToken = await auth.currentUser?.getIdToken()
    if (!idToken) return
    await fetch('/api/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}`, ...(await appCheckHeader()) },
      body: JSON.stringify({ errors: batch }),
      keepalive: true,
    })
  } catch { /* sem internet: não insiste */ }
}

export function reportError(kind, error, extra = {}) {
  try {
    const message = String(error?.message || error || 'Erro').slice(0, 300)
    // Sem internet não é bug do app; e a mesma falha só uma vez por sessão
    if (!navigator.onLine) return
    const key = `${kind}|${message}`
    if (seen.has(key) || sent >= MAX_PER_SESSION) return
    seen.add(key)
    sent++
    queue.push({
      kind,
      message,
      detail: String(error?.stack || extra.detail || '').slice(0, 3000),
      path: `${location.pathname}${location.hash}`,
      appVersion: import.meta.env.VITE_APP_VERSION || null,
    })
    if (!timer) timer = setTimeout(flush, 2000)
  } catch { /* nunca quebrar o app por causa do registro */ }
}

let installed = false
export function installErrorReporter() {
  if (installed || typeof window === 'undefined') return
  installed = true
  window.addEventListener('error', e => {
    // Erro de carregar script/imagem de terceiros não tem mensagem útil
    if (!e.message) return
    reportError('tela', e.error || e.message, { detail: `${e.filename}:${e.lineno}:${e.colno}` })
  })
  window.addEventListener('unhandledrejection', e => reportError('promessa', e.reason))
  // Gravações em fila que o Firestore recusou (queueWrite)
  window.addEventListener('onlist:write-error', e => reportError('gravação', `Erro ao ${e.detail?.what}: ${e.detail?.message}`))
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && queue.length) flush() })
}
