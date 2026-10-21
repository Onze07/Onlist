import { useEffect, useMemo, useState } from 'react'
import { collection, documentId, onSnapshot, query, where } from 'firebase/firestore'
import { db } from '../firebase'

// Só os produtos do catálogo que estão na lista (preço anterior, mais barato em outro mercado,
// histórico ao finalizar). Firestore aceita até 30 ids por consulta "in": divide em blocos.
export function useCatalogFor(familyId, names) {
  const keys = useMemo(() => [...new Set(names.map(n => String(n || '').toLowerCase()).filter(Boolean))].sort(), [names])
  const keyStr = keys.join('\u0001')
  const [map, setMap] = useState({})

  useEffect(() => {
    if (!familyId || !keys.length) { setMap({}); return }
    const parts = {}
    const unsubs = []
    for (let i = 0; i < keys.length; i += 30) {
      const chunk = keys.slice(i, i + 30)
      const q = query(collection(db, 'families', familyId, 'catalog'), where(documentId(), 'in', chunk))
      unsubs.push(onSnapshot(q, snap => {
        parts[i] = Object.fromEntries(snap.docs.map(d => [d.id, d.data()]))
        setMap(Object.assign({}, ...Object.values(parts)))
      }, () => {}))
    }
    return () => unsubs.forEach(u => u())
  }, [familyId, keyStr]) // eslint-disable-line react-hooks/exhaustive-deps

  return map
}
