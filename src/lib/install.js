import { useEffect, useState } from 'react'

// O Chrome/Android dispara beforeinstallprompt cedo; guardamos o evento desde o carregamento.
let deferredPrompt = null
const listeners = new Set()
const notify = () => listeners.forEach(fn => fn())

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault()
    deferredPrompt = e
    notify()
  })
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null
    notify()
  })
}

export function isStandalone() {
  return window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true
}

export function isIOS() {
  const ua = navigator.userAgent
  return /iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

export function useInstall() {
  const [, force] = useState(0)
  useEffect(() => {
    const fn = () => force(n => n + 1)
    listeners.add(fn)
    return () => listeners.delete(fn)
  }, [])

  const standalone = isStandalone()
  return {
    standalone,
    ios: !standalone && isIOS(),
    canPrompt: !standalone && !!deferredPrompt,
    async promptInstall() {
      if (!deferredPrompt) return false
      deferredPrompt.prompt()
      const { outcome } = await deferredPrompt.userChoice
      deferredPrompt = null
      notify()
      return outcome === 'accepted'
    },
  }
}
