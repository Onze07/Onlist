import { useEffect, useRef, useState } from 'react'

// Segurar e arrastar um item da lista. Durante o arraste a página não rola com o dedo
// (rola sozinha perto das bordas) e o destino é o item/categoria sob o dedo.
export function useListDrag(onDrop) {
  const [drag, setDrag] = useState(null) // { id, dy, target: { cat, beforeId } }
  const ref = useRef(null)
  const onDropRef = useRef(onDrop)
  onDropRef.current = onDrop

  useEffect(() => {
    if (!drag) return
    const block = e => e.preventDefault()
    document.addEventListener('touchmove', block, { passive: false })
    // Rolagem automática perto do topo/fundo da tela
    const timer = setInterval(() => {
      const s = ref.current
      if (!s) return
      const edge = s.y < 140 ? -1 : s.y > window.innerHeight - 170 ? 1 : 0
      if (edge) {
        window.scrollBy(0, edge * 10)
        s.scrolled += edge * 10
        update(s.x, s.y)
      }
    }, 16)
    return () => { document.removeEventListener('touchmove', block); clearInterval(timer) }
  }, [drag?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  function targetAt(x, y, id) {
    const els = document.elementsFromPoint(x, y)
    for (const el of els) {
      const row = el.closest?.('[data-entry-id]')
      if (row && row.dataset.entryId !== id) {
        const r = row.getBoundingClientRect()
        const after = y > r.top + r.height / 2
        const next = after ? row.dataset.nextId || null : row.dataset.entryId
        return { cat: row.dataset.cat, beforeId: next }
      }
      const header = el.closest?.('[data-cat-header]')
      if (header) return { cat: header.dataset.catHeader, beforeId: header.dataset.firstId || null }
    }
    return ref.current?.target || null
  }

  function update(x, y) {
    const s = ref.current
    if (!s) return
    s.x = x; s.y = y
    s.target = targetAt(x, y, s.id) || s.target
    setDrag({ id: s.id, dy: y - s.startY + s.scrolled, target: s.target })
  }

  function start(id, cat, x, y) {
    navigator.vibrate?.(15)
    ref.current = { id, startY: y, x, y, scrolled: 0, target: { cat, beforeId: null, initial: true } }
    setDrag({ id, dy: 0, target: null })
  }

  function end() {
    const s = ref.current
    ref.current = null
    setDrag(null)
    if (s?.target && !s.target.initial) onDropRef.current?.(s.id, s.target)
  }

  return { drag, start, move: update, end }
}
