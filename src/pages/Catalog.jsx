import { useEffect, useState } from 'react'
import { collection, onSnapshot, orderBy, query, doc, updateDoc, deleteDoc, setDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase'
import { useFamily } from '../context/FamilyContext'
import { fmtDate, normalizePriceHistory, queueWrite } from '../lib/firestore'
import { latestByMarket } from '../lib/prices'
import MoneyInput from '../components/MoneyInput'
import { IconEdit, IconTrash, IconChevronDown, IconChevronRight, IconTrendingUp, IconBadge, IconList, IconCheck } from '../components/Icon'
import { UNITS, UNIT_LABELS } from '../lib/nfceMatch'
import { CATEGORIES } from '../lib/categories'
import { groupForDisplay, useSortMode } from '../lib/sortMode'
import { useListDrag } from '../lib/useListDrag'
import SwipeRow from '../components/SwipeRow'
import TipBanner from '../components/TipBanner'
import { useTips } from '../lib/tips'
import { invalidateCatalog } from '../lib/catalogCache'
import { ask, toast } from '../lib/feedback'
import { deletePriceEntry } from '../lib/purchasePrices'


function fmt(n) {
  if (!n) return '—'
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

// Lista aberta na aba Lista (gravada pela ActiveList neste aparelho)
function currentList(familyId) {
  try { return JSON.parse(localStorage.getItem(`lastList_${familyId}`)) || { id: 'default', name: 'Compras gerais' } } catch { return { id: 'default', name: 'Compras gerais' } }
}

export default function Catalog() {
  const { familyId, userDoc } = useFamily()
  const decimals = userDoc?.priceDecimals === 3 ? 3 : 2
  const [items, setItems] = useState([])
  const [search, setSearch] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [collapsed, setCollapsed] = useState({})
  const [priceHistoryId, setPriceHistoryId] = useState(null)
  const [list] = useState(() => currentList(familyId))
  const [inList, setInList] = useState({}) // nome em minúsculas -> item da lista

  // O que já está na lista, para destacar no catálogo
  useEffect(() => {
    if (!familyId || !list?.id) return
    return onSnapshot(collection(db, 'families', familyId, 'lists', list.id, 'entries'), snap => {
      const map = {}
      snap.docs.forEach(d => { map[String(d.data().name || '').toLowerCase()] = { id: d.id, ...d.data() } })
      setInList(map)
    })
  }, [familyId, list?.id])

  // Adiciona direto na lista sem sair do catálogo (quantidade 1, último preço)
  function addToList(item) {
    const ref = doc(collection(db, 'families', familyId, 'lists', list.id, 'entries'))
    const price = Number(item.lastPrice) || 0
    queueWrite(setDoc(ref, {
      name: item.name, category: item.category || 'Outros', unit: item.unit || 'un',
      qty: 1, pricePerUnit: price, totalPrice: price, obs: '', brand: '',
      checked: false, createdAt: serverTimestamp(),
    }), 'adicionar à lista')
    toast(`"${item.name}" na lista.`, {
      tone: 'ok', action: { label: 'Desfazer', run: () => queueWrite(deleteDoc(ref), 'desfazer') },
    })
  }

  function removeFromList(entry) {
    const { id, ...data } = entry
    const ref = doc(db, 'families', familyId, 'lists', list.id, 'entries', id)
    queueWrite(deleteDoc(ref), 'tirar da lista')
    toast(`"${entry.name}" saiu da lista.`, { action: { label: 'Desfazer', run: () => queueWrite(setDoc(ref, data), 'desfazer') } })
  }

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

  // Categorias (mais itens primeiro) ou A–Z — mesma escolha da Lista
  const [sortMode, setSortMode] = useSortMode()
  const tips = useTips()
  const displayGroups = groupForDisplay(filtered, sortMode)

  // Segurar e soltar em outra categoria: corrige a categoria do produto (e do item na lista, se estiver)
  function handleDrop(id, { cat }) {
    const item = items.find(i => i.id === id)
    if (!item || (item.category || 'Outros') === cat) return
    const prev = item.category || 'Outros'
    const entry = inList[item.name.toLowerCase()]
    const apply = category => {
      queueWrite(updateDoc(doc(db, 'families', familyId, 'catalog', id), { category }), 'mudar categoria')
      if (entry) queueWrite(updateDoc(doc(db, 'families', familyId, 'lists', list.id, 'entries', entry.id), { category }), 'mudar categoria')
    }
    apply(cat)
    tips.mark('tip-catalog-drag')
    toast(`"${item.name}" movido para ${cat}.`, { action: { label: 'Desfazer', run: () => apply(prev) } })
  }
  const { drag, start: startDrag, move: moveDrag, end: endDrag } = useListDrag(handleDrop)

  function saveEdit(id, data) {
    queueWrite(updateDoc(doc(db, 'families', familyId, 'catalog', id), data), 'salvar o produto')
    invalidateCatalog(familyId)
    setEditingId(null)
  }

  async function removePrice(item, entry) {
    if (!await ask({
      title: `Remover ${fmt(entry.price)} de ${item.name}?`,
      message: `Preço de ${fmtDate(entry.date)}${entry.mercado ? ` no ${entry.mercado}` : ''}. Sai do histórico, dos relatórios e da comparação entre mercados.`,
      confirm: 'Remover preço', danger: true,
    })) return
    const { committed, undo } = deletePriceEntry(familyId, item, entry)
    queueWrite(committed, 'remover o preço')
    toast('Preço removido.', { action: { label: 'Desfazer', run: () => queueWrite(undo(), 'desfazer') } })
  }

  // Remove na hora e oferece "Desfazer" (regrava o produto com o histórico de preços)
  function handleDelete(item, viaButton = false) {
    const { id, ...data } = item
    const ref = doc(db, 'families', familyId, 'catalog', id)
    queueWrite(deleteDoc(ref), 'remover o produto')
    invalidateCatalog(familyId)
    const tip = viaButton ? tips.take('tip-catalog-swipe', 'Dica: deslize ← para excluir e → para pôr na lista.') : ''
    if (!viaButton) tips.mark('tip-catalog-swipe')
    toast(`"${item.name}" removido do catálogo.${tip ? ` ${tip}` : ''}`, {
      action: { label: 'Desfazer', run: () => queueWrite(setDoc(ref, data), 'desfazer') },
    })
  }

  function toggleCollapse(cat) {
    setCollapsed(prev => ({ ...prev, [cat]: !prev[cat] }))
  }

  return (
    <div className="flex flex-col min-h-svh bg-gray-900">
      <div className="px-4 pb-3 border-b border-gray-800 header-safe">
        <h1 className="text-white text-xl font-semibold mb-3">Catálogo</h1>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar item..."
          aria-label="Buscar no catálogo"
          type="search"
          className="w-full bg-gray-800 text-white px-4 py-2.5 rounded-xl outline-none text-sm border border-gray-700 focus:border-gray-600"
        />
        <div className="flex items-center justify-between mt-3 gap-3">
          <p className="text-gray-500 text-xs">Ordem</p>
          <div className="flex bg-gray-800 rounded-lg p-0.5 border border-gray-700 flex-shrink-0" role="radiogroup" aria-label="Ordem">
            {[['category', 'Categorias'], ['alpha', 'A–Z']].map(([value, label]) => (
              <button key={value} role="radio" aria-checked={sortMode === value} onClick={() => setSortMode(value)}
                className={`px-2.5 min-h-8 text-xs rounded-md ${sortMode === value ? 'bg-green-500 text-white' : 'text-gray-400'}`}>
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {items.length > 0 && (
        <TipBanner id="tip-catalog">Deslize o produto → para pôr na lista e ← para excluir. Segure e arraste para outra categoria se estiver errada.</TipBanner>
      )}
      <div className="flex-1 overflow-y-auto pb-20">
        {filtered.length === 0 && (
          <div className="text-center mt-20 px-8">
            {search ? (
              <>
                <p className="text-white text-sm font-medium">Nada encontrado para "{search}"</p>
                <button onClick={() => setSearch('')} className="text-green-400 text-sm font-medium min-h-11 px-3 mt-2">Limpar busca</button>
              </>
            ) : (
              <>
                <IconBadge><IconList size={24} /></IconBadge>
                <p className="text-white text-sm font-medium mt-4">Catálogo vazio</p>
                <p className="text-gray-500 text-xs mt-1">Cada item que você coloca na lista fica salvo aqui, com o histórico de preços.</p>
              </>
            )}
          </div>
        )}

        {displayGroups.map(({ cat, items: group }) => (
          <div key={cat || 'az'}>
            {/* Cabeçalho da categoria (abre/fecha; também é destino ao arrastar) */}
            {cat && (
              <button onClick={() => toggleCollapse(cat)} data-cat-header={cat}
                className={`flex items-center justify-between w-full px-4 py-2.5 bg-gray-900 sticky top-0 border-b ${drag && drag.target?.cat === cat && !drag.target.initial ? 'border-green-500' : 'border-gray-800'}`}>
                <span className={`text-xs uppercase tracking-wider font-medium ${drag && drag.target?.cat === cat && !drag.target.initial ? 'text-green-400' : 'text-gray-500'}`}>{cat}</span>
                <div className="flex items-center gap-2">
                  <span className="text-gray-700 text-xs">{group.length}</span>
                  <span className="text-gray-700">{collapsed[cat] ? <IconChevronRight size={12} /> : <IconChevronDown size={12} />}</span>
                </div>
              </button>
            )}

            {!(cat && collapsed[cat]) && group.map((item, i) => (
              <div key={item.id} data-entry-id={item.id} data-cat={cat || ''}
                className={drag?.id === item.id ? 'relative z-20 pointer-events-none shadow-2xl ring-1 ring-green-500/50 rounded-lg' : ''}
                style={drag?.id === item.id ? { transform: `translateY(${drag.dy}px) scale(1.02)` } : undefined}>
                {editingId === item.id ? (
                  <EditRow item={item} categories={CATEGORIES} units={UNITS} decimals={decimals}
                    onSave={data => saveEdit(item.id, data)}
                    onCancel={() => setEditingId(null)} />
                ) : (
                  <SwipeRow
                    onSwipeRight={() => (inList[item.name.toLowerCase()] ? removeFromList(inList[item.name.toLowerCase()]) : addToList(item))}
                    rightLabel={inList[item.name.toLowerCase()] ? 'Tirar da lista' : 'Pôr na lista'}
                    checked={false}
                    onSwipeLeft={() => handleDelete(item)}
                    onLongPress={cat ? (x, y) => startDrag(item.id, cat, x, y) : undefined}
                    onDragMove={moveDrag} onDragEnd={endDrag}>
                  <div className={`flex items-center gap-3 px-4 py-2.5 ${inList[item.name.toLowerCase()] ? 'bg-green-500/5 shadow-[inset_3px_0_0_var(--color-green-500)]' : ''} ${i < group.length - 1 ? 'border-b border-gray-800/60' : ''}`}>
                    <div className="flex-1 min-w-0">
                      <span className="text-white text-sm">{item.name}</span>
                      <div className="text-gray-600 text-xs mt-0.5">{item.unit} · {fmt(item.lastPrice)}</div>
                      {(() => {
                        const markets = latestByMarket(item.priceHistory)
                        return markets.length > 1 && (
                          <div className="text-emerald-400/80 text-xs mt-0.5 truncate">
                            Melhor: {fmt(markets[0].price)} no {markets[0].mercado}
                          </div>
                        )
                      })()}
                    </div>

                    {/* Price history indicator */}
                    {item.priceHistory?.length > 0 && (
                      <button onClick={() => setPriceHistoryId(priceHistoryId === item.id ? null : item.id)} aria-label={`Histórico de preços de ${item.name}`} aria-expanded={priceHistoryId === item.id}
                        className="text-gray-400 hover:text-gray-200 min-w-9 min-h-11 flex items-center justify-center">
                        <IconTrendingUp size={16} />
                      </button>
                    )}

                    {inList[item.name.toLowerCase()] ? (
                      <button onClick={() => removeFromList(inList[item.name.toLowerCase()])}
                        aria-label={`${item.name} está na lista. Tocar para tirar`}
                        className="text-green-300 text-xs font-medium px-2.5 min-h-9 rounded-lg border border-green-500/40 bg-green-500/10 flex items-center gap-1 flex-shrink-0">
                        <IconCheck size={12} /> Na lista
                      </button>
                    ) : (
                      <button onClick={() => addToList(item)}
                        aria-label={`Adicionar ${item.name} à lista`} className="btn-brand text-xs font-semibold px-3 min-h-9 rounded-lg flex-shrink-0">
                        + lista
                      </button>
                    )}
                    <button onClick={() => setEditingId(item.id)} aria-label={`Editar ${item.name}`} className="text-gray-400 hover:text-gray-200 min-w-9 min-h-11 flex items-center justify-center">
                      <IconEdit size={16} />
                    </button>
                    <button onClick={() => handleDelete(item, true)} aria-label={`Remover ${item.name} do catálogo`} className="text-gray-500 hover:text-red-400 min-w-9 min-h-11 -mr-2 flex items-center justify-center">
                      <IconTrash size={16} />
                    </button>
                  </div>
                  </SwipeRow>
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
                        <div key={idx} className="flex items-center justify-between text-xs gap-3">
                          <span className="text-gray-500 flex-1 min-w-0">{fmtDate(h.date)}{h.mercado ? ` · ${h.mercado}` : ''}{h.brand ? ` · ${h.brand}` : ''}</span>
                          <span className="text-gray-300 flex-shrink-0">{fmt(h.price)}/{item.unit}</span>
                          <button onClick={() => removePrice(item, h)} aria-label={`Remover preço de ${fmtDate(h.date)}`}
                            className="text-gray-600 active:text-red-400 min-w-9 min-h-9 -my-2 -mr-2 flex items-center justify-center">
                            <IconTrash size={13} />
                          </button>
                        </div>
                      ))}
                      <p className="text-gray-600 text-xs mt-1">Preço errado? Remova pela lixeira. As compras não mudam.</p>
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
