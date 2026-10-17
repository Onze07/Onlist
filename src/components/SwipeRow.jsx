import { useRef, useState } from 'react'
import { IconCheck, IconTrash, IconUndo } from './Icon'

const THRESHOLD = 80 // px para confirmar o gesto
const MAX = 140

const LONG_PRESS_MS = 400

// Arrastar o item para o lado: direita = pegar (ou devolver), esquerda = remover.
// Segurar parado (~0,4 s) e arrastar = mudar a ordem/categoria (onLongPress/onDragMove/onDragEnd).
// Só vale gesto horizontal; rolagem vertical continua normal (touch-action: pan-y).
export default function SwipeRow({ children, onSwipeRight, onSwipeLeft, rightLabel = 'Peguei', checked = false, onLongPress, onDragMove, onDragEnd }) {
  const [dx, setDx] = useState(0)
  const [dragging, setDragging] = useState(false)
  const start = useRef(null)
  const mode = useRef(null) // null | 'h' | 'v' | 'drag'
  const swallowClick = useRef(false)
  const pressTimer = useRef(null)
  const target = useRef(null)

  function cancelPress() {
    clearTimeout(pressTimer.current)
    pressTimer.current = null
  }

  function down(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    start.current = { x: e.clientX, y: e.clientY, id: e.pointerId }
    mode.current = null
    target.current = e.currentTarget
    if (onLongPress) {
      const { clientX, clientY, pointerId } = e
      pressTimer.current = setTimeout(() => {
        pressTimer.current = null
        if (mode.current || !start.current) return
        mode.current = 'drag'
        target.current?.setPointerCapture?.(pointerId)
        onLongPress(clientX, clientY)
      }, LONG_PRESS_MS)
    }
  }

  function move(e) {
    if (!start.current || start.current.id !== e.pointerId) return
    if (mode.current === 'drag') { onDragMove?.(e.clientX, e.clientY); return }
    const mx = e.clientX - start.current.x
    const my = e.clientY - start.current.y
    if (Math.abs(mx) > 8 || Math.abs(my) > 8) cancelPress()
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
    // Só abre para o lado que tem ação
    if (mode.current === 'h') setDx(Math.max(onSwipeLeft ? -MAX : 0, Math.min(onSwipeRight ? MAX : 0, mx)))
  }

  function up() {
    cancelPress()
    if (mode.current === 'drag') {
      swallowClick.current = true
      setTimeout(() => { swallowClick.current = false }, 50)
      onDragEnd?.()
    }
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
        onContextMenu={e => onLongPress && e.preventDefault()}
        className={`relative bg-gray-900 select-none [-webkit-touch-callout:none] ${dragging ? '' : 'transition-transform duration-200'}`}
        style={{ transform: dx ? `translateX(${dx}px)` : undefined, touchAction: 'pan-y' }}>
        {children}
      </div>
    </div>
  )
}
