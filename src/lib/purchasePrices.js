// Preços no catálogo ligados às compras: excluir uma compra tira os preços que ela lançou.
// Usa arrayRemove/arrayUnion para não apagar um preço gravado ao mesmo tempo por outra pessoa.
import { arrayRemove, arrayUnion, deleteField, doc, getDoc, writeBatch } from 'firebase/firestore'
import { db } from '../firebase'
import { lastPriceOf, pricesOfPurchase } from './prices.js'

// Exclui o registro e os preços dele. Devolve a função "Desfazer".
export async function deletePurchase(familyId, record) {
  const { id, ...data } = record
  const historyRef = doc(db, 'families', familyId, 'history', id)

  // Lê do cache local quando offline (persistentLocalCache)
  const keys = [...new Set((record.items || []).filter(i => i.name).map(i => String(i.name).toLowerCase()))]
  const catalog = {}
  await Promise.all(keys.map(async key => {
    const snap = await getDoc(doc(db, 'families', familyId, 'catalog', key)).catch(() => null)
    if (snap?.exists()) catalog[key] = snap.data()
  }))
  const changes = pricesOfPurchase(record, catalog).map(c => ({
    ...c, ref: doc(db, 'families', familyId, 'catalog', c.key), prevLast: catalog[c.key].lastPrice ?? null,
  }))

  const batch = writeBatch(db)
  batch.delete(historyRef)
  for (const c of changes) {
    batch.update(c.ref, { priceHistory: arrayRemove(...c.removed), lastPrice: c.lastPrice ?? deleteField() })
  }
  const committed = batch.commit()

  const undo = () => {
    const b = writeBatch(db)
    b.set(historyRef, data)
    for (const c of changes) {
      b.update(c.ref, { priceHistory: arrayUnion(...c.removed), ...(c.prevLast != null ? { lastPrice: c.prevLast } : {}) })
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
