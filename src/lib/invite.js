// Convite por link: https://app/?convite=ABC234
// O código fica guardado até o usuário entrar (login e termos podem vir antes).
const KEY = 'pendingInvite'
const CODE_RE = /^[A-Z0-9]{6}$/

export function inviteLink(code) {
  return `${window.location.origin}/?convite=${encodeURIComponent(code)}`
}

export function inviteText(familyName, code) {
  return `Entre na nossa lista de compras "${familyName || 'da família'}" no Onlist:\n${inviteLink(code)}\n\nOu use o código: ${code}`
}

// Chamado uma vez ao abrir o app: guarda o código e limpa a barra de endereço
export function captureInviteFromUrl() {
  try {
    const url = new URL(window.location.href)
    const code = (url.searchParams.get('convite') || '').trim().toUpperCase()
    if (!code) return
    if (CODE_RE.test(code)) localStorage.setItem(KEY, code)
    url.searchParams.delete('convite')
    window.history.replaceState(null, '', url.pathname + url.search + url.hash)
  } catch { /* ignora */ }
}

export function getPendingInvite() {
  try { return localStorage.getItem(KEY) || '' } catch { return '' }
}

export function clearPendingInvite() {
  try { localStorage.removeItem(KEY) } catch { /* ignora */ }
}
