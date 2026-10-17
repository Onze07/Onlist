// Avisos do app (toast) e confirmações, no lugar de alert()/confirm() do navegador.
// Funciona fora do React: qualquer arquivo chama toast(), showError() ou ask().
import { reportError } from './errorReporter'

let state = { toasts: [], dialog: null }
const listeners = new Set()
let seq = 0

function set(next) {
  state = { ...state, ...next }
  listeners.forEach(fn => fn(state))
}

export function subscribe(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
export const getState = () => state

export function dismiss(id) {
  set({ toasts: state.toasts.filter(t => t.id !== id) })
}

// tone: 'ok' | 'error' | 'info'. action: { label, run } (ex.: Desfazer)
export function toast(message, { tone = 'info', action, duration } = {}) {
  const id = ++seq
  const t = { id, message, tone, action }
  // Um aviso por vez: o novo substitui o anterior (tocar vários itens seguidos não empilha)
  set({ toasts: [t] })
  const ms = duration ?? (action ? 6000 : tone === 'error' ? 7000 : 4000)
  setTimeout(() => dismiss(id), ms)
  return id
}

// Código curto para o usuário informar ao suporte (aparece no painel em Erros → detalhe)
const newRef = () => Math.random().toString(36).slice(2, 7).toUpperCase()

const FIRESTORE_MESSAGES = {
  'permission-denied': 'Você não tem permissão para isso. Se mudou de família agora, feche e abra o app.',
  'unavailable': 'Sem conexão com o servidor. Tente de novo em instantes.',
  'deadline-exceeded': 'O servidor demorou para responder. Tente de novo.',
  'resource-exhausted': 'Muitas ações seguidas. Aguarde um pouco.',
  'not-found': 'Isso já foi removido por outra pessoa da família.',
  'auth/network-request-failed': 'Sem internet. Tente quando a conexão voltar.',
  'auth/too-many-requests': 'Muitas tentativas. Aguarde alguns minutos.',
  'auth/popup-blocked': 'O navegador bloqueou a janela do Google. Permita pop-ups e tente de novo.',
}
// Fechar a janela de login não é erro
const SILENT = new Set(['auth/popup-closed-by-user', 'auth/cancelled-popup-request', 'auth/user-cancelled'])

// Mensagem para pessoas, nunca "FirebaseError: ..."
export function friendlyMessage(e, what) {
  if (!navigator.onLine) return 'Sem internet. Tente quando a conexão voltar.'
  const code = e?.code || ''
  if (FIRESTORE_MESSAGES[code]) return FIRESTORE_MESSAGES[code]
  // Erros do nosso servidor (/api) já vêm escritos para o usuário
  if (e?.status && e.status < 500 && e.message) return e.message
  return what ? `Não foi possível ${what}. Tente de novo.` : 'Algo deu errado. Tente de novo.'
}

export function showError(e, what) {
  if (SILENT.has(e?.code)) return
  const message = friendlyMessage(e, what)
  const known = !!FIRESTORE_MESSAGES[e?.code] || (e?.status && e.status < 500) || !navigator.onLine
  if (known) return toast(message, { tone: 'error' })
  // Falha inesperada: registra para o painel com um código que a pessoa pode citar no suporte
  const ref = newRef()
  reportError('aviso', e?.message || String(e), { detail: `ref ${ref} · ${what || ''}\n${e?.stack || ''}` })
  return toast(`${message} (código ${ref})`, { tone: 'error' })
}

// Confirmação: resolve true/false. confirm = verbo da ação ("Excluir lista")
export function ask({ title, message = '', confirm = 'Confirmar', cancel = 'Cancelar', danger = false }) {
  return new Promise(resolve => {
    // true = confirmou, false = "cancelar", null = fechou sem escolher (fora/Esc)
    const close = value => { set({ dialog: null }); resolve(value) }
    set({ dialog: { title, message, confirm, cancel, danger, close } })
  })
}

// Gravações em fila que o Firestore recusou (queueWrite): avisa a pessoa
if (typeof window !== 'undefined') {
  window.addEventListener('onlist:write-error', e => {
    toast(`Não foi possível ${e.detail?.what || 'salvar'}. Tente de novo.`, { tone: 'error' })
  })
}
