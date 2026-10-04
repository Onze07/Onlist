import { useEffect, useState } from 'react'
import { collection, getDocs, orderBy, query, Timestamp, where } from 'firebase/firestore'
import { db } from '../firebase'
import { useFamily } from '../context/FamilyContext'
import { fmtDate, localDate, normalizePriceHistory } from '../lib/firestore'
import { PRESETS, rangeFor, previousRange, inRange, rangeDays } from '../lib/period'
import { trend } from '../lib/prices'
import { historyCsv, downloadFile } from '../lib/csv'
import { IconDownload } from '../components/Icon'

function fmt(n) {
  return (n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function pct(n) {
  return `${n > 0 ? '+' : ''}${(n * 100).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}%`
}

function sumTotal(records) {
  return records.reduce((s, r) => s + (r.total || 0), 0)
}

function Bars({ data, color = 'bg-green-500' }) {
  const max = Math.max(...data.map(d => d.total), 1)
  return (
    <div className="space-y-3">
      {data.map(d => (
        <div key={d.key}>
          <div className="flex justify-between text-xs mb-1 gap-3">
            <span className="text-gray-400 truncate">{d.label}</span>
            <span className="text-gray-300 font-medium flex-shrink-0">{fmt(d.total)}</span>
          </div>
          <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
            <div className={`h-full ${color} rounded-full`} style={{ width: `${(d.total / max) * 100}%` }} />
          </div>
          {d.note && <p className="text-gray-700 text-xs mt-0.5">{d.note}</p>}
        </div>
      ))}
    </div>
  )
}

function Title({ children }) {
  return <p className="text-gray-500 text-xs uppercase tracking-wider mb-3 mt-6 first:mt-4">{children}</p>
}

export default function Reports() {
  const { familyId, profiles } = useFamily()
  const [loading, setLoading] = useState(true)
  const [ready, setReady] = useState(false)
  const [history, setHistory] = useState([])
  const [catalog, setCatalog] = useState([])
  const [tab, setTab] = useState('summary')
  const [preset, setPreset] = useState('month')
  const [custom, setCustom] = useState(() => ({ from: localDate(new Date(new Date().setDate(1))), to: localDate() }))

  const range = rangeFor(preset, new Date(), custom)
  const prev = previousRange(range)
  const fromMs = prev.start.getTime()
  const toMs = range.end.getTime()

  useEffect(() => {
    if (!familyId) return
    getDocs(query(collection(db, 'families', familyId, 'catalog'), orderBy('name'))).then(cSnap => {
      setCatalog(cSnap.docs.map(d => {
        const data = d.data()
        return { id: d.id, ...data, priceHistory: normalizePriceHistory(data.priceHistory) }
      }))
    })
  }, [familyId])

  // Só as compras do período escolhido e do anterior (para comparar), não o histórico inteiro
  useEffect(() => {
    if (!familyId) return
    let alive = true
    setLoading(true)
    getDocs(query(collection(db, 'families', familyId, 'history'),
      where('createdAt', '>=', Timestamp.fromMillis(fromMs)), where('createdAt', '<', Timestamp.fromMillis(toMs)),
      orderBy('createdAt', 'desc')))
      .then(hSnap => { if (alive) setHistory(hSnap.docs.map(d => ({ id: d.id, ...d.data() }))) })
      .catch(e => console.error('Erro ao carregar relatórios', e))
      .finally(() => { if (alive) { setLoading(false); setReady(true) } })
    return () => { alive = false }
  }, [familyId, fromMs, toMs])
  const records = history.filter(r => inRange(r.createdAt, range))
  const prevRecords = history.filter(r => inRange(r.createdAt, prev))
  const total = sumTotal(records)
  const prevTotal = sumTotal(prevRecords)
  const change = prevTotal > 0 ? (total - prevTotal) / prevTotal : null
  const rangeLabel = `${range.start.toLocaleDateString('pt-BR')} – ${new Date(range.end - 1).toLocaleDateString('pt-BR')}`

  // --- Gasto ao longo do tempo: por semana (até 31 dias) ou por mês ---
  const byWeek = rangeDays(range) <= 31
  const timeline = []
  if (byWeek) {
    for (let d = new Date(range.start); d < range.end; d.setDate(d.getDate() + 7)) {
      const start = new Date(d)
      const end = new Date(d); end.setDate(end.getDate() + 7)
      const t = sumTotal(records.filter(r => inRange(r.createdAt, { start, end: end < range.end ? end : range.end })))
      timeline.push({ key: start.toISOString(), label: `Semana de ${start.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}`, total: t })
    }
  } else {
    for (let d = new Date(range.start); d < range.end; d.setMonth(d.getMonth() + 1)) {
      const start = new Date(d)
      const end = new Date(d.getFullYear(), d.getMonth() + 1, 1)
      const t = sumTotal(records.filter(r => inRange(r.createdAt, { start, end })))
      timeline.push({ key: start.toISOString(), label: start.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }), total: t })
    }
  }

  // --- Por mercado ---
  const markets = {}
  for (const r of records) {
    const k = (r.mercado || 'Não informado').trim()
    if (!markets[k]) markets[k] = { key: k, label: k, total: 0, count: 0 }
    markets[k].total += r.total || 0
    markets[k].count++
  }
  const marketData = Object.values(markets).sort((a, b) => b.total - a.total)
    .map(m => ({ ...m, note: `${m.count} ${m.count === 1 ? 'compra' : 'compras'}` }))

  // --- Por pessoa (compras novas registram quem finalizou) ---
  const people = {}
  let unknownPeople = 0
  for (const r of records) {
    if (!r.finishedBy) { unknownPeople++; continue }
    if (!people[r.finishedBy]) people[r.finishedBy] = { key: r.finishedBy, label: profiles[r.finishedBy]?.name || 'Ex-membro', total: 0 }
    people[r.finishedBy].total += r.total || 0
  }
  const peopleData = Object.values(people).sort((a, b) => b.total - a.total)

  // --- Itens mais comprados ---
  const itemCount = {}
  for (const r of records) {
    for (const item of r.items || []) {
      if (!itemCount[item.name]) itemCount[item.name] = { name: item.name, count: 0, total: 0, category: item.category }
      itemCount[item.name].count++
      itemCount[item.name].total += item.totalPrice || 0
    }
  }
  const topItems = Object.values(itemCount).sort((a, b) => b.count - a.count).slice(0, 10)

  // --- Por categoria ---
  const byCategory = {}
  for (const r of records) {
    for (const item of r.items || []) {
      const cat = item.category || 'Sem categoria'
      if (!byCategory[cat]) byCategory[cat] = { key: cat, label: cat, total: 0, count: 0 }
      byCategory[cat].total += item.totalPrice || 0
      byCategory[cat].count++
    }
  }
  const catData = Object.values(byCategory).sort((a, b) => b.total - a.total)
    .map(c => ({ ...c, note: `${c.count} ${c.count === 1 ? 'item' : 'itens'}` }))

  // --- Preços: subiram / caíram (2 últimas compras) ---
  const trends = catalog.map(i => ({ item: i, t: trend(i.priceHistory) })).filter(x => x.t && Math.abs(x.t.diff) > 0.005)
  const rising = trends.filter(x => x.t.diff > 0).sort((a, b) => b.t.pct - a.t.pct)
  const falling = trends.filter(x => x.t.diff < 0).sort((a, b) => a.t.pct - b.t.pct)
  const priceItems = catalog.filter(i => i.priceHistory?.length > 1).slice(0, 20)

  function exportPeriod() {
    const from = localDate(range.start)
    const to = localDate(new Date(range.end - 1))
    downloadFile(`onlist-compras-${from}_a_${to}.csv`, historyCsv(records))
  }

  // Spinner só na primeira carga; ao trocar o período a tela fica e só os números mudam
  if (!ready) {
    return (
      <div className="flex items-center justify-center min-h-svh bg-gray-900">
        <div className="w-6 h-6 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="flex flex-col min-h-svh bg-gray-900">
      <div className="px-4 pt-12 pb-3 border-b border-gray-800">
        <div className="flex items-center justify-between">
          <h1 className="text-white text-xl font-semibold flex items-center gap-2">
            Relatórios
            {loading && <span className="w-4 h-4 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />}
          </h1>
          {records.length > 0 && tab !== 'prices' && (
            <button onClick={exportPeriod}
              className="text-gray-400 text-xs flex items-center gap-1.5 border border-gray-700 px-3 py-1.5 rounded-lg">
              <IconDownload size={14} /> Exportar período
            </button>
          )}
        </div>
      </div>

      {/* Período */}
      {tab !== 'prices' && (
        <div className="border-b border-gray-800 py-2.5">
          <div className="flex gap-2 overflow-x-auto px-4 pb-1">
            {PRESETS.map(p => (
              <button key={p.id} onClick={() => setPreset(p.id)}
                className={`text-xs px-3 py-1.5 rounded-full flex-shrink-0 border ${preset === p.id ? 'border-green-500 bg-green-500/10 text-green-400' : 'border-gray-700 text-gray-400'}`}>
                {p.label}
              </button>
            ))}
          </div>
          {preset === 'custom' && (
            <div className="flex gap-2 px-4 pt-2">
              <input type="date" value={custom.from} onChange={e => setCustom(c => ({ ...c, from: e.target.value }))}
                className="flex-1 bg-gray-800 text-white text-sm px-2 py-1.5 rounded-lg outline-none [color-scheme:dark]" />
              <input type="date" value={custom.to} onChange={e => setCustom(c => ({ ...c, to: e.target.value }))}
                className="flex-1 bg-gray-800 text-white text-sm px-2 py-1.5 rounded-lg outline-none [color-scheme:dark]" />
            </div>
          )}
          <p className="text-gray-600 text-xs px-4 pt-1.5">{rangeLabel}</p>
        </div>
      )}

      {/* Abas */}
      <div className="flex border-b border-gray-800 overflow-x-auto">
        {[
          { id: 'summary', label: 'Resumo' },
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

      <div className="flex-1 overflow-y-auto pb-24 px-4">

        {tab === 'summary' && (
          <div>
            <div className="grid grid-cols-2 gap-3 pt-4">
              <div className="bg-gray-800 rounded-xl p-3 col-span-2">
                <p className="text-gray-500 text-xs">Total gasto</p>
                <div className="flex items-baseline justify-between mt-1">
                  <p className="text-white font-semibold text-2xl">{fmt(total)}</p>
                  {change !== null && (
                    <span className={`text-xs font-medium ${change > 0 ? 'text-red-400' : change < 0 ? 'text-green-400' : 'text-gray-500'}`}>
                      {pct(change)} vs período anterior
                    </span>
                  )}
                </div>
              </div>
              <div className="bg-gray-800 rounded-xl p-3">
                <p className="text-gray-500 text-xs">Compras</p>
                <p className="text-white font-semibold text-base mt-1">{records.length}</p>
              </div>
              <div className="bg-gray-800 rounded-xl p-3">
                <p className="text-gray-500 text-xs">Ticket médio</p>
                <p className="text-white font-semibold text-base mt-1">{fmt(total / (records.length || 1))}</p>
              </div>
            </div>

            {records.length === 0 ? (
              <p className="text-gray-600 text-sm mt-6">Nenhuma compra neste período.</p>
            ) : (
              <>
                <Title>{byWeek ? 'Por semana' : 'Por mês'}</Title>
                <Bars data={timeline} />

                <Title>Por mercado</Title>
                <Bars data={marketData} color="bg-blue-500/70" />

                {peopleData.length > 0 && (
                  <>
                    <Title>Por pessoa (quem finalizou)</Title>
                    <Bars data={peopleData} color="bg-purple-500/70" />
                    {unknownPeople > 0 && (
                      <p className="text-gray-700 text-xs mt-2">{unknownPeople} compra(s) antiga(s) sem esse registro.</p>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        )}

        {tab === 'items' && (
          <div className="pt-4">
            <p className="text-gray-500 text-xs uppercase tracking-wider mb-4">Top 10 itens mais comprados</p>
            {topItems.length === 0 && <p className="text-gray-600 text-sm">Nenhuma compra neste período.</p>}
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

        {tab === 'categories' && (
          <div className="pt-4">
            <p className="text-gray-500 text-xs uppercase tracking-wider mb-4">Gasto por categoria</p>
            {catData.length === 0 ? <p className="text-gray-600 text-sm">Nenhuma compra neste período.</p> : <Bars data={catData} color="bg-green-500/70" />}
          </div>
        )}

        {tab === 'prices' && (
          <div>
            {trends.length === 0 && priceItems.length === 0 && (
              <p className="text-gray-600 text-sm pt-4">Registros de preço aparecem aqui conforme você compra os mesmos produtos ao longo do tempo.</p>
            )}
            {[{ title: 'Subiram', list: rising, color: 'text-red-400', arrow: '↑' }, { title: 'Caíram', list: falling, color: 'text-green-400', arrow: '↓' }]
              .filter(s => s.list.length > 0)
              .map(s => (
                <div key={s.title}>
                  <Title>{s.title} (última compra)</Title>
                  {s.list.map(({ item, t }) => (
                    <div key={item.id} className="flex items-center gap-3 py-2 border-b border-gray-800/60">
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm truncate">{item.name}</p>
                        <p className="text-gray-600 text-xs truncate">
                          {fmt(t.prev.price)} → {fmt(t.last.price)} · {t.last.mercado} · {fmtDate(t.last.date, { short: true })}
                        </p>
                      </div>
                      <span className={`text-sm font-medium ${s.color}`}>{s.arrow} {pct(t.pct)}</span>
                    </div>
                  ))}
                </div>
              ))}

            {priceItems.length > 0 && <Title>Evolução de preços</Title>}
            {priceItems.map(item => (
              <div key={item.id} className="border-b border-gray-800 py-3">
                <p className="text-white text-sm font-medium mb-2">{item.name}</p>
                <div className="flex gap-3 overflow-x-auto pb-1">
                  {item.priceHistory.map((h, i) => (
                    <div key={i} className="flex-shrink-0 text-center min-w-[70px]">
                      <p className="text-gray-300 text-xs font-medium">{fmt(h.price)}</p>
                      <p className="text-gray-600 text-xs">{fmtDate(h.date, { short: true })}</p>
                      {h.mercado && <p className="text-gray-700 text-xs truncate max-w-[80px]">{h.mercado}</p>}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

