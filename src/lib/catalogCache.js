// Catálogo inteiro só quando precisa (sugestões do formulário, leitura de nota) e no máximo
// uma busca a cada 10 min por aparelho. Antes, a Lista lia o catálogo todo a cada abertura.
import { collection, getDocs } from 'firebase/firestore'
import { db } from '../firebase'

const TTL = 10 * 60 * 1000
const cache = new Map() // familyId -> { at, promise }

// { [id]: dados } — id = nome em minúsculas
export function loadCatalog(familyId, { fresh = false } = {}) {
  const hit = cache.get(familyId)
  if (!fresh && hit && Date.now() - hit.at < TTL) return hit.promise
  const promise = getDocs(collection(db, 'families', familyId, 'catalog'))
    .then(snap => Object.fromEntries(snap.docs.map(d => [d.id, d.data()])))
    .catch(e => { cache.delete(familyId); throw e })
  cache.set(familyId, { at: Date.now(), promise })
  return promise
}

// Avisar que um produto mudou (salvar item, finalizar): a próxima busca vem atualizada
export function invalidateCatalog(familyId) {
  cache.delete(familyId)
}
