// Tema: 'system' (padrão, segue o celular), 'light' ou 'dark'. Fica salvo neste aparelho.
// O index.html aplica antes de carregar o app (sem piscar escuro → claro).
const KEY = 'theme'
const media = typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: light)') : null

export function getTheme() {
  try { return localStorage.getItem(KEY) || 'system' } catch { return 'system' }
}

function resolved(theme) {
  return theme === 'system' ? (media?.matches ? 'light' : 'dark') : theme
}

export function applyTheme(theme = getTheme()) {
  const mode = resolved(theme)
  document.documentElement.dataset.theme = mode
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', mode === 'light' ? '#f9fafb' : '#111827')
}

export function setTheme(theme) {
  try { localStorage.setItem(KEY, theme) } catch { /* ignora */ }
  applyTheme(theme)
  window.dispatchEvent(new Event('onlist:theme'))
}

// Celular trocou de claro/escuro: acompanha quando o tema é "sistema"
media?.addEventListener?.('change', () => { if (getTheme() === 'system') applyTheme('system') })
