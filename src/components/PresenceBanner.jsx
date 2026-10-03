import { useEffect, useState } from 'react'
import { collection, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase'

const STALE_MS = 3 * 60 * 60 * 1000

// "Ana está no Irmãos Gonçalves comprando" para os outros membros da família
export default function PresenceBanner({ familyId, uid }) {
  const [people, setPeople] = useState([])
  const [, tick] = useState(0)

  useEffect(() => {
    if (!familyId) return
    return onSnapshot(collection(db, 'families', familyId, 'presence'), snap => {
      setPeople(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    }, () => setPeople([]))
  }, [familyId])

  // Reavalia presenças antigas a cada minuto
  useEffect(() => {
    const t = setInterval(() => tick(n => n + 1), 60000)
    return () => clearInterval(t)
  }, [])

  const now = Date.now()
  const active = people.filter(p => {
    if (p.id === uid) return false
    const updated = p.updatedAt?.toMillis?.() ?? 0
    return updated && now - updated < STALE_MS
  })
  if (active.length === 0) return null

  return (
    <div className="px-4 pt-2">
      {active.map(p => {
        const since = p.startedAt?.toDate?.()
        return (
          <div key={p.id} className="bg-green-500/10 border border-green-500/30 rounded-xl px-3 py-2 mb-1 text-sm text-green-300 flex items-center gap-2">
            <span className="text-base">🛒</span>
            <span className="flex-1 min-w-0">
              <b className="text-green-200">{p.name?.split(' ')[0] || 'Alguém'}</b> está {p.mercado ? `no ${p.mercado}` : 'no mercado'} comprando
            </span>
            {since && <span className="text-green-400/60 text-xs flex-shrink-0">desde {since.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>}
          </div>
        )
      })}
    </div>
  )
}
