import { useEffect, useState } from 'react'
import {
  collection, onSnapshot, addDoc, updateDoc, deleteDoc,
  doc, setDoc, serverTimestamp, getDocs, arrayUnion
} from 'firebase/firestore'
import { db } from '../firebase'
import { useFamily } from '../context/FamilyContext'
import { useAuth } from '../context/AuthContext'
import ItemForm from '../components/ItemForm'
import ListManager from '../components/ListManager'
import { IconEdit, IconTrash, IconChevronDown, IconCheck, IconPlus, IconX } from '../components/Icon'

const CATEGORY_ORDER = ['Hortifruti', 'Carne', 'Laticínios', 'Mercearia', 'Padaria', 'Limpeza', 'Higiene', 'Bebidas', 'Outros']

function fmt(n) {
  return (n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export default function ActiveList({ pendingAddFromCatalog, onCatalogItemHandled }) {
  const { familyId } = useFamily()
  const user = useAuth()
  const [listId, setListId] = useState(null)
  const [listName, setListName] = useState('')
  const [entries, setEntries] = useState([])
  const [catalog, setCatalog] = useState({})
  const [showForm, setShowForm] = useState(false)
  const [editItem, setEditItem] = useState(null)
  const [prefillItem, setPrefillItem] = useState(null)
  const [showChecked, setShowChecked] = useState(true)
  const [showManager, setShowManager] = useState(false)
  const [finishing, setFinishing] = useState(false)
  const [mercado, setMercado] = useState('')
  const [mercadoOptions, setMercadoOptions] = useState([])
  const [mercadoFocused, setMercadoFocused] = useState(false)
  const [pricePrompt, setPricePrompt] = useState(null) // entry awaiting price before check

  // Load last list
  useEffect(() => {
    if (!familyId) return
    const saved = localStorage.getItem(`lastList_${familyId}`)
    if (saved) {
      try { const { id, name } = JSON.parse(saved); setListId(id); setListName(name) } catch {}
    } else {
      addDoc(collection(db, 'families', familyId, 'lists'), {
        name: 'Compras gerais', status: 'active', createdAt: serverTimestamp(),
      }).then(ref => {
        setListId(ref.id); setListName('Compras gerais')
        localStorage.setItem(`lastList_${familyId}`, JSON.stringify({ id: ref.id, name: 'Compras gerais' }))
      })
    }
  }, [familyId])

  // Subscribe entries
  useEffect(() => {
    if (!familyId || !listId) return
    return onSnapshot(collection(db, 'families', familyId, 'lists', listId, 'entries'), snap => {
      setEntries(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    })
  }, [familyId, listId])

  // Load catalog for price signals
  useEffect(() => {
    if (!familyId) return
    return onSnapshot(collection(db, 'families', familyId, 'catalog'), snap => {
      const map = {}
      snap.docs.forEach(d => { map[d.id] = d.data() })
      setCatalog(map)
    })
  }, [familyId])

  // Load mercado options
  useEffect(() => {
    if (!familyId) return
    getDocs(collection(db, 'families', familyId, 'mercados')).then(snap => {
      setMercadoOptions(snap.docs.map(d => d.data().name))
    })
  }, [familyId])

  // Handle add from catalog
  useEffect(() => {
    if (!pendingAddFromCatalog) return
    setPrefillItem({
      name: pendingAddFromCatalog.name,
      category: pendingAddFromCatalog.category || 'Mercearia',
      unit: pendingAddFromCatalog.unit || 'un',
      pricePerUnit: pendingAddFromCatalog.lastPrice || 0,
      obs: '', qty: 1,
      totalPrice: pendingAddFromCatalog.lastPrice || 0,
    })
    setShowForm(true)
    onCatalogItemHandled()
  }, [pendingAddFromCatalog])

  function selectList(id, name) {
    setListId(id); setListName(name)
    localStorage.setItem(`lastList_${familyId}`, JSON.stringify({ id, name }))
  }

  const pending = entries.filter(e => !e.checked)
  const checked = entries.filter(e => e.checked)
  const totalPending = pending.reduce((s, e) => s + (e.totalPrice || 0), 0)
  const totalChecked = checked.reduce((s, e) => s + (e.totalPrice || 0), 0)
  const totalAll = entries.reduce((s, e) => s + (e.totalPrice || 0), 0)

  function groupBy(items) {
    const groups = {}
    for (const item of items) {
      const cat = item.category || 'Outros'
      if (!groups[cat]) groups[cat] = []
      groups[cat].push(item)
    }
    return CATEGORY_ORDER.filter(c => groups[c]).map(c => ({ cat: c, items: groups[c] }))
  }

  async function doCheck(entry, priceOverride) {
    const updates = { checked: true, checkedBy: user.uid, checkedAt: serverTimestamp() }
    if (priceOverride > 0) {
      const qty = Number(entry.qty) || 1
      updates.pricePerUnit = priceOverride
      updates.totalPrice = priceOverride * qty
    }
    await updateDoc(doc(db, 'families', familyId, 'lists', listId, 'entries', entry.id), updates)
  }

  function toggleCheck(entry) {
    if (entry.checked) {
      // uncheck — no prompt needed
      updateDoc(doc(db, 'families', familyId, 'lists', listId, 'entries', entry.id), {
        checked: false, checkedBy: user.uid, checkedAt: serverTimestamp(),
      })
      return
    }
    if (!Number(entry.pricePerUnit)) {
      setPricePrompt(entry)
      return
    }
    doCheck(entry, 0)
  }

  async function uncheckAll() {
    for (const e of checked) {
      await updateDoc(doc(db, 'families', familyId, 'lists', listId, 'entries', e.id), { checked: false })
    }
  }

  async function clearPending() {
    if (!confirm(`Remover os ${pending.length} itens pendentes?`)) return
    for (const e of pending) {
      await deleteDoc(doc(db, 'families', familyId, 'lists', listId, 'entries', e.id))
    }
  }

  async function handleSave(data) {
    const col = collection(db, 'families', familyId, 'lists', listId, 'entries')
    if (editItem) {
      await updateDoc(doc(db, 'families', familyId, 'lists', listId, 'entries', editItem.id), data)
    } else {
      await addDoc(col, { ...data, checked: false, createdAt: serverTimestamp() })
    }
    if (data.pricePerUnit > 0) {
      await setDoc(doc(db, 'families', familyId, 'catalog', data.name.toLowerCase()), {
        name: data.name, category: data.category, unit: data.unit,
        lastPrice: data.pricePerUnit,
        priceHistory: arrayUnion({ price: data.pricePerUnit, date: new Date().toISOString().slice(0, 10) }),
      }, { merge: true })
    }
    setShowForm(false); setEditItem(null); setPrefillItem(null)
  }

  async function handleDelete(id) {
    await deleteDoc(doc(db, 'families', familyId, 'lists', listId, 'entries', id))
  }

  async function finishShopping() {
    const mercadoName = mercado.trim() || 'Não informado'
    const today = new Date().toISOString().slice(0, 10)
    await addDoc(collection(db, 'families', familyId, 'history'), {
      createdAt: serverTimestamp(),
      mercado: mercadoName,
      listName,
      total: totalChecked,
      items: checked.map(e => ({ name: e.name, qty: e.qty, unit: e.unit, totalPrice: e.totalPrice, pricePerUnit: e.pricePerUnit, category: e.category })),
    })
    if (mercado.trim()) {
      await setDoc(doc(db, 'families', familyId, 'mercados', mercado.trim().toLowerCase()), { name: mercado.trim() })
    }
    // update catalog with price + mercado
    for (const e of checked) {
      if (Number(e.pricePerUnit) > 0) {
        await setDoc(doc(db, 'families', familyId, 'catalog', e.name.toLowerCase()), {
          name: e.name, category: e.category, unit: e.unit,
          lastPrice: e.pricePerUnit,
          priceHistory: arrayUnion({ price: e.pricePerUnit, date: today, mercado: mercadoName }),
        }, { merge: true })
      }
    }
    for (const e of checked) {
      await deleteDoc(doc(db, 'families', familyId, 'lists', listId, 'entries', e.id))
    }
    setFinishing(false); setMercado('')
  }

  const mercadoFiltered = mercadoOptions.filter(m => m.toLowerCase().includes(mercado.toLowerCase()))

  if (finishing) {
    return (
      <div className="fixed inset-0 bg-black/70 z-50 flex items-end">
        <div className="bg-gray-900 rounded-t-3xl w-full p-6 pb-10">
          <div className="w-10 h-1 bg-gray-700 rounded-full mx-auto mb-6" />
          <h2 className="text-white text-lg font-semibold mb-1">Finalizar compra</h2>
          <p className="text-gray-400 text-sm mb-5">{checked.length} itens · {fmt(totalChecked)}</p>
          <div className="relative mb-5">
            <input value={mercado} onChange={e => setMercado(e.target.value)}
              onFocus={() => setMercadoFocused(true)} onBlur={() => setTimeout(() => setMercadoFocused(false), 150)}
              placeholder="Qual mercado? (opcional)"
              className="w-full bg-gray-800 text-white px-4 py-3 rounded-xl outline-none text-sm" />
            {mercadoFocused && mercadoFiltered.length > 0 && (
              <div className="absolute top-full left-0 right-0 bg-gray-800 rounded-xl mt-1 overflow-hidden z-10 shadow-xl border border-gray-700">
                {mercadoFiltered.map(s => (
                  <button key={s} onMouseDown={() => setMercado(s)}
                    className="w-full text-left px-4 py-3 text-white text-sm border-b border-gray-700 last:border-0 hover:bg-gray-700">
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="flex gap-3">
            <button onClick={() => setFinishing(false)} className="flex-1 bg-gray-800 text-white font-medium py-3.5 rounded-xl text-sm">Cancelar</button>
            <button onClick={finishShopping} className="flex-1 bg-green-500 text-white font-semibold py-3.5 rounded-xl text-sm">Registrar</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col min-h-svh bg-gray-900">
      {/* Header */}
      <div className="px-4 pt-12 pb-3 border-b border-gray-800">
        <button onClick={() => setShowManager(true)} className="flex items-center gap-1.5 mb-1">
          <h1 className="text-white text-xl font-semibold">{listName || '...'}</h1>
          <span className="text-gray-500"><IconChevronDown size={16} /></span>
        </button>
        <div className="flex gap-3 text-xs text-gray-500">
          <span>{pending.length} pendentes · {fmt(totalPending)}</span>
          <span>·</span>
          <span>Total {fmt(totalAll)}</span>
        </div>
      </div>

      {/* Actions bar */}
      {(pending.length > 0 || checked.length > 0) && (
        <div className="flex gap-2 px-4 py-2 border-b border-gray-800">
          {checked.length > 0 && (
            <button onClick={uncheckAll} className="text-xs text-gray-500 flex items-center gap-1 px-2 py-1 rounded-md hover:bg-gray-800">
              Desmarcar tudo
            </button>
          )}
          {pending.length > 0 && (
            <button onClick={clearPending} className="text-xs text-gray-500 flex items-center gap-1 px-2 py-1 rounded-md hover:bg-gray-800">
              Limpar pendentes
            </button>
          )}
          {checked.length > 0 && (
            <button onClick={() => setFinishing(true)}
              className="ml-auto text-xs text-green-400 font-semibold px-3 py-1 rounded-md bg-green-500/10">
              Finalizar · {fmt(totalChecked)}
            </button>
          )}
        </div>
      )}

      {/* List */}
      <div className="flex-1 overflow-y-auto pb-28">
        {entries.length === 0 && (
          <div className="text-center text-gray-600 mt-24">
            <div className="text-4xl mb-3">🛒</div>
            <p className="text-sm">Nenhum item na lista</p>
          </div>
        )}

        {groupBy(pending).map(({ cat, items }) => (
          <div key={cat}>
            <p className="text-gray-600 text-xs uppercase tracking-wider px-4 pt-4 pb-1">{cat}</p>
            {items.map((entry, i) => {
              const catKey = entry.name.toLowerCase()
              const catalogItem = catalog[catKey]
              const lastPrice = catalogItem?.lastPrice
              const priceDiff = lastPrice && entry.pricePerUnit > 0 && Math.abs(entry.pricePerUnit - lastPrice) > 0.01
                ? entry.pricePerUnit - lastPrice : null
              return (
                <EntryRow key={entry.id} entry={entry} priceDiff={priceDiff}
                  isLast={i === items.length - 1}
                  onCheck={() => toggleCheck(entry)}
                  onEdit={() => { setEditItem(entry); setPrefillItem(null); setShowForm(true) }}
                  onDelete={() => handleDelete(entry.id)}
                />
              )
            })}
          </div>
        ))}

        {checked.length > 0 && (
          <div>
            <button onClick={() => setShowChecked(v => !v)}
              className="flex items-center justify-between w-full px-4 pt-4 pb-1 text-gray-600">
              <span className="text-xs uppercase tracking-wider">Peguei ({checked.length}) · {fmt(totalChecked)}</span>
              <span className="text-xs">{showChecked ? '▼' : '▶'}</span>
            </button>
            {showChecked && groupBy(checked).map(({ cat, items }) => (
              <div key={cat} className="opacity-50">
                <p className="text-gray-600 text-xs uppercase tracking-wider px-4 pt-2 pb-1">{cat}</p>
                {items.map((entry, i) => (
                  <EntryRow key={entry.id} entry={entry} checked
                    isLast={i === items.length - 1}
                    onCheck={() => toggleCheck(entry)}
                    onEdit={() => { setEditItem(entry); setPrefillItem(null); setShowForm(true) }}
                    onDelete={() => handleDelete(entry.id)}
                  />
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add button */}
      <div className="fixed bottom-16 left-0 right-0 max-w-lg mx-auto px-4 pb-2">
        <button onClick={() => { setEditItem(null); setPrefillItem(null); setShowForm(true) }}
          className="w-full bg-gray-800 border border-gray-700 text-gray-300 font-medium py-3.5 rounded-2xl flex items-center justify-center gap-2 shadow-xl text-sm">
          <IconPlus /> Adicionar item
        </button>
      </div>

      {pricePrompt && (
        <PricePromptModal
          entry={pricePrompt}
          onConfirm={(price) => { doCheck(pricePrompt, price); setPricePrompt(null) }}
          onSkip={() => { doCheck(pricePrompt, 0); setPricePrompt(null) }}
          onCancel={() => setPricePrompt(null)}
        />
      )}

      {showManager && (
        <ListManager activeListId={listId} onSelect={selectList} onClose={() => setShowManager(false)} />
      )}

      {showForm && (
        <ItemForm
          initial={prefillItem || editItem}
          onSave={handleSave}
          onCancel={() => { setShowForm(false); setEditItem(null); setPrefillItem(null) }}
        />
      )}
    </div>
  )
}

function EntryRow({ entry, onCheck, onEdit, onDelete, isLast, checked: isChecked, priceDiff }) {
  return (
    <div className={`flex items-center gap-3 px-4 py-2.5 ${!isLast ? 'border-b border-gray-800/60' : ''}`}>
      <button onClick={onCheck}
        className={`w-5 h-5 rounded-full border flex items-center justify-center flex-shrink-0 transition-all
          ${isChecked ? 'bg-green-500 border-green-500' : 'border-gray-600'}`}>
        {isChecked && <IconCheck size={10} />}
      </button>

      <div className="flex-1 min-w-0 cursor-pointer" onClick={onEdit}>
        <span className={`text-sm ${isChecked ? 'line-through text-gray-600' : 'text-white'}`}>{entry.name}</span>
        {entry.obs && <span className="text-gray-600 text-xs ml-2">{entry.obs}</span>}
        <div className="text-gray-600 text-xs mt-0.5">
          {entry.qty} {entry.unit}
          {Number(entry.pricePerUnit) > 0 && ` · ${Number(entry.pricePerUnit).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}/${entry.unit}`}
          {priceDiff !== null && priceDiff !== undefined && (
            <span className={`ml-1 ${priceDiff > 0 ? 'text-red-400' : 'text-green-400'}`}>
              ({priceDiff > 0 ? '+' : ''}{Number(priceDiff).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })})
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3 flex-shrink-0">
        {Number(entry.totalPrice) > 0 && (
          <span className={`text-sm font-medium ${isChecked ? 'text-gray-600' : 'text-gray-300'}`}>
            {Number(entry.totalPrice).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
          </span>
        )}
        <button onClick={onDelete} className="text-gray-500 hover:text-gray-300 p-1">
          <IconX size={14} />
        </button>
      </div>
    </div>
  )
}

function PricePromptModal({ entry, onConfirm, onSkip, onCancel }) {
  const [price, setPrice] = useState('')

  return (
    <div className="fixed inset-0 bg-black/75 z-50 flex items-end" onClick={onCancel}>
      <div className="bg-gray-900 rounded-t-3xl w-full max-w-lg mx-auto p-6 pb-10 border-t border-gray-800"
        onClick={e => e.stopPropagation()}>
        <div className="w-10 h-1 bg-gray-700 rounded-full mx-auto mb-5" />
        <p className="text-gray-400 text-xs uppercase tracking-wider mb-1">Item sem valor</p>
        <p className="text-white font-semibold text-lg mb-1">{entry.name}</p>
        <p className="text-gray-500 text-sm mb-5">
          {entry.qty} {entry.unit} · Qual o preço encontrado?
        </p>

        <div className="flex items-center bg-gray-800 rounded-xl px-4 mb-5 border border-gray-700">
          <span className="text-gray-400 text-base mr-2">R$</span>
          <input
            autoFocus
            value={price}
            onChange={e => setPrice(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && price && onConfirm(parseFloat(price))}
            inputMode="decimal"
            placeholder="0,00"
            className="flex-1 bg-transparent text-white text-xl py-4 outline-none"
          />
        </div>

        <div className="flex gap-3">
          <button onClick={onSkip}
            className="flex-1 bg-gray-800 text-gray-400 font-medium py-3.5 rounded-xl text-sm border border-gray-700">
            Marcar sem valor
          </button>
          <button
            onClick={() => price ? onConfirm(parseFloat(price.replace(',', '.'))) : onSkip()}
            className="flex-1 bg-green-500 text-white font-semibold py-3.5 rounded-xl text-sm">
            {price ? 'Confirmar' : 'Pular'}
          </button>
        </div>
      </div>
    </div>
  )
}
