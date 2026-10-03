import { normalizePriceHistory } from './format.js'

const NOT_INFORMED = 'não informado'

// "  Irmãos  Gonçalves " e "irmãos gonçalves" são o mesmo mercado
export function marketKey(name) {
  return String(name || '').trim().replace(/\s+/g, ' ').toLowerCase()
}

// Último preço pago em cada mercado, do mais barato para o mais caro
export function latestByMarket(history = []) {
  const map = new Map()
  for (const h of history) {
    if (!h?.mercado || !h.date || !(Number(h.price) > 0)) continue
    const key = marketKey(h.mercado)
    if (key === NOT_INFORMED) continue
    const current = map.get(key)
    if (!current || h.date >= current.date) {
      map.set(key, { key, mercado: h.mercado.trim().replace(/\s+/g, ' '), price: Number(h.price), date: h.date })
    }
  }
  return [...map.values()].sort((a, b) => a.price - b.price)
}

export function cheapest(history = []) {
  return latestByMarket(history)[0] || null
}

// Variação entre as duas últimas compras do item
export function trend(history = []) {
  const purchases = normalizePriceHistory(history)
  if (purchases.length < 2) return null
  const last = purchases[purchases.length - 1]
  const prev = purchases[purchases.length - 2]
  const diff = last.price - prev.price
  return { last, prev, diff, pct: prev.price ? diff / prev.price : 0 }
}

// Quanto a lista custaria em cada mercado, pelo último preço pago lá.
// Ordena por cobertura (mais itens com preço) e depois pelo total.
export function compareList(entries = [], catalog = {}) {
  const markets = new Map()
  const names = entries.map(e => e.name)
  for (const entry of entries) {
    const qty = Number(entry.qty) || 1
    const history = catalog[String(entry.name || '').toLowerCase()]?.priceHistory || []
    for (const m of latestByMarket(history)) {
      if (!markets.has(m.key)) markets.set(m.key, { key: m.key, mercado: m.mercado, total: 0, covered: [] })
      const row = markets.get(m.key)
      row.total += m.price * qty
      row.covered.push(entry.name)
    }
  }
  return [...markets.values()]
    .map(r => ({
      ...r,
      total: Math.round(r.total * 100) / 100,
      coveredCount: r.covered.length,
      missing: names.filter(n => !r.covered.includes(n)),
    }))
    .sort((a, b) => b.coveredCount - a.coveredCount || a.total - b.total)
}
