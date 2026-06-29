import { useEffect, useState } from 'react'
import { collection, getDocs, orderBy, query } from 'firebase/firestore'
import { db } from '../firebase'
import { useFamily } from '../context/FamilyContext'

function fmt(n) {
  return (n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export default function Reports() {
  const { familyId } = useFamily()
  const [loading, setLoading] = useState(true)
  const [history, setHistory] = useState([])
  const [catalog, setCatalog] = useState([])
  const [tab, setTab] = useState('spending')

  useEffect(() => {
    if (!familyId) return
    Promise.all([
      getDocs(query(collection(db, 'families', familyId, 'history'), orderBy('createdAt', 'desc'))),
      getDocs(query(collection(db, 'families', familyId, 'catalog'), orderBy('name'))),
    ]).then(([hSnap, cSnap]) => {
      setHistory(hSnap.docs.map(d => ({ id: d.id, ...d.data() })))
      setCatalog(cSnap.docs.map(d => ({ id: d.id, ...d.data() })))
      setLoading(false)
    })
  }, [familyId])

  // --- Spending by month ---
  const byMonth = {}
  for (const r of history) {
    if (!r.createdAt) continue
    const d = r.createdAt.toDate ? r.createdAt.toDate() : new Date(r.createdAt)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const label = d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' })
    if (!byMonth[key]) byMonth[key] = { label, total: 0 }
    byMonth[key].total += r.total || 0
  }
  const monthData = Object.entries(byMonth).sort(([a], [b]) => a.localeCompare(b)).slice(-6)
  const maxMonth = Math.max(...monthData.map(([, v]) => v.total), 1)

  // --- Most purchased items ---
  const itemCount = {}
  for (const r of history) {
    for (const item of r.items || []) {
      if (!itemCount[item.name]) itemCount[item.name] = { name: item.name, count: 0, total: 0, category: item.category }
      itemCount[item.name].count++
      itemCount[item.name].total += item.totalPrice || 0
    }
  }
  const topItems = Object.values(itemCount).sort((a, b) => b.count - a.count).slice(0, 10)

  // --- By category ---
  const byCategory = {}
  for (const r of history) {
    for (const item of r.items || []) {
      const cat = item.category && item.category !== '' ? item.category : 'Sem categoria'
      if (!byCategory[cat]) byCategory[cat] = { cat, total: 0, count: 0 }
      byCategory[cat].total += item.totalPrice || 0
      byCategory[cat].count++
    }
  }
  const catData = Object.values(byCategory).sort((a, b) => b.total - a.total)
  const maxCat = Math.max(...catData.map(c => c.total), 1)

  // --- Price evolution (items with history) ---
  const priceItems = catalog.filter(i => i.priceHistory?.length > 1).slice(0, 20)

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-svh bg-gray-900">
        <div className="w-6 h-6 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="flex flex-col min-h-svh bg-gray-900">
      <div className="px-4 pt-12 pb-3 border-b border-gray-800">
        <h1 className="text-white text-xl font-semibold">Relatórios</h1>
      </div>

      {/* Sub-tabs */}
      <div className="flex border-b border-gray-800 overflow-x-auto">
        {[
          { id: 'spending', label: 'Gastos' },
          { id: 'items', label: 'Itens' },
          { id: 'categories', label: 'Categorias' },
          { id: 'prices', label: 'Preços' },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-3 text-sm flex-shrink-0 border-b-2 transition-colors
              ${tab === t.id ? 'border-green-500 text-white' : 'border-transparent text-gray-500'}`}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto pb-20 px-4">

        {/* Gastos por mês */}
        {tab === 'spending' && (
          <div className="pt-4">
            <p className="text-gray-500 text-xs uppercase tracking-wider mb-4">Gasto mensal (últimos 6 meses)</p>
            {monthData.length === 0 && <p className="text-gray-600 text-sm">Sem dados ainda</p>}
            <div className="space-y-3">
              {monthData.map(([key, { label, total }]) => (
                <div key={key}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-gray-400 capitalize">{label}</span>
                    <span className="text-gray-300 font-medium">{fmt(total)}</span>
                  </div>
                  <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                    <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${(total / maxMonth) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>

            {history.length > 0 && (
              <div className="mt-6 pt-4 border-t border-gray-800">
                <p className="text-gray-500 text-xs uppercase tracking-wider mb-3">Resumo geral</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-gray-800 rounded-xl p-3">
                    <p className="text-gray-500 text-xs">Total gasto</p>
                    <p className="text-white font-semibold text-base mt-1">{fmt(history.reduce((s, r) => s + (r.total || 0), 0))}</p>
                  </div>
                  <div className="bg-gray-800 rounded-xl p-3">
                    <p className="text-gray-500 text-xs">Compras realizadas</p>
                    <p className="text-white font-semibold text-base mt-1">{history.length}</p>
                  </div>
                  <div className="bg-gray-800 rounded-xl p-3">
                    <p className="text-gray-500 text-xs">Ticket médio</p>
                    <p className="text-white font-semibold text-base mt-1">{fmt(history.reduce((s, r) => s + (r.total || 0), 0) / (history.length || 1))}</p>
                  </div>
                  <div className="bg-gray-800 rounded-xl p-3">
                    <p className="text-gray-500 text-xs">Mercados distintos</p>
                    <p className="text-white font-semibold text-base mt-1">{new Set(history.map(r => r.mercado)).size}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Itens mais comprados */}
        {tab === 'items' && (
          <div className="pt-4">
            <p className="text-gray-500 text-xs uppercase tracking-wider mb-4">Top 10 itens mais comprados</p>
            {topItems.length === 0 && <p className="text-gray-600 text-sm">Sem dados ainda</p>}
            {topItems.map((item, i) => (
              <div key={item.name} className={`flex items-center gap-3 py-2.5 ${i < topItems.length - 1 ? 'border-b border-gray-800/60' : ''}`}>
                <span className="text-gray-700 text-xs w-5 text-right">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm">{item.name}</p>
                  <p className="text-gray-600 text-xs">{item.category}</p>
                </div>
                <div className="text-right">
                  <p className="text-gray-300 text-sm font-medium">{item.count}×</p>
                  <p className="text-gray-600 text-xs">{fmt(item.total / item.count)} médio</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Por categoria */}
        {tab === 'categories' && (
          <div className="pt-4">
            <p className="text-gray-500 text-xs uppercase tracking-wider mb-4">Gasto total por categoria</p>
            {catData.length === 0 && <p className="text-gray-600 text-sm">Sem dados ainda</p>}
            <div className="space-y-3">
              {catData.map(c => (
                <div key={c.cat}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-gray-400">{c.cat}</span>
                    <span className="text-gray-300 font-medium">{fmt(c.total)}</span>
                  </div>
                  <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                    <div className="h-full bg-green-500/70 rounded-full" style={{ width: `${(c.total / maxCat) * 100}%` }} />
                  </div>
                  <p className="text-gray-700 text-xs mt-0.5">{c.count} compras</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Evolução de preços */}
        {tab === 'prices' && (
          <div className="pt-4">
            <p className="text-gray-500 text-xs uppercase tracking-wider mb-4">Evolução de preços</p>
            {priceItems.length === 0 && (
              <p className="text-gray-600 text-sm">Registros de preço aparecem aqui conforme você compra os mesmos produtos ao longo do tempo.</p>
            )}
            {priceItems.map(item => {
              const history = [...(item.priceHistory || [])].sort((a, b) => a.date.localeCompare(b.date))
              const first = history[0]?.price || 0
              const last = history[history.length - 1]?.price || 0
              const diff = last - first
              return (
                <div key={item.id} className="border-b border-gray-800 py-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-white text-sm font-medium">{item.name}</span>
                    <span className={`text-xs font-medium ${diff > 0 ? 'text-red-400' : diff < 0 ? 'text-green-400' : 'text-gray-500'}`}>
                      {diff > 0 ? '↑' : diff < 0 ? '↓' : '—'} {diff !== 0 ? fmt(Math.abs(diff)) : 'estável'}
                    </span>
                  </div>
                  <div className="flex gap-3 overflow-x-auto pb-1">
                    {history.map((h, i) => (
                      <div key={i} className="flex-shrink-0 text-center min-w-[70px]">
                        <p className="text-gray-300 text-xs font-medium">{fmt(h.price)}</p>
                        <p className="text-gray-600 text-xs">{h.date?.slice(5)}</p>
                        {h.mercado && <p className="text-gray-700 text-xs truncate max-w-[80px]">{h.mercado}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
