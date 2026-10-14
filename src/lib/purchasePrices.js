// Preços no catálogo ligados às compras: excluir uma compra tira os preços que ela lançou.
// Usa arrayRemove/arrayUnion para não apagar um preço gravado ao mesmo tempo por outra pessoa.
import { arrayRemove, arrayUnion, deleteField, doc, getDoc, writeBatch } from 'firebase/firestore'
import { db } from '../firebase'
import { localDate } from './format.js'
import { lastPriceOf, withoutPurchase } from './prices.js'

function recordDate(record) {
  const d = record.createdAt?.toDate?.()
  return localDate(d || new Date())
}

// Exclui o registro e os preços dele. Devolve a função "Desfazer".
export async function deletePurchase(familyId, record) {
  const { id, ...data } = record
  const historyRef = doc(db, 'families', familyId, 'history', id)
  const date = recordDate(record)

  // Mesmo produto pode aparecer mais de uma vez na compra
  const byKey = new Map()
  for (const item of record.items || []) {
    if (!(Number(item.pricePerUnit) > 0) || !item.name) continue
    const key = String(item.name).toLowerCase()
    if (!byKey.has(key)) byKey.set(key, [])
    byKey.get(key).push(Number(item.pricePerUnit))
  }

  // Lê do cache local quando offline (persistentLocalCache)
  const changes = []
  await Promise.all([...byKey].map(async ([key, prices]) => {
    const ref = doc(db, 'families', familyId, 'catalog', key)
    const snap = await getDoc(ref).catch(() => null)
    if (!snap?.exists()) return
    const current = snap.data()
    let history = current.priceHistory || []
    const removed = []
    for (const price of prices) {
      const r = withoutPurchase(history, { price, mercado: record.mercado, date })
      history = r.history
      removed.push(...r.removed)
    }
    if (removed.length) changes.push({ ref, removed, lastPrice: current.lastPrice ?? null, nextLast: lastPriceOf(history) })
  }))

  const batch = writeBatch(db)
  batch.delete(historyRef)
  for (const c of changes) {
    batch.update(c.ref, { priceHistory: arrayRemove(...c.removed), lastPrice: c.nextLast ?? deleteField() })
  }
  const committed = batch.commit()

  const undo = () => {
    const b = writeBatch(db)
    b.set(historyRef, data)
    for (const c of changes) {
      b.update(c.ref, { priceHistory: arrayUnion(...c.removed), ...(c.lastPrice != null ? { lastPrice: c.lastPrice } : {}) })
    }
    return b.commit()
  }
  return { committed, undo, pricesRemoved: changes.reduce((n, c) => n + c.removed.length, 0) }
}

// Remove um preço do histórico de um produto (lançado errado). Devolve a função "Desfazer".
export function deletePriceEntry(familyId, item, entry) {
  const ref = doc(db, 'families', familyId, 'catalog', item.id)
  const rest = (item.priceHistory || []).filter(h => h !== entry)
  const nextLast = lastPriceOf(rest)
  const committed = writeBatch(db)
    .update(ref, { priceHistory: arrayRemove(entry), lastPrice: nextLast ?? deleteField() })
    .commit()
  const undo = () => writeBatch(db)
    .update(ref, { priceHistory: arrayUnion(entry), ...(item.lastPrice != null ? { lastPrice: item.lastPrice } : {}) })
    .commit()
  return { committed, undo }
}
