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

// Reexporta as funções puras para manter os imports existentes
export { localDate, parsePrice, fmtDate, normalizePriceHistory } from './format.js'
