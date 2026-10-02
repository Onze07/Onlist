import { useEffect, useState } from 'react'
import { collection, getDocs, orderBy, query } from 'firebase/firestore'
import { db } from '../firebase'
import { useFamily } from '../context/FamilyContext'
import { parsePrice } from '../lib/firestore'

const CATEGORIES = ['Hortifruti', 'Carne', 'Laticínios', 'Mercearia', 'Padaria', 'Limpeza', 'Higiene', 'Bebidas', 'Outros']
const UNITS = ['un', 'kg', 'g', 'dz', 'ml', 'l']

const empty = { name: '', obs: '', category: 'Mercearia', qty: '1', unit: 'un', pricePerUnit: '', totalPrice: '' }

export default function ItemForm({ onSave, onCancel, initial }) {
  const { familyId } = useFamily()
  const [form, setForm] = useState(initial ? { ...initial, qty: String(initial.qty), pricePerUnit: String(initial.pricePerUnit || ''), totalPrice: String(initial.totalPrice || '') } : empty)
  const [catalog, setCatalog] = useState([])
  const [suggestions, setSuggestions] = useState([])

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
        const q = parsePrice(next.qty) || 0
        const p = parsePrice(next.pricePerUnit) || 0
        next.totalPrice = (q * p).toFixed(2)
      }
      if (field === 'totalPrice') {
        const q = parsePrice(next.qty) || 0
        if (q > 0) next.pricePerUnit = (parsePrice(value) / q).toFixed(2)
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
      pricePerUnit: String(item.lastPrice || ''),
      totalPrice: String(((parsePrice(prev.qty) || 0) * (item.lastPrice || 0)).toFixed(2)),
    }))
    setSuggestions([])
  }

  const [categoryError, setCategoryError] = useState(false)

  function handleSave() {
    if (!form.name.trim()) return
    if (!form.category) { setCategoryError(true); return }
    setCategoryError(false)
    onSave({
      name: form.name.trim(),
      obs: form.obs.trim(),
      category: form.category,
      qty: parsePrice(form.qty) || 1,
      unit: form.unit,
      pricePerUnit: parsePrice(form.pricePerUnit) || 0,
      totalPrice: parsePrice(form.totalPrice) || 0,
    })
  }

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-end" onClick={onCancel}>
      <div className="bg-gray-900 rounded-t-3xl w-full max-w-lg mx-auto p-6 pb-10" onClick={e => e.stopPropagation()}>
        <div className="w-10 h-1 bg-gray-700 rounded-full mx-auto mb-6" />

        {/* Name */}
        <div className="relative mb-3">
          <input
            autoFocus
            value={form.name}
            onChange={e => handleNameChange(e.target.value)}
            placeholder="Nome do item"
            className="w-full bg-gray-800 text-white text-xl font-semibold px-4 py-3 rounded-xl outline-none border-2 border-transparent focus:border-green-500"
          />
          {suggestions.length > 0 && (
            <div className="absolute top-full left-0 right-0 bg-gray-800 rounded-xl mt-1 overflow-hidden z-10 shadow-xl">
              {suggestions.map(s => (
                <button key={s.id} onClick={() => applySuggestion(s)}
                  className="w-full text-left px-4 py-3 text-white hover:bg-gray-700 flex justify-between items-center border-b border-gray-700 last:border-0">
                  <span>{s.name}</span>
                  <span className="text-gray-400 text-sm">{s.category} · {s.lastPrice ? `R$ ${s.lastPrice.toFixed(2)}` : ''}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* OBS */}
        <input
          value={form.obs}
          onChange={e => set('obs', e.target.value)}
          placeholder="Observação (opcional)"
          className="w-full bg-gray-800 text-gray-300 px-4 py-2 rounded-xl outline-none mb-3 text-sm"
        />

        {/* Category */}
        <select value={form.category} onChange={e => { set('category', e.target.value); setCategoryError(false) }}
          className={`w-full bg-gray-800 text-white px-4 py-3 rounded-xl outline-none mb-1 border-2 ${categoryError ? 'border-red-500' : 'border-transparent'}`}>
          <option value="">Selecione uma categoria…</option>
          {CATEGORIES.map(c => <option key={c}>{c}</option>)}
        </select>
        {categoryError && <p className="text-red-400 text-xs mb-2 px-1">Escolha uma categoria para continuar</p>}

        {/* Qty + Unit */}
        <div className="flex gap-2 mb-3">
          <div className="flex items-center bg-gray-800 rounded-xl flex-1">
            <button onClick={() => set('qty', String(Math.max(0.1, (parsePrice(form.qty) || 0) - (form.unit === 'kg' || form.unit === 'l' ? 0.1 : 1))))}
              className="px-4 py-3 text-white text-xl">−</button>
            <input value={form.qty} onChange={e => set('qty', e.target.value)} inputMode="decimal"
              className="flex-1 bg-transparent text-white text-center outline-none font-semibold" />
            <button onClick={() => set('qty', String(Math.round(((parsePrice(form.qty) || 0) + (form.unit === 'kg' || form.unit === 'l' ? 0.1 : 1)) * 10) / 10))}
              className="px-4 py-3 text-white text-xl">+</button>
          </div>
          <select value={form.unit} onChange={e => set('unit', e.target.value)}
            className="bg-gray-800 text-white px-4 py-3 rounded-xl outline-none">
            {UNITS.map(u => <option key={u}>{u}</option>)}
          </select>
        </div>

        {/* Price */}
        <div className="flex gap-2 mb-6">
          <div className="flex-1">
            <label className="text-gray-500 text-xs mb-1 block">Valor/{form.unit}</label>
            <div className="flex items-center bg-gray-800 rounded-xl px-3">
              <span className="text-gray-500 text-sm">R$</span>
              <input value={form.pricePerUnit} onChange={e => set('pricePerUnit', e.target.value)} inputMode="decimal"
                className="flex-1 bg-transparent text-white py-3 px-2 outline-none" />
            </div>
          </div>
          <div className="flex-1">
            <label className="text-gray-500 text-xs mb-1 block">Total</label>
            <div className="flex items-center bg-gray-800 rounded-xl px-3">
              <span className="text-gray-500 text-sm">R$</span>
              <input value={form.totalPrice} onChange={e => set('totalPrice', e.target.value)} inputMode="decimal"
                className="flex-1 bg-transparent text-white py-3 px-2 outline-none" />
            </div>
          </div>
        </div>

        <div className="flex gap-3">
          <button onClick={onCancel}
            className="flex-1 bg-gray-800 text-white font-semibold py-4 rounded-xl active:scale-95 transition-transform">
            Cancelar
          </button>
          <button onClick={handleSave}
            className="flex-1 bg-green-500 text-white font-semibold py-4 rounded-xl active:scale-95 transition-transform">
            Salvar
          </button>
        </div>
      </div>
    </div>
  )
}
