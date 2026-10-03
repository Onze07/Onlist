// Períodos dos relatórios. Intervalos são [start, end) em horário local.

export const PRESETS = [
  { id: 'month', label: 'Este mês' },
  { id: 'lastMonth', label: 'Mês passado' },
  { id: '3m', label: '3 meses' },
  { id: '12m', label: '12 meses' },
  { id: 'custom', label: 'Personalizado' },
]

function parseLocal(iso) {
  const [y, m, d] = String(iso).split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function rangeFor(preset, now = new Date(), custom = {}) {
  const y = now.getFullYear()
  const m = now.getMonth()
  switch (preset) {
    case 'lastMonth': return { start: new Date(y, m - 1, 1), end: new Date(y, m, 1) }
    case '3m': return { start: new Date(y, m - 2, 1), end: new Date(y, m + 1, 1) }
    case '12m': return { start: new Date(y, m - 11, 1), end: new Date(y, m + 1, 1) }
    case 'custom': {
      if (!custom.from || !custom.to) return rangeFor('month', now)
      const start = parseLocal(custom.from)
      const end = parseLocal(custom.to)
      end.setDate(end.getDate() + 1)
      return start < end ? { start, end } : { start: end, end: start }
    }
    default: return { start: new Date(y, m, 1), end: new Date(y, m + 1, 1) }
  }
}

// Período anterior de mesmo tamanho (meses inteiros quando o período é de meses inteiros)
export function previousRange({ start, end }) {
  if (start.getDate() === 1 && end.getDate() === 1) {
    const months = (end.getFullYear() - start.getFullYear()) * 12 + end.getMonth() - start.getMonth()
    return { start: new Date(start.getFullYear(), start.getMonth() - months, 1), end: new Date(start) }
  }
  const days = Math.round((end - start) / 86400000)
  const prevStart = new Date(start)
  prevStart.setDate(prevStart.getDate() - days)
  return { start: prevStart, end: new Date(start) }
}

export function toDate(ts) {
  if (!ts) return null
  return ts.toDate ? ts.toDate() : new Date(ts)
}

export function inRange(ts, { start, end }) {
  const d = toDate(ts)
  return !!d && d >= start && d < end
}

export function rangeDays({ start, end }) {
  return Math.round((end - start) / 86400000)
}
