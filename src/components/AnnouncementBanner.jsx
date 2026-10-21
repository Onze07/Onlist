import { useEffect, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase'

const KEY = 'announcementClosed'

// Aviso geral publicado pelo painel (/admin → Visão geral). Some ao fechar; um aviso novo aparece de novo.
export default function AnnouncementBanner() {
  const [data, setData] = useState(null)
  const [closed, setClosed] = useState(() => { try { return localStorage.getItem(KEY) } catch { return null } })

  useEffect(() => onSnapshot(doc(db, 'config', 'announcement'), snap => setData(snap.exists() ? snap.data() : null), () => {}), [])

  if (!data?.active || !data.message || closed === data.id) return null
  const warn = data.level === 'warn'
  function close() {
    setClosed(data.id)
    try { localStorage.setItem(KEY, data.id) } catch { /* ignora */ }
  }
  return (
    <div className="fixed inset-x-0 z-40 max-w-lg mx-auto px-3" style={{ top: 'calc(env(safe-area-inset-top) + 8px)' }} role="status">
      <div className={`flex items-start gap-2 rounded-xl border pl-3 pr-1 py-1 shadow-xl ${warn ? 'bg-amber-500 border-amber-600 text-gray-900' : 'bg-gray-800 border-gray-700 text-gray-100'}`}>
        <p className="flex-1 text-sm py-2">{data.message}</p>
        <button onClick={close} aria-label="Fechar aviso" className={`min-w-11 min-h-11 rounded-lg ${warn ? 'text-gray-900 active:bg-amber-600' : 'text-gray-400 active:bg-gray-700'}`}>✕</button>
      </div>
    </div>
  )
}
