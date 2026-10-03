import { useEffect, useState } from 'react'
import { collection, getDocs, orderBy, query } from 'firebase/firestore'
import { db } from '../firebase'
import { useFamily } from '../context/FamilyContext'
import { parsePrice } from '../lib/firestore'
import { roundTo } from '../lib/money'
import { useVisualViewport } from '../lib/useVisualViewport'
import MoneyInput from './MoneyInput'

function fmtBRL(n) {
  return Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

const CATEGORIES = ['Hortifruti', 'Carne', 'Laticínios', 'Mercearia', 'Padaria', 'Limpeza', 'Higiene', 'Bebidas', 'Outros']
const UNITS = ['un', 'kg', 'g', 'dz', 'ml', 'l']

const empty = { name: '', obs: '', category: 'Mercearia', qty: '1', unit: 'un', pricePerUnit: 0, totalPrice: 0 }

// Lembra "Já está no carrinho" enquanto o app estiver aberto (cadastro em série no mercado)
let lastInCart = false

export default function ItemForm({ onSave, onCancel, onDelete, initial, defaultInCart = false }) {
  const { familyId, userDoc } = useFamily()
  const decimals = userDoc?.priceDecimals === 3 ? 3 : 2
  const isNew = !initial?.id
  const [inCart, setInCart] = useState(isNew && (defaultInCart || lastInCart))
  const [form, setForm] = useState(initial ? {
    ...initial,
    qty: String(initial.qty).replace('.', ','),
    pricePerUnit: Number(initial.pricePerUnit) || 0,
    totalPrice: Number(initial.totalPrice) || 0,
  } : empty)
  const [catalog, setCatalog] = useState([])
  const [suggestions, setSuggestions] = useState([])
  const viewport = useVisualViewport()

  useEffect(() => {
    if (!familyId) return
    getDocs(query(collection(db, 'families', familyId, 'catalog'), orderBy('name'))).then(snap => {
      setCatalog(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    })
  }, [familyId])

  function set(field, value) {
    setForm(prev => {
      const next = { ...prev, [field]: value }
      if (field === 'qty' || field === 'pricePerUnit') {
        next.totalPrice = roundTo((parsePrice(next.qty) || 0) * (next.pricePerUnit || 0), 2)
      }
      if (field === 'totalPrice') {
        const q = parsePrice(next.qty) || 0
        if (q > 0) next.pricePerUnit = roundTo(value / q, decimals)
      }
      return next
    })
  }

  function handleNameChange(val) {
    set('name', val)
    if (val.length < 2) { setSuggestions([]); return }
    setSuggestions(catalog.filter(i => i.name.toLowerCase().includes(val.toLowerCase())).slice(0, 5))
  }

  function applySuggestion(item) {
    setForm(prev => ({
      ...prev,
      name: item.name,
      category: item.category || prev.category,
      unit: item.unit || prev.unit,
      pricePerUnit: Number(item.lastPrice) || 0,
      totalPrice: roundTo((parsePrice(prev.qty) || 0) * (Number(item.lastPrice) || 0), 2),
    }))
    setSuggestions([])
  }

  const [categoryError, setCategoryError] = useState(false)

  function handleSave() {
    if (!form.name.trim()) return
    if (!form.category) { setCategoryError(true); return }
    setCategoryError(false)
    if (isNew && !defaultInCart) lastInCart = inCart
    onSave({
      name: form.name.trim(),
      obs: (form.obs || '').trim(),
      category: form.category,
      qty: parsePrice(form.qty) || 1,
      unit: form.unit,
      pricePerUnit: Number(form.pricePerUnit) || 0,
      totalPrice: Number(form.totalPrice) || 0,
    }, { inCart: isNew && inCart })
  }

  const step = form.unit === 'kg' || form.unit === 'l' ? 0.1 : 1
  const field = 'bg-gray-800 text-white rounded-xl outline-none border border-transparent focus:border-green-500'

  return (
    <div className="fixed inset-x-0 z-50 bg-black/70 flex items-end" onClick={onCancel}
      style={{ top: viewport.offsetTop, height: viewport.height }}>
      <div className="bg-gray-900 rounded-t-3xl w-full max-w-lg mx-auto px-4 pt-3 max-h-full overflow-y-auto"
        style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}
        onClick={e => e.stopPropagation()}>
        <div className="w-10 h-1 bg-gray-700 rounded-full mx-auto mb-3" />

        {/* Nome */}
        <div className="relative mb-2">
          <input
            autoFocus
            value={form.name}
            onChange={e => handleNameChange(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSave()}
            placeholder="Nome do item"
            enterKeyHint="done"
            className={`w-full text-lg font-semibold px-3 py-2.5 ${field}`}
          />
          {suggestions.length > 0 && (
            <div className="absolute top-full left-0 right-0 bg-gray-800 rounded-xl mt-1 overflow-hidden z-10 shadow-xl border border-gray-700">
              {suggestions.map(s => (
                <button key={s.id} onClick={() => applySuggestion(s)}
                  className="w-full text-left px-3 py-2.5 text-white text-sm hover:bg-gray-700 flex justify-between items-center border-b border-gray-700 last:border-0">
                  <span>{s.name}</span>
                  <span className="text-gray-400 text-xs">{s.category}{s.lastPrice ? ` · ${fmtBRL(s.lastPrice)}` : ''}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Categoria + unidade */}
        <div className="flex gap-2 mb-2">
          <select value={form.category} onChange={e => { set('category', e.target.value); setCategoryError(false) }}
            className={`flex-1 min-w-0 px-3 py-2.5 text-base ${field} ${categoryError ? '!border-red-500' : ''}`}>
            <option value="">Categoria…</option>
            {CATEGORIES.map(c => <option key={c}>{c}</option>)}
          </select>
          <select value={form.unit} onChange={e => set('unit', e.target.value)}
            className={`w-20 px-3 py-2.5 text-base ${field}`}>
            {UNITS.map(u => <option key={u}>{u}</option>)}
          </select>
        </div>
        {categoryError && <p className="text-red-400 text-xs -mt-1 mb-2 px-1">Escolha uma categoria</p>}

        {/* Quantidade + valores */}
        <div className="grid grid-cols-3 gap-2 mb-2">
          <div>
            <label className="text-gray-500 text-[11px] mb-0.5 block px-1">Qtd</label>
            <div className="flex items-center bg-gray-800 rounded-xl h-10">
              <button type="button" onClick={() => set('qty', String(Math.max(step, Math.round(((parsePrice(form.qty) || 0) - step) * 10) / 10)).replace('.', ','))}
                className="w-8 h-full text-white text-lg flex-shrink-0">−</button>
              <input value={form.qty} onChange={e => set('qty', e.target.value)} inputMode="decimal"
                className="w-full min-w-0 bg-transparent text-white text-center outline-none font-semibold text-base" />
              <button type="button" onClick={() => set('qty', String(Math.round(((parsePrice(form.qty) || 0) + step) * 10) / 10).replace('.', ','))}
                className="w-8 h-full text-white text-lg flex-shrink-0">+</button>
            </div>
          </div>
          <div>
            <label className="text-gray-500 text-[11px] mb-0.5 block px-1">Valor/{form.unit}</label>
            <MoneyInput value={form.pricePerUnit} onChange={v => set('pricePerUnit', v)} decimals={decimals}
              className={`w-full h-10 px-2.5 text-base ${field}`} />
          </div>
          <div>
            <label className="text-gray-500 text-[11px] mb-0.5 block px-1">Total</label>
            <MoneyInput value={form.totalPrice} onChange={v => set('totalPrice', v)} decimals={2}
              className={`w-full h-10 px-2.5 text-base ${field}`} />
          </div>
        </div>

        {/* Observação */}
        <input
          value={form.obs}
          onChange={e => set('obs', e.target.value)}
          placeholder="Observação (opcional)"
          className={`w-full px-3 py-2 mb-3 text-base text-gray-300 ${field}`}
        />

        {isNew && (
          <button type="button" onClick={() => setInCart(v => !v)}
            className="w-full flex items-center justify-between mb-3 px-1" aria-pressed={inCart}>
            <span className={`text-sm ${inCart ? 'text-green-400' : 'text-gray-400'}`}>Já está no carrinho</span>
            <span className={`w-11 h-6 rounded-full p-0.5 transition-colors ${inCart ? 'bg-green-500' : 'bg-gray-700'}`}>
              <span className={`block w-5 h-5 rounded-full bg-white transition-transform ${inCart ? 'translate-x-5' : ''}`} />
            </span>
          </button>
        )}

        <div className="flex gap-2">
          <button onClick={onCancel}
            className="flex-1 bg-gray-800 text-white font-semibold py-3 rounded-xl active:scale-95 transition-transform">
            Cancelar
          </button>
          <button onClick={handleSave}
            className="flex-[2] bg-green-500 text-white font-semibold py-3 rounded-xl active:scale-95 transition-transform">
            Salvar
          </button>
        </div>
        {onDelete && (
          <button onClick={() => confirm(`Remover "${form.name}" da lista?`) && onDelete()}
            className="w-full text-red-400/80 text-sm py-3 mt-1">
            Remover da lista
          </button>
        )}
      </div>
    </div>
  )
}
