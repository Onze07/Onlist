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
