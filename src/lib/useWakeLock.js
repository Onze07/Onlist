import { useEffect } from 'react'

// Mantém a tela ligada enquanto `active` (Screen Wake Lock API). Sem suporte, não faz nada.
export function useWakeLock(active) {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return
    let lock = null
    let cancelled = false
    const request = async () => {
      try {
        lock = await navigator.wakeLock.request('screen')
      } catch { /* bateria fraca, aba oculta etc. */ }
    }
    const onVisible = () => { if (!cancelled && document.visibilityState === 'visible') request() }
    request()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisible)
      lock?.release().catch(() => {})
    }
  }, [active])
}
