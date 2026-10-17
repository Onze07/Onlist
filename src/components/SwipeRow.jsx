import { useRef, useState } from 'react'
import { IconCheck, IconTrash, IconUndo } from './Icon'

const THRESHOLD = 80 // px para confirmar o gesto
const MAX = 140

// Arrastar o item para o lado: direita = pegar (ou devolver), esquerda = remover.
// Só vale gesto horizontal; rolagem vertical continua normal (touch-action: pan-y).
export default function SwipeRow({ children, onSwipeRight, onSwipeLeft, rightLabel = 'Peguei', checked = false }) {
  const [dx, setDx] = useState(0)
  const [dragging, setDragging] = useState(false)
  const start = useRef(null)
  const mode = useRef(null) // null | 'h' | 'v'
  const swallowClick = useRef(false)

  function down(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    start.current = { x: e.clientX, y: e.clientY, id: e.pointerId }
    mode.current = null
  }

  function move(e) {
    if (!start.current || start.current.id !== e.pointerId) return
    const mx = e.clientX - start.current.x
    const my = e.clientY - start.current.y
    if (!mode.current) {
      if (Math.abs(mx) > 10 && Math.abs(mx) > Math.abs(my) * 1.3) {
        mode.current = 'h'
        setDragging(true)
        e.currentTarget.setPointerCapture?.(e.pointerId)
      } else if (Math.abs(my) > 10) {
        mode.current = 'v'
        start.current = null
        return
      } else return
    }
    if (mode.current === 'h') setDx(Math.max(-MAX, Math.min(MAX, mx)))
  }

  function up() {
    if (mode.current === 'h') {
      swallowClick.current = true
      setTimeout(() => { swallowClick.current = false }, 50)
      if (dx > THRESHOLD) onSwipeRight?.()
      else if (dx < -THRESHOLD) onSwipeLeft?.()
    }
    start.current = null
    mode.current = null
    setDragging(false)
    setDx(0)
  }

  const passed = Math.abs(dx) > THRESHOLD
  return (
    <div className="relative overflow-hidden">
      {/* Fundo revelado pelo gesto */}
      {dx !== 0 && (
        <div className={`absolute inset-0 flex items-center px-5 text-sm font-medium ${dx > 0
          ? `justify-start ${passed ? 'bg-green-600 text-white' : 'bg-green-600/30 text-green-200'}`
          : `justify-end ${passed ? 'bg-red-600 text-white' : 'bg-red-600/30 text-red-200'}`}`} aria-hidden="true">
          {dx > 0
            ? <span className="flex items-center gap-2">{checked ? <IconUndo size={18} /> : <IconCheck size={18} />} {checked ? 'Devolver' : rightLabel}</span>
            : <span className="flex items-center gap-2">Remover <IconTrash size={18} /></span>}
        </div>
      )}
      <div
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
        onClickCapture={e => { if (swallowClick.current) { e.stopPropagation(); e.preventDefault() } }}
        className={`relative bg-gray-900 ${dragging ? '' : 'transition-transform duration-200'}`}
        style={{ transform: dx ? `translateX(${dx}px)` : undefined, touchAction: 'pan-y' }}>
        {children}
      </div>
    </div>
  )
}
