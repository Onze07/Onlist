import { useEffect, useRef, useState } from 'react'
import { collection, onSnapshot, orderBy, query, deleteDoc, doc, getDocs, limit } from 'firebase/firestore'
import { db } from '../firebase'
import { useFamily } from '../context/FamilyContext'
import { IconTrash, IconChevronDown, IconChevronRight, IconDownload } from '../components/Icon'
import { historyCsv, downloadFile } from '../lib/csv'
import { localDate } from '../lib/firestore'
import { useAuth } from '../context/AuthContext'
import NfceReader from '../components/NfceReader'

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

// Carrega aos poucos: abrir a tela não lê o histórico inteiro
const PAGE = 30

export default function History() {
  const { familyId } = useFamily()
  const user = useAuth()
  const [showNfce, setShowNfce] = useState(false)
  const [reconcile, setReconcile] = useState(null)
  const [records, setRecords] = useState([])
  const [expanded, setExpanded] = useState(null)
  const [pageSize, setPageSize] = useState(PAGE)
  const [loadedSize, setLoadedSize] = useState(0)
  const [exporting, setExporting] = useState(false)
  const sentinelRef = useRef(null)
  const hasMore = records.length >= pageSize
  const loadingMore = loadedSize < pageSize

  useEffect(() => {
    if (!familyId) return
    const q = query(collection(db, 'families', familyId, 'history'), orderBy('createdAt', 'desc'), limit(pageSize))
    return onSnapshot(q, snap => {
      setRecords(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      setLoadedSize(pageSize)
    })
  }, [familyId, pageSize])

  // Chegou perto do fim da lista: carrega mais
  useEffect(() => {
    const el = sentinelRef.current
    if (!el || !hasMore || loadingMore) return
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) setPageSize(n => n + PAGE)
    }, { rootMargin: '400px' })
    io.observe(el)
    return () => io.disconnect()
  }, [hasMore, loadingMore])

  async function deleteRecord(id, mercado) {
    if (!confirm(`Excluir registro de "${mercado}"?`)) return
    await deleteDoc(doc(db, 'families', familyId, 'history', id))
    if (expanded === id) setExpanded(null)
  }

  // A exportação busca tudo, não só o que já está na tela
  async function exportCsv() {
    setExporting(true)
    try {
      const snap = await getDocs(query(collection(db, 'families', familyId, 'history'), orderBy('createdAt', 'desc')))
      downloadFile(`onlist-compras-${localDate()}.csv`, historyCsv(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
    } catch (e) {
      alert('Erro ao exportar: ' + e.message)
    }
    setExporting(false)
  }

  // Group by month
  const byMonth = {}
  for (const r of records) {
    const m = monthLabel(r.createdAt)
    if (!byMonth[m]) byMonth[m] = { label: m, total: 0, items: [] }
    byMonth[m].total += r.total || 0
    byMonth[m].items.push(r)
  }
  // O último mês carregado pode estar incompleto enquanto houver mais registros
  const months = Object.values(byMonth)
  const partialMonth = hasMore ? months[months.length - 1]?.label : null

  return (
    <div className="flex flex-col min-h-svh bg-gray-900">
      <div className="px-4 pt-12 pb-3 border-b border-gray-800">
        <div className="flex items-center justify-between">
          <h1 className="text-white text-xl font-semibold">Registros</h1>
          <div className="flex gap-2">
            <button onClick={() => setShowNfce(true)}
              className="text-green-300 text-xs border border-green-500/40 px-3 py-1.5 rounded-lg">
              📷 Nota fiscal
            </button>
            {records.length > 0 && (
              <button onClick={exportCsv} disabled={exporting}
                className="disabled:opacity-50 text-gray-400 text-xs flex items-center gap-1.5 border border-gray-700 px-3 py-1.5 rounded-lg">
                <IconDownload size={14} /> {exporting ? 'Exportando...' : 'Exportar'}
              </button>
            )}
          </div>
        </div>
      </div>
      {(showNfce || reconcile) && (
        <NfceReader familyId={familyId} user={user} listName="Nota fiscal" reconcileWith={reconcile}
          onClose={() => { setShowNfce(false); setReconcile(null) }}
          onSaved={() => { setShowNfce(false); setReconcile(null) }} />
      )}

      <div className="flex-1 overflow-y-auto pb-20">
        {records.length === 0 && (
          <div className="text-center text-gray-600 mt-24">
            <p className="text-sm">Nenhuma compra registrada</p>
          </div>
        )}

        {months.map(month => (
          <div key={month.label}>
            <div className="flex justify-between items-center px-4 py-3 sticky top-0 bg-gray-900 border-b border-gray-800">
              <span className="text-gray-500 text-xs uppercase tracking-wider capitalize">{month.label}</span>
              <span className="text-gray-400 text-xs font-medium">{month.label === partialMonth ? 'carregando…' : fmt(month.total)}</span>
            </div>

            {month.items.map(record => {
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
                      <div className="text-white text-sm font-medium flex items-center gap-1.5">
                        {record.mercado}
                        {record.source === 'nfce' && <span className="text-[10px] text-green-300 bg-green-500/10 px-1.5 py-0.5 rounded">📄 nota</span>}
                      </div>
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
                      {record.source !== 'nfce' && (
                        <div className="px-4 py-2.5 border-b border-gray-800/60">
                          <button onClick={() => setReconcile(record)}
                            className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full border border-green-500/40 bg-green-500/10 text-green-300 active:bg-green-500/20">
                            📄 Conciliar com a nota fiscal
                          </button>
                        </div>
                      )}
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
        {hasMore && (
          <div ref={sentinelRef} className="flex justify-center py-6">
            <button onClick={() => setPageSize(n => n + PAGE)} disabled={loadingMore}
              className="text-gray-400 text-xs border border-gray-700 px-4 py-2 rounded-full disabled:opacity-50">
              {loadingMore ? 'Carregando...' : 'Carregar mais'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
