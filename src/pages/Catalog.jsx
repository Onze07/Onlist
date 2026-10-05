import { useEffect, useState } from 'react'
import { collection, onSnapshot, orderBy, query, doc, updateDoc, deleteDoc } from 'firebase/firestore'
import { db } from '../firebase'
import { useFamily } from '../context/FamilyContext'
import { fmtDate, normalizePriceHistory } from '../lib/firestore'
import { latestByMarket } from '../lib/prices'
import MoneyInput from '../components/MoneyInput'
import { IconEdit, IconTrash, IconChevronDown, IconChevronRight, IconTrendingUp } from '../components/Icon'
import { UNITS, UNIT_LABELS } from '../lib/nfceMatch'

const CATEGORIES = ['Hortifruti', 'Carne', 'Laticínios', 'Mercearia', 'Padaria', 'Limpeza', 'Higiene', 'Bebidas', 'Outros']

function fmt(n) {
  if (!n) return '—'
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export default function Catalog({ onAddToList }) {
  const { familyId, userDoc } = useFamily()
  const decimals = userDoc?.priceDecimals === 3 ? 3 : 2
  const [items, setItems] = useState([])
  const [search, setSearch] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [collapsed, setCollapsed] = useState({})
  const [priceHistoryId, setPriceHistoryId] = useState(null)

  useEffect(() => {
    if (!familyId) return
    const q = query(collection(db, 'families', familyId, 'catalog'), orderBy('name'))
    return onSnapshot(q, snap => {
      setItems(snap.docs.map(d => {
        const data = d.data()
        return { id: d.id, ...data, priceHistory: normalizePriceHistory(data.priceHistory) }
      }))
    })
  }, [familyId])

  const filtered = search
    ? items.filter(i => i.name.toLowerCase().includes(search.toLowerCase()))
    : items

  // Group by category
  const groups = {}
  for (const item of filtered) {
    const cat = item.category || 'Outros'
    if (!groups[cat]) groups[cat] = []
    groups[cat].push(item)
  }
  const groupOrder = CATEGORIES.filter(c => groups[c])

  async function saveEdit(id, data) {
    await updateDoc(doc(db, 'families', familyId, 'catalog', id), data)
    setEditingId(null)
  }

  async function handleDelete(item) {
    if (!confirm(`Remover "${item.name}" do catálogo?`)) return
    await deleteDoc(doc(db, 'families', familyId, 'catalog', item.id))
  }

  function toggleCollapse(cat) {
    setCollapsed(prev => ({ ...prev, [cat]: !prev[cat] }))
  }

  return (
    <div className="flex flex-col min-h-svh bg-gray-900">
      <div className="px-4 pt-12 pb-3 border-b border-gray-800">
        <h1 className="text-white text-xl font-semibold mb-3">Catálogo</h1>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar item..."
          className="w-full bg-gray-800 text-white px-4 py-2.5 rounded-xl outline-none text-sm border border-gray-700 focus:border-gray-600"
        />
      </div>

      <div className="flex-1 overflow-y-auto pb-20">
        {filtered.length === 0 && (
          <div className="text-center text-gray-600 mt-20">
            <p className="text-sm">{search ? 'Nenhum item encontrado' : 'Catálogo vazio'}</p>
            <p className="text-xs mt-1 text-gray-700">Itens aparecem aqui ao serem adicionados à lista</p>
          </div>
        )}

        {groupOrder.map(cat => (
          <div key={cat}>
            {/* Category header */}
            <button onClick={() => toggleCollapse(cat)}
              className="flex items-center justify-between w-full px-4 py-2.5 bg-gray-900 sticky top-0 border-b border-gray-800">
              <span className="text-gray-500 text-xs uppercase tracking-wider font-medium">{cat}</span>
              <div className="flex items-center gap-2">
                <span className="text-gray-700 text-xs">{groups[cat].length}</span>
                <span className="text-gray-700">{collapsed[cat] ? <IconChevronRight size={12} /> : <IconChevronDown size={12} />}</span>
              </div>
            </button>

            {!collapsed[cat] && groups[cat].map((item, i) => (
              <div key={item.id}>
                {editingId === item.id ? (
                  <EditRow item={item} categories={CATEGORIES} units={UNITS} decimals={decimals}
                    onSave={data => saveEdit(item.id, data)}
                    onCancel={() => setEditingId(null)} />
                ) : (
                  <div className={`flex items-center gap-3 px-4 py-2.5 ${i < groups[cat].length - 1 ? 'border-b border-gray-800/60' : ''}`}>
                    <div className="flex-1 min-w-0">
                      <span className="text-white text-sm">{item.name}</span>
                      <div className="text-gray-600 text-xs mt-0.5">{item.unit} · {fmt(item.lastPrice)}</div>
                      {(() => {
                        const markets = latestByMarket(item.priceHistory)
                        return markets.length > 1 && (
                          <div className="text-emerald-400/80 text-[11px] mt-0.5 truncate">
                            Melhor: {fmt(markets[0].price)} no {markets[0].mercado}
                          </div>
                        )
                      })()}
                    </div>

                    {/* Price history indicator */}
                    {item.priceHistory?.length > 0 && (
                      <button onClick={() => setPriceHistoryId(priceHistoryId === item.id ? null : item.id)}
                        className="text-gray-400 hover:text-gray-200 px-1.5">
                        <IconTrendingUp size={16} />
                      </button>
                    )}

                    <button onClick={() => onAddToList(item)}
                      className="text-gray-300 text-xs px-2.5 py-1.5 rounded border border-gray-600 hover:border-gray-400 flex-shrink-0">
                      + lista
                    </button>
                    <button onClick={() => setEditingId(item.id)} className="text-gray-400 hover:text-gray-200 px-1.5">
                      <IconEdit size={16} />
                    </button>
                    <button onClick={() => handleDelete(item)} className="text-gray-500 hover:text-red-400 px-1.5">
                      <IconTrash size={16} />
                    </button>
                  </div>
                )}

                {/* Price history inline */}
                {priceHistoryId === item.id && item.priceHistory && (
                  <div className="bg-gray-800/50 px-4 py-3 border-b border-gray-800">
                    {(() => {
                      const markets = latestByMarket(item.priceHistory)
                      if (markets.length < 2) return null
                      const best = markets[0].price
                      return (
                        <div className="mb-3">
                          <p className="text-gray-500 text-xs mb-2 uppercase tracking-wider">Por mercado (último preço)</p>
                          <div className="flex flex-col gap-1">
                            {markets.map((m, idx) => (
                              <div key={m.key} className="flex justify-between text-xs gap-3">
                                <span className={idx === 0 ? 'text-emerald-400' : 'text-gray-400'}>
                                  {m.mercado} <span className="text-gray-600">· {fmtDate(m.date)}</span>
                                </span>
                                <span className="flex-shrink-0">
                                  <span className={idx === 0 ? 'text-emerald-400 font-medium' : 'text-gray-300'}>{fmt(m.price)}</span>
                                  {idx > 0 && <span className="text-red-400/80 ml-1.5">+{fmt(m.price - best)}</span>}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )
                    })()}
                    <p className="text-gray-500 text-xs mb-2 uppercase tracking-wider">Histórico de preços</p>
                    <div className="flex flex-col gap-1">
                      {[...item.priceHistory].reverse().map((h, idx) => (
                        <div key={idx} className="flex justify-between text-xs gap-3">
                          <span className="text-gray-500">{fmtDate(h.date)}{h.mercado ? ` · ${h.mercado}` : ''}{h.brand ? ` · ${h.brand}` : ''}</span>
                          <span className="text-gray-300 flex-shrink-0">{fmt(h.price)}/{item.unit}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

function EditRow({ item, categories, units, decimals, onSave, onCancel }) {
  const [form, setForm] = useState({
    name: item.name || '',
    category: item.category || 'Mercearia',
    unit: item.unit || 'un',
    lastPrice: Number(item.lastPrice) || 0,
  })

  function set(field, value) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  return (
    <div className="bg-gray-800/80 px-4 py-3 border-b border-gray-700 space-y-2">
      <input value={form.name} onChange={e => set('name', e.target.value)}
        className="w-full bg-gray-900 text-white px-3 py-2 rounded-lg outline-none text-sm border border-gray-700" />
      <div className="flex gap-2">
        <select value={form.category} onChange={e => set('category', e.target.value)}
          className="flex-1 bg-gray-900 text-white px-3 py-2 rounded-lg outline-none text-sm border border-gray-700">
          {categories.map(c => <option key={c}>{c}</option>)}
        </select>
        <select value={form.unit} onChange={e => set('unit', e.target.value)}
          className="bg-gray-900 text-white px-3 py-2 rounded-lg outline-none text-sm border border-gray-700">
          {units.map(u => <option key={u} value={u}>{u} · {UNIT_LABELS[u]}</option>)}
        </select>
      </div>
      <div className="flex items-center bg-gray-900 rounded-lg px-3 border border-gray-700">
        <span className="text-gray-500 text-xs">R$</span>
        <MoneyInput value={form.lastPrice} onChange={v => set('lastPrice', v)} decimals={decimals}
          placeholder="Preço" className="flex-1 bg-transparent text-white py-2 px-2 outline-none text-base" />
      </div>
      <div className="flex gap-2">
        <button onClick={onCancel} className="flex-1 bg-gray-700 text-white py-2 rounded-lg text-sm">Cancelar</button>
        <button onClick={() => onSave({ name: form.name, category: form.category, unit: form.unit, lastPrice: form.lastPrice || 0 })}
          className="flex-1 bg-green-600 text-white py-2 rounded-lg text-sm font-medium">Salvar</button>
      </div>
    </div>
  )
}
