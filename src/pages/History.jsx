import { useEffect, useRef, useState } from 'react'
import { collection, onSnapshot, orderBy, query, deleteDoc, doc, getDocs, limit, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase'
import { useFamily } from '../context/FamilyContext'
import { IconTrash, IconChevronRight, IconDownload, IconBadge, IconReceipt, IconCamera, IconUndo } from '../components/Icon'
import { historyCsv, downloadFile } from '../lib/csv'
import { commitInChunks, localDate, queueWrite } from '../lib/firestore'
import SwipeRow from '../components/SwipeRow'
import TipBanner from '../components/TipBanner'
import { useTips } from '../lib/tips'
import { useAuth } from '../context/AuthContext'
import NfceReader from '../components/NfceReader'
import { listPendingNotes } from '../lib/pendingNotes'
import { showError, toast } from '../lib/feedback'
import { deletePurchase } from '../lib/purchasePrices'

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

// Itens comprados sem acompanhar preço (desmarcados na nota) ou, em registros antigos,
// a diferença entre o total pago e os itens listados: assim a lista sempre fecha com o total
function OtherItems({ record }) {
  const [open, setOpen] = useState(false)
  const others = record.otherItems || []
  const listed = (record.items || []).reduce((s, i) => s + (Number(i.totalPrice) || 0), 0)
  const othersSum = others.reduce((s, i) => s + (Number(i.totalPrice) || 0), 0)
  const rest = Math.round(((record.total || 0) - listed - othersSum) * 100) / 100
  if (others.length === 0 && rest < 0.01) return null
  return (
    <div className="border-t border-gray-800/60">
      {others.length > 0 && (
        <button onClick={() => setOpen(v => !v)} className="w-full flex items-center justify-between px-4 py-2 text-left">
          <span className="text-gray-400 text-sm">
            Outros {others.length} {others.length === 1 ? 'item' : 'itens'}
            <span className="text-gray-600 text-xs ml-2">sem acompanhar preço {open ? '▴' : '▾'}</span>
          </span>
          <span className="text-gray-400 text-sm">{fmt(othersSum)}</span>
        </button>
      )}
      {open && others.map((item, idx) => (
        <div key={idx} className="flex items-center justify-between pl-8 pr-4 py-1.5">
          <span className="text-gray-500 text-xs truncate">{item.name} <span className="text-gray-600">{item.qty} {item.unit}</span></span>
          <span className="text-gray-500 text-xs flex-shrink-0 ml-2">{fmt(item.totalPrice)}</span>
        </div>
      ))}
      {rest >= 0.01 && (
        <div className="flex items-center justify-between px-4 py-2">
          <span className="text-gray-500 text-sm">Outros itens <span className="text-gray-600 text-xs">não detalhados</span></span>
          <span className="text-gray-500 text-sm">{fmt(rest)}</span>
        </div>
      )}
    </div>
  )
}

const itemsLabel = n => `${n} ${n === 1 ? 'item' : 'itens'}`

export default function History() {
  const { familyId } = useFamily()
  const user = useAuth()
  const [showNfce, setShowNfce] = useState(false)
  const [reconcile, setReconcile] = useState(null)
  const [records, setRecords] = useState([])
  const [expanded, setExpanded] = useState(null)
  const [monthOpen, setMonthOpen] = useState({})
  const tips = useTips()
  const [yearOpen, setYearOpen] = useState({})
  const [pageSize, setPageSize] = useState(PAGE)
  const [loadedSize, setLoadedSize] = useState(0)
  const [exporting, setExporting] = useState(false)
  const sentinelRef = useRef(null)
  // Notas guardadas para ler depois (SEFAZ ainda sem os itens)
  const [pendingNotes, setPendingNotes] = useState(() => listPendingNotes(familyId).length)
  useEffect(() => {
    const fn = () => setPendingNotes(listPendingNotes(familyId).length)
    fn()
    window.addEventListener('onlist:pending-notes', fn)
    return () => window.removeEventListener('onlist:pending-notes', fn)
  }, [familyId])
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

  // Carrega mais sozinho só se o último mês carregado estiver aberto (com tudo recolhido,
  // a tela fica curta e carregaria o histórico inteiro sem ninguém pedir)
  const keyOf = r => { const d = r?.createdAt?.toDate?.(); return d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` : '' }
  const lastKey = keyOf(records[records.length - 1])
  const firstKey = keyOf(records[0])
  const lastY = lastKey.slice(0, 4), firstY = firstKey.slice(0, 4)
  const autoLoad = !!lastKey && (monthOpen[lastKey] ?? lastKey === firstKey) && (lastY === firstY || (yearOpen[Number(lastY)] ?? false))

  // Chegou perto do fim da lista: carrega mais
  useEffect(() => {
    const el = sentinelRef.current
    if (!el || !hasMore || loadingMore || !autoLoad) return
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) setPageSize(n => n + PAGE)
    }, { rootMargin: '400px' })
    io.observe(el)
    return () => io.disconnect()
  }, [hasMore, loadingMore, autoLoad])

  // Exclui a compra e os preços que ela lançou no catálogo; "Desfazer" devolve tudo
  async function deleteRecord(id, mercado, viaButton = false) {
    const tip = viaButton ? tips.take('tip-history-swipe', 'Dica: deslize a compra para a esquerda para excluir.') : ''
    if (!viaButton) tips.mark('tip-history-swipe')
    const record = records.find(r => r.id === id)
    if (expanded === id) setExpanded(null)
    if (!record) {
      queueWrite(deleteDoc(doc(db, 'families', familyId, 'history', id)), 'excluir a compra')
      return
    }
    try {
      const { committed, undo, pricesRemoved } = await deletePurchase(familyId, record)
      queueWrite(committed, 'excluir a compra')
      toast(`Compra de ${mercado} excluída${pricesRemoved ? ` com ${pricesRemoved} ${pricesRemoved === 1 ? 'preço' : 'preços'} do catálogo` : ''}.${tip ? ` ${tip}` : ''}`, {
        action: { label: 'Desfazer', run: () => queueWrite(undo(), 'desfazer') },
      })
    } catch (e) {
      showError(e, 'excluir a compra')
    }
  }

  // A exportação busca tudo, não só o que já está na tela
  async function exportCsv() {
    setExporting(true)
    try {
      const snap = await getDocs(query(collection(db, 'families', familyId, 'history'), orderBy('createdAt', 'desc')))
      downloadFile(`onlist-compras-${localDate()}.csv`, historyCsv(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
    } catch (e) {
      showError(e, 'exportar as compras')
    }
    setExporting(false)
  }

  // Ano → mês (registros já vêm do mais novo para o mais antigo)
  const years = []
  for (const r of records) {
    const d = r.createdAt?.toDate ? r.createdAt.toDate() : new Date()
    const y = d.getFullYear()
    const key = `${y}-${String(d.getMonth() + 1).padStart(2, '0')}`
    let year = years[years.length - 1]
    if (!year || year.year !== y) { year = { year: y, total: 0, count: 0, months: [] }; years.push(year) }
    let month = year.months[year.months.length - 1]
    if (!month || month.key !== key) { month = { key, label: monthLabel(r.createdAt), total: 0, items: [] }; year.months.push(month) }
    month.total += r.total || 0
    month.items.push(r)
    year.total += r.total || 0
    year.count++
  }
  // O último mês/ano carregado pode estar incompleto enquanto houver mais compras
  const lastYear = years[years.length - 1]
  const partialMonth = hasMore ? lastYear?.months[lastYear.months.length - 1]?.key : null
  const partialYear = hasMore ? lastYear?.year : null
  // Aberto por padrão: o mês e o ano mais recentes. O resto fica recolhido até tocar.
  const firstMonth = years[0]?.months[0]?.key
  const isMonthOpen = key => monthOpen[key] ?? key === firstMonth
  const isYearOpen = y => yearOpen[y] ?? y === years[0]?.year
  const multiYear = years.length > 1

  // Repetir compra: os itens vão para a lista aberta (os que já estão pendentes lá ficam de fora)
  async function repeatPurchase(record) {
    let list = { id: 'default', name: 'Compras gerais' }
    try { list = JSON.parse(localStorage.getItem(`lastList_${familyId}`)) || list } catch { /* ignora */ }
    try {
      const col = collection(db, 'families', familyId, 'lists', list.id, 'entries')
      const snap = await getDocs(col)
      const pending = new Set(snap.docs.filter(d => !d.data().checked).map(d => String(d.data().name || '').toLowerCase()))
      const toAdd = (record.items || []).filter(i => i.name && !pending.has(String(i.name).toLowerCase()))
      if (!toAdd.length) { toast('Todos os itens dessa compra já estão na lista.'); return }
      const refs = toAdd.map(() => doc(col))
      queueWrite(commitInChunks(toAdd.map((i, n) => b => {
        const qty = Number(i.qty) || 1
        const price = Number(i.pricePerUnit) || 0
        b.set(refs[n], {
          name: i.name, category: i.category || 'Outros', unit: i.unit || 'un', qty,
          pricePerUnit: price, totalPrice: Math.round(price * qty * 100) / 100,
          obs: '', brand: i.brand || '', checked: false, createdAt: serverTimestamp(),
        })
      })), 'repetir a compra')
      const skipped = (record.items || []).length - toAdd.length
      toast(`${itemsLabel(toAdd.length)} na lista ${list.name || ''}${skipped ? ` (${skipped} já estavam)` : ''}.`, {
        tone: 'ok',
        action: { label: 'Desfazer', run: () => queueWrite(commitInChunks(refs.map(r => b => b.delete(r))), 'desfazer') },
      })
    } catch (e) {
      showError(e, 'repetir a compra')
    }
  }

  return (
    <div className="flex flex-col min-h-svh bg-gray-900">
      <div className="px-4 pb-3 border-b border-gray-800 header-safe">
        <div className="flex items-center justify-between">
          <h1 className="text-white text-xl font-semibold">Compras</h1>
          <div className="flex gap-2">
            <button onClick={() => setShowNfce(true)}
              className="text-green-300 text-xs border border-green-500/40 px-3 min-h-9 rounded-lg flex items-center gap-1.5">
              <IconCamera size={14} /> Nota fiscal
            </button>
            {records.length > 0 && (
              <button onClick={exportCsv} disabled={exporting}
                className="disabled:opacity-50 text-gray-400 text-xs flex items-center gap-1.5 border border-gray-700 px-3 min-h-9 rounded-lg">
                <IconDownload size={14} /> {exporting ? 'Exportando...' : 'Exportar'}
              </button>
            )}
          </div>
        </div>
      </div>
      {records.length > 0 && (
        <TipBanner id="tip-history">Toque na compra para ver os itens e repetir na lista. Toque no mês ou no ano para abrir e fechar. Deslize ← para excluir.</TipBanner>
      )}
      {pendingNotes > 0 && (
        <button onClick={() => setShowNfce(true)}
          className="mx-4 mt-3 flex items-center justify-between gap-2 bg-amber-500/10 border border-amber-500/30 text-amber-200 text-sm rounded-xl px-3 py-2.5 text-left">
          <span className="flex items-center gap-2"><IconReceipt size={16} /> {pendingNotes === 1 ? '1 nota guardada' : `${pendingNotes} notas guardadas`} para ler depois</span>
          <span className="font-medium text-amber-100 flex-shrink-0">Ler agora →</span>
        </button>
      )}
      {(showNfce || reconcile) && (
        <NfceReader familyId={familyId} user={user} listName="Nota fiscal" reconcileWith={reconcile}
          onClose={() => { setShowNfce(false); setReconcile(null) }}
          onSaved={() => { setShowNfce(false); setReconcile(null) }} />
      )}

      <div className="flex-1 overflow-y-auto pb-20">
        {records.length === 0 && (
          <div className="text-center mt-20 px-8">
            <IconBadge><IconReceipt size={24} /></IconBadge>
            <p className="text-white text-sm font-medium mt-4">Nenhuma compra registrada</p>
            <p className="text-gray-500 text-xs mt-1 mb-5">Ao finalizar uma lista ou ler uma nota fiscal, a compra aparece aqui com os preços pagos.</p>
            <button onClick={() => setShowNfce(true)}
              className="inline-flex items-center gap-2 bg-gray-800 border border-gray-700 text-gray-200 text-sm font-medium px-4 min-h-11 rounded-xl">
              <IconCamera size={16} /> Ler nota fiscal
            </button>
          </div>
        )}

        {years.map(year => (
          <div key={year.year}>
            {multiYear && (
              <button onClick={() => setYearOpen(s => ({ ...s, [year.year]: !isYearOpen(year.year) }))} aria-expanded={isYearOpen(year.year)}
                className="w-full flex justify-between items-center px-4 min-h-12 bg-gray-800/60 border-b border-gray-800 text-left">
                <span className="flex items-center gap-2 text-white text-sm font-semibold">
                  <span className={`text-gray-500 transition-transform ${isYearOpen(year.year) ? 'rotate-90' : ''}`}><IconChevronRight size={14} /></span>
                  {year.year}
                  <span className="text-gray-500 text-xs font-normal">{year.count} {year.count === 1 ? 'compra' : 'compras'}</span>
                </span>
                <span className="text-gray-300 text-sm font-medium">{year.year === partialYear ? 'carregando…' : fmt(year.total)}</span>
              </button>
            )}
            {(!multiYear || isYearOpen(year.year)) && year.months.map(month => (
          <div key={month.key}>
            <button onClick={() => setMonthOpen(s => ({ ...s, [month.key]: !isMonthOpen(month.key) }))} aria-expanded={isMonthOpen(month.key)}
              className="w-full flex justify-between items-center px-4 min-h-11 sticky top-0 z-10 bg-gray-900 border-b border-gray-800 text-left">
              <span className="flex items-center gap-2 text-gray-400 text-xs uppercase tracking-wider capitalize">
                <span className={`text-gray-500 transition-transform ${isMonthOpen(month.key) ? 'rotate-90' : ''}`}><IconChevronRight size={12} /></span>
                {month.label}
                <span className="normal-case tracking-normal text-gray-600">· {month.items.length}</span>
              </span>
              <span className="text-gray-400 text-xs font-medium">{month.key === partialMonth ? 'carregando…' : fmt(month.total)}</span>
            </button>

            {isMonthOpen(month.key) && month.items.map(record => {
              const { day, weekday } = dayLabel(record.createdAt)
              const isExpanded = expanded === record.id
              return (
                <div key={record.id} className={`border-b border-gray-800/60`}>
                  <SwipeRow onSwipeLeft={() => deleteRecord(record.id, record.mercado)}>
                  <div className="flex items-center pr-2">
                    {/* Linha inteira abre/fecha os itens da compra; só a lixeira fica de fora */}
                    <button className="flex-1 min-w-0 flex items-center gap-3 pl-4 pr-1 py-3 text-left active:bg-gray-800/60"
                      onClick={() => setExpanded(isExpanded ? null : record.id)}
                      aria-expanded={isExpanded} aria-label={`${isExpanded ? 'Fechar' : 'Ver'} itens da compra de ${record.mercado}`}>
                    <div className="w-10 text-center flex-shrink-0">
                      <div className="text-white font-semibold text-base leading-none">{day}</div>
                      <div className="text-gray-600 text-xs">{weekday}</div>
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="text-white text-sm font-medium flex items-center gap-1.5">
                        {record.mercado}
                        {record.source === 'nfce' && <span className="text-xs text-green-300 bg-green-500/10 px-1.5 py-0.5 rounded flex-shrink-0">nota</span>}
                      </div>
                      <div className="text-gray-500 text-xs">{record.listName || 'Lista'} · {itemsLabel((record.items?.length || 0) + (record.otherItems?.length || 0))}</div>
                    </div>

                    <span className="text-gray-300 text-sm font-medium flex-shrink-0">{fmt(record.total)}</span>
                    <span className={`text-gray-500 flex-shrink-0 transition-transform ${isExpanded ? 'rotate-90' : ''}`}><IconChevronRight size={16} /></span>
                    </button>
                    <button onClick={() => deleteRecord(record.id, record.mercado, true)} aria-label={`Excluir compra de ${record.mercado}`} className="text-gray-500 hover:text-red-400 min-w-11 min-h-11 -mr-2 flex items-center justify-center">
                      <IconTrash size={16} />
                    </button>
                  </div>
                  </SwipeRow>

                  {isExpanded && record.items && (
                    <div className="border-t border-gray-800 bg-gray-800/30">
                      <div className="px-4 py-2.5 border-b border-gray-800/60 flex flex-wrap gap-2">
                        {record.items.length > 0 && (
                          <button onClick={() => repeatPurchase(record)}
                            className="btn-brand inline-flex items-center gap-1.5 text-xs font-semibold px-3 min-h-9 rounded-full">
                            <IconUndo size={14} /> Repetir compra
                          </button>
                        )}
                        {record.source !== 'nfce' && (
                          <button onClick={() => setReconcile(record)}
                            className="inline-flex items-center gap-1.5 text-xs font-medium px-3 min-h-9 rounded-full border border-green-500/40 bg-green-500/10 text-green-300 active:bg-green-500/20">
                            <IconReceipt size={14} /> Conciliar com a nota fiscal
                          </button>
                        )}
                      </div>
                      {record.items.map((item, idx) => (
                        <div key={idx} className={`flex items-center justify-between px-4 py-2 ${idx < record.items.length - 1 ? 'border-b border-gray-800/40' : ''}`}>
                          <div>
                            <span className="text-gray-300 text-sm">{item.name}</span>
                            {item.brand && <span className="text-gray-500 text-xs ml-1.5">{item.brand}</span>}
                            <span className="text-gray-600 text-xs ml-2">{item.qty} {item.unit}</span>
                          </div>
                          <span className="text-gray-400 text-sm">{fmt(item.totalPrice)}</span>
                        </div>
                      ))}
                      <OtherItems record={record} />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
            ))}
          </div>
        ))}
        {hasMore && (
          <div ref={sentinelRef} className="flex justify-center py-6">
            <button onClick={() => setPageSize(n => n + PAGE)} disabled={loadingMore}
              className="text-gray-400 text-xs border border-gray-700 px-4 py-2 rounded-full disabled:opacity-50">
              {loadingMore ? 'Carregando...' : 'Carregar compras mais antigas'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
