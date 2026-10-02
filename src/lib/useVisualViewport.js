import { useEffect, useState } from 'react'

// Área visível da tela descontando o teclado (iOS/Android).
// Usado para manter folhas inferiores acima do teclado.
export function useVisualViewport() {
  const read = () => {
    const vv = window.visualViewport
    return vv ? { height: vv.height, offsetTop: vv.offsetTop } : { height: window.innerHeight, offsetTop: 0 }
  }
  const [viewport, setViewport] = useState(read)

  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const update = () => setViewport(read())
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
    }
  }, [])

  return viewport
}
