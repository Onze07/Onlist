import { useRef, useState } from 'react'

// Botão de ação secundária: pílula com borda, fundo e ícone — deixa claro que é tocável.
// tone: 'default' | 'danger' | 'accent'
// Sem children vira botão redondo só com ícone (label vai em aria-label/title).
// Segurar o botão mostra o nome dele num balão (no celular não existe "passar o mouse").
export default function ActionChip({ icon, children, label, onClick, tone = 'default', disabled, className = '', tipAlign = 'center' }) {
  const tones = {
    default: 'bg-gray-800 border-gray-700 text-gray-200 active:bg-gray-700',
    danger: 'bg-gray-800 border-red-500/30 text-red-300 active:bg-red-500/10',
    accent: 'bg-green-500/10 border-green-500/40 text-green-300 active:bg-green-500/20',
  }
  const [showLabel, setShowLabel] = useState(false)
  const timer = useRef(null)
  const held = useRef(false)

  function down() {
    if (!label) return
    held.current = false
    clearTimeout(timer.current)
    timer.current = setTimeout(() => { held.current = true; setShowLabel(true) }, 450)
  }
  function up() {
    clearTimeout(timer.current)
    if (held.current) setTimeout(() => setShowLabel(false), 1400)
  }

  return (
    <span className="relative inline-flex flex-shrink-0">
      <button type="button" disabled={disabled} aria-label={label} title={label}
        onPointerDown={down} onPointerUp={up} onPointerLeave={up} onPointerCancel={up}
        onContextMenu={e => e.preventDefault()}
        onClick={e => { if (held.current) { held.current = false; e.preventDefault(); return } onClick?.(e) }}
        className={`inline-flex items-center justify-center gap-1.5 whitespace-nowrap text-xs font-medium rounded-full border transition-colors select-none [-webkit-touch-callout:none] disabled:opacity-40 ${children ? 'px-3 h-[40px]' : 'w-[40px] h-[40px]'} ${tones[tone]} ${className}`}>
        {icon}
        {children}
      </button>
      {showLabel && (
        <span role="tooltip" className={`toast-in absolute top-full mt-2 ${tipAlign === 'right' ? 'right-0' : tipAlign === 'left' ? 'left-0' : 'left-1/2 -translate-x-1/2'} z-30 whitespace-nowrap bg-gray-100 text-[color:var(--color-gray-900)] text-xs font-medium px-2.5 py-1.5 rounded-lg shadow-xl pointer-events-none`}>
          {label}
        </span>
      )}
    </span>
  )
}
