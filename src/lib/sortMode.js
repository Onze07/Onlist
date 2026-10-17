import { useEffect, useState } from 'react'
import { orderCategories } from './categories.js'

// Ordem de exibição da Lista e do Catálogo: 'category' (categorias, as com mais itens primeiro)
// ou 'alpha' (A–Z, sem separar por categoria). Fica salvo neste aparelho e vale para as duas telas.
const KEY = 'sortMode'

export function getSortMode() {
  try { return localStorage.getItem(KEY) === 'alpha' ? 'alpha' : 'category' } catch { return 'category' }
}

export function useSortMode() {
  const [mode, setMode] = useState(getSortMode)
  useEffect(() => {
    const fn = () => setMode(getSortMode())
    window.addEventListener('onlist:sort', fn)
    return () => window.removeEventListener('onlist:sort', fn)
  }, [])
  function change(next) {
    try { localStorage.setItem(KEY, next) } catch { /* ignora */ }
    setMode(next)
    window.dispatchEvent(new Event('onlist:sort'))
  }
  return [mode, change]
}

const byName = (a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR', { sensitivity: 'base' })

// Agrupa para exibir. Categorias: mais itens primeiro (empate: ordem padrão das categorias).
// A–Z: um grupo só, sem cabeçalho (cat = null). sortInGroup ordena dentro de cada categoria.
export function groupForDisplay(items, mode, sortInGroup = list => [...list].sort(byName)) {
  if (mode === 'alpha') return [{ cat: null, items: [...items].sort(byName) }]
  const groups = {}
  for (const item of items) {
    const cat = item.category || 'Outros'
    ;(groups[cat] ||= []).push(item)
  }
  const base = orderCategories(Object.keys(groups))
  return [...base]
    .sort((a, b) => groups[b].length - groups[a].length || base.indexOf(a) - base.indexOf(b))
    .map(cat => ({ cat, items: sortInGroup(groups[cat]) }))
}
