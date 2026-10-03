import { useEffect, useState } from 'react'

// Online/offline do aparelho
export function useOnline() {
  const [online, setOnline] = useState(() => navigator.onLine)
  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])
  return online
}

// Erros de gravação disparados por queueWrite
export function useWriteErrors() {
  const [error, setError] = useState(null)
  useEffect(() => {
    let timer
    const fn = e => {
      setError(e.detail)
      clearTimeout(timer)
      timer = setTimeout(() => setError(null), 6000)
    }
    window.addEventListener('onlist:write-error', fn)
    return () => { window.removeEventListener('onlist:write-error', fn); clearTimeout(timer) }
  }, [])
  return error
}
