import { useEffect, useState } from 'react'

// QR code do link de convite. A biblioteca só é baixada quando o QR é aberto.
export default function InviteQr({ value, size = 200 }) {
  const [svg, setSvg] = useState('')
  useEffect(() => {
    let alive = true
    import('qrcode')
      .then(QR => QR.toString(value, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#111827', light: '#ffffff' } }))
      .then(s => { if (alive) setSvg(s) })
      .catch(() => {})
    return () => { alive = false }
  }, [value])
  return (
    <div className="bg-white rounded-2xl p-3 mx-auto [&>svg]:w-full [&>svg]:h-full" style={{ width: size, height: size }}
      role="img" aria-label="QR code do convite"
      dangerouslySetInnerHTML={svg ? { __html: svg } : undefined} />
  )
}
