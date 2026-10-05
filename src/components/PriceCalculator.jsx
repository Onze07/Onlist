import { useState } from 'react'
import Sheet from './Sheet'
import MoneyInput from './MoneyInput'
import { CALC_UNITS, compareUnitPrices } from '../lib/unitPrice'
import { parsePrice } from '../lib/firestore'

const LETTERS = ['A', 'B', 'C', 'D']
const fmt = n => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

// "Qual compensa?": preço da embalagem ÷ quantidade, sem salvar nada
export default function PriceCalculator({ onClose }) {
  const [rows, setRows] = useState([
    { price: 0, qty: '1', unit: 'un' },
    { price: 0, qty: '1', unit: 'un' },
  ])
  const result = compareUnitPrices(rows.map(r => ({ ...r, qty: parsePrice(r.qty) })))
  const field = 'bg-gray-800 text-white rounded-xl outline-none border border-transparent focus:border-green-500 h-11 text-base'

  function set(i, key, value) {
    setRows(prev => prev.map((r, idx) => {
      if (idx === i) return { ...r, [key]: value }
      // Trocar a unidade da opção A já ajusta as outras que ainda estão sem preço
      if (key === 'unit' && i === 0 && !r.price) return { ...r, unit: value }
      return r
    }))
  }

  return (
    <Sheet onClose={onClose}>
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-white text-lg font-semibold">Qual compensa?</h2>
        <button onClick={onClose} className="text-gray-400 text-sm">Fechar</button>
      </div>
      <p className="text-gray-500 text-xs mb-4">Preço da embalagem e o tamanho dela. O app mostra o preço por kg, litro ou unidade.</p>

      <div className="flex flex-col gap-3">
        {rows.map((r, i) => {
          const res = result.rows[i]
          return (
            <div key={i} className={`rounded-2xl border p-3 transition-colors ${res.best ? 'border-green-500 bg-green-500/10' : 'border-gray-800 bg-gray-800/40'}`}>
              <div className="flex items-center gap-2">
                <span className="w-6 text-gray-400 font-bold text-center flex-shrink-0">{LETTERS[i]}</span>
                <MoneyInput value={r.price} onChange={v => set(i, 'price', v)} aria-label={`Preço ${LETTERS[i]}`}
                  className={`flex-1 min-w-0 px-3 ${field}`} />
                <input value={r.qty} onChange={e => set(i, 'qty', e.target.value)} inputMode="decimal" aria-label={`Quantidade ${LETTERS[i]}`}
                  className={`w-16 text-center px-1 ${field}`} />
                <select value={r.unit} onChange={e => set(i, 'unit', e.target.value)} aria-label={`Unidade ${LETTERS[i]}`}
                  className={`w-16 px-1 ${field}`}>
                  {CALC_UNITS.map(u => <option key={u.id} value={u.id}>{u.label}</option>)}
                </select>
              </div>
              {res.per !== null && (
                <div className="flex items-center justify-between mt-2 pl-8 text-sm">
                  <span className="text-gray-300">{fmt(res.per)}/{res.baseLabel}</span>
                  {res.best
                    ? <span className="text-green-300 font-semibold">✓ Compensa mais</span>
                    : res.extraPct > 0.0005 && <span className="text-red-300">{(res.extraPct * 100).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}% mais caro</span>}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {result.mixed && (
        <p className="text-amber-300 text-xs mt-3">Compare a mesma medida: peso com peso, litro com litro ou unidade com unidade.</p>
      )}

      <div className="flex gap-2 mt-4">
        {rows.length < LETTERS.length && (
          <button onClick={() => setRows(prev => [...prev, { price: 0, qty: '1', unit: prev[0].unit }])}
            className="flex-1 bg-gray-800 border border-gray-700 text-gray-200 text-sm py-3 rounded-xl">
            + Outra opção
          </button>
        )}
        <button onClick={() => setRows(prev => prev.map(r => ({ ...r, price: 0, qty: '1' })))}
          className="flex-1 bg-gray-800 border border-gray-700 text-gray-400 text-sm py-3 rounded-xl">
          Limpar
        </button>
      </div>
    </Sheet>
  )
}
