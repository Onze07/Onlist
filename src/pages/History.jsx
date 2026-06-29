import { useEffect, useState } from 'react'
import { collection, onSnapshot, orderBy, query, deleteDoc, doc } from 'firebase/firestore'
import { db } from '../firebase'
import { useFamily } from '../context/FamilyContext'
import { IconTrash, IconChevronDown, IconChevronRight } from '../components/Icon'

function fmt(n) {
  return (n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function monthLabel(ts) {
  if (!ts) return ''
  const d = ts.toDate ? ts.toDate() : new Date(ts)
  return d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
}

function dayLabel(ts) {
  if (!ts) return { day: '', weekday: '' }
  const d = ts.toDate ? ts.toDate() : new Date(ts)
  return {
    day: d.getDate().toString().padStart(2, '0'),
    weekday: d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', ''),
  }
}

export default function History() {
  const { familyId } = useFamily()
  const [records, setRecords] = useState([])
  const [expanded, setExpanded] = useState(null)

  useEffect(() => {
    if (!familyId) return
    const q = query(collection(db, 'families', familyId, 'history'), orderBy('createdAt', 'desc'))
    return onSnapshot(q, snap => {
      setRecords(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    })
  }, [familyId])

  async function deleteRecord(id, mercado) {
    if (!confirm(`Excluir registro de "${mercado}"?`)) return
    await deleteDoc(doc(db, 'families', familyId, 'history', id))
    if (expanded === id) setExpanded(null)
  }

  // Group by month
  const byMonth = {}
  for (const r of records) {
    const m = monthLabel(r.createdAt)
    if (!byMonth[m]) byMonth[m] = { label: m, total: 0, items: [] }
    byMonth[m].total += r.total || 0
    byMonth[m].items.push(r)
  }

  return (
    <div className="flex flex-col min-h-svh bg-gray-900">
      <div className="px-4 pt-12 pb-3 border-b border-gray-800">
        <h1 className="text-white text-xl font-semibold">Registros</h1>
      </div>

      <div className="flex-1 overflow-y-auto pb-20">
        {records.length === 0 && (
          <div className="text-center text-gray-600 mt-24">
            <p className="text-sm">Nenhuma compra registrada</p>
          </div>
        )}

        {Object.values(byMonth).map(month => (
          <div key={month.label}>
            <div className="flex justify-between items-center px-4 py-3 sticky top-0 bg-gray-900 border-b border-gray-800">
              <span className="text-gray-500 text-xs uppercase tracking-wider capitalize">{month.label}</span>
              <span className="text-gray-400 text-xs font-medium">{fmt(month.total)}</span>
            </div>

            {month.items.map((record, i) => {
              const { day, weekday } = dayLabel(record.createdAt)
              const isExpanded = expanded === record.id
              return (
                <div key={record.id} className={`border-b border-gray-800/60`}>
                  <div className="flex items-center gap-3 px-4 py-3">
                    <div className="w-10 text-center flex-shrink-0">
                      <div className="text-white font-semibold text-base leading-none">{day}</div>
                      <div className="text-gray-600 text-xs">{weekday}</div>
                    </div>

                    <button className="flex-1 text-left" onClick={() => setExpanded(isExpanded ? null : record.id)}>
                      <div className="text-white text-sm font-medium">{record.mercado}</div>
                      <div className="text-gray-500 text-xs">{record.listName || 'Lista'} · {record.items?.length || 0} itens</div>
                    </button>

                    <span className="text-gray-300 text-sm font-medium">{fmt(record.total)}</span>
                    <span className="text-gray-500 ml-1">{isExpanded ? <IconChevronDown size={16} /> : <IconChevronRight size={16} />}</span>
                    <button onClick={() => deleteRecord(record.id, record.mercado)} className="text-gray-500 hover:text-red-400 ml-1 p-1">
                      <IconTrash size={16} />
                    </button>
                  </div>

                  {isExpanded && record.items && (
                    <div className="border-t border-gray-800 bg-gray-800/30">
                      {record.items.map((item, idx) => (
                        <div key={idx} className={`flex items-center justify-between px-4 py-2 ${idx < record.items.length - 1 ? 'border-b border-gray-800/40' : ''}`}>
                          <div>
                            <span className="text-gray-300 text-sm">{item.name}</span>
                            <span className="text-gray-600 text-xs ml-2">{item.qty} {item.unit}</span>
                          </div>
                          <span className="text-gray-400 text-sm">{fmt(item.totalPrice)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
