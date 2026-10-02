import { writeBatch } from 'firebase/firestore'
import { db } from '../firebase'

// Firestore aceita até 500 operações por batch
const BATCH_LIMIT = 450

// ops: lista de funções (batch) => void
export async function commitInChunks(ops) {
  for (let i = 0; i < ops.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db)
    ops.slice(i, i + BATCH_LIMIT).forEach(op => op(batch))
    await batch.commit()
  }
}

// Data local (YYYY-MM-DD). toISOString usa UTC e avança o dia após 21h no Brasil.
export function localDate(d = new Date()) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// Aceita "5,50" e "5.50"
export function parsePrice(value) {
  const n = parseFloat(String(value).replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}

// Histórico de preços sem repetição:
// - por dia, se houver registros com mercado (compra finalizada), mantém um por mercado
// - senão, mantém só o último valor do dia (edições do item antes da compra)
export function normalizePriceHistory(history = []) {
  const byDate = new Map()
  for (const h of history) {
    if (!h?.date || !(Number(h.price) > 0)) continue
    if (!byDate.has(h.date)) byDate.set(h.date, [])
    byDate.get(h.date).push(h)
  }
  const result = []
  for (const date of [...byDate.keys()].sort()) {
    const entries = byDate.get(date)
    const withMarket = entries.filter(h => h.mercado)
    if (withMarket.length) {
      const perMarket = new Map()
      for (const h of withMarket) perMarket.set(h.mercado, h)
      result.push(...perMarket.values())
    } else {
      result.push(entries[entries.length - 1])
    }
  }
  return result
}
