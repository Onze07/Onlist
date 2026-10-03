import { useEffect, useState } from 'react'
import { collection, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase'

// Sem marcar itens há 45 min = já saiu do mercado
const STALE_MS = 45 * 60 * 1000

// Outros membros marcando itens agora (estão no mercado)
export function usePresence(familyId, uid) {
  const [docs, setDocs] = useState([])
  const [, tick] = useState(0)

  useEffect(() => {
    if (!familyId) return
    return onSnapshot(collection(db, 'families', familyId, 'presence'), snap => {
      setDocs(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    }, () => setDocs([]))
  }, [familyId])

  useEffect(() => {
    const t = setInterval(() => tick(n => n + 1), 60000)
    return () => clearInterval(t)
  }, [])

  const now = Date.now()
  return docs.filter(p => {
    if (p.id === uid) return false
    const updated = p.updatedAt?.toMillis?.() ?? 0
    return updated && now - updated < STALE_MS
  })
}
