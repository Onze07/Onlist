import { useEffect, useRef, useState } from 'react'

// Lê QR code pela câmera traseira. Chama onResult(texto) uma única vez.
export default function QrScanner({ onResult }) {
  const videoRef = useRef(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let stream
    let stopped = false
    let timer
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d', { willReadFrequently: true })

    async function start() {
      try {
        const { default: jsQR } = await import('jsqr')
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
        const video = videoRef.current
        if (!video || stopped) return
        video.srcObject = stream
        await video.play()
        const tick = () => {
          if (stopped) return
          if (video.readyState >= 2 && video.videoWidth) {
            const scale = Math.min(1, 720 / video.videoWidth)
            canvas.width = video.videoWidth * scale
            canvas.height = video.videoHeight * scale
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
            const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
            const code = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' })
            if (code?.data) {
              stopped = true
              onResult(code.data)
              return
            }
          }
          timer = setTimeout(tick, 200)
        }
        tick()
      } catch (e) {
        setError(e.name === 'NotAllowedError'
          ? 'Permita o uso da câmera nas configurações do aparelho, ou cole o link da nota abaixo.'
          : 'Não foi possível abrir a câmera. Cole o link da nota abaixo.')
      }
    }
    start()
    return () => {
      stopped = true
      clearTimeout(timer)
      stream?.getTracks().forEach(t => t.stop())
    }
  }, [onResult])

  if (error) return <p className="text-amber-300 text-sm bg-amber-500/10 rounded-xl px-3 py-3">{error}</p>

  return (
    <div className="relative rounded-2xl overflow-hidden bg-black aspect-square">
      <video ref={videoRef} playsInline muted className="w-full h-full object-cover" />
      <div className="absolute inset-8 border-2 border-white/70 rounded-2xl pointer-events-none" />
      <p className="absolute bottom-2 inset-x-0 text-center text-white/80 text-xs">Aponte para o QR code da nota</p>
    </div>
  )
}
