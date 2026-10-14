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

// Variação de 3x ou mais entre duas compras: quase sempre preço lançado errado
// (caixa no lugar da unidade, vírgula trocada). Fica fora do "subiram/caíram" e pede conferência.
export const OUTLIER_RATIO = 3

// Variação entre as duas últimas compras do item
export function trend(history = []) {
  const purchases = normalizePriceHistory(history)
  if (purchases.length < 2) return null
  const last = purchases[purchases.length - 1]
  const prev = purchases[purchases.length - 2]
  const diff = last.price - prev.price
  const ratio = prev.price ? last.price / prev.price : 1
  const outlier = ratio >= OUTLIER_RATIO || ratio <= 1 / OUTLIER_RATIO
  return { last, prev, diff, pct: prev.price ? diff / prev.price : 0, outlier }
}

const dayShift = (date, days) => {
  const d = new Date(`${date}T12:00:00`)
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Tira do histórico o preço que veio de uma compra (mesmo preço, mercado e data).
// Sem nada na data exata, aceita 1 dia de diferença (compra finalizada perto da meia-noite).
export function withoutPurchase(history = [], { price, mercado, date }) {
  const list = Array.isArray(history) ? history : []
  const same = h => Math.abs(Number(h?.price) - Number(price)) < 0.005 && marketKey(h?.mercado) === marketKey(mercado)
  for (const dates of [[date], [dayShift(date, -1), dayShift(date, 1)]]) {
    const removed = list.filter(h => same(h) && dates.includes(h.date))
    if (removed.length) return { history: list.filter(h => !removed.includes(h)), removed }
  }
  return { history: list, removed: [] }
}

// Último preço pago (compra mais recente) ou null
export function lastPriceOf(history = []) {
  const list = normalizePriceHistory(history)
  return list.length ? Number(list[list.length - 1].price) : null
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

// Histórico de preço guardado no item do catálogo. Acima do limite, o documento cresce à toa
// (o Firestore aceita até 1 MB por documento), então só os mais recentes ficam.
export const PRICE_HISTORY_MAX = 60

// Retorna null quando cabe (use arrayUnion, que não perde gravações simultâneas)
// ou a lista já cortada com o preço novo no fim.
export function trimPriceHistory(history = [], entry, max = PRICE_HISTORY_MAX) {
  const current = normalizePriceHistory(history)
  if (current.length < max) return null
  return [...current.slice(-(max - 1)), entry]
}
