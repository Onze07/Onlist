import { useState } from 'react'
import { latestByMarket, marketKey } from '../lib/prices'
import { useWakeLock } from '../lib/useWakeLock'
import { IconCheck, IconEdit, IconPlus } from './Icon'
import Sheet from './Sheet'

const CATEGORY_ORDER = ['Hortifruti', 'Carne', 'Laticínios', 'Mercearia', 'Padaria', 'Limpeza', 'Higiene', 'Bebidas', 'Outros']

function fmt(n) {
  return (n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function groupBy(items) {
  const groups = {}
  for (const item of items) {
    const cat = item.category || 'Outros'
    ;(groups[cat] ||= []).push(item)
  }
  return CATEGORY_ORDER.filter(c => groups[c]).map(c => ({ cat: c, items: groups[c] }))
}

// Escolha do mercado ao iniciar
export function StartShopping({ options, initial = '', onStart, onClose }) {
  const [mercado, setMercado] = useState(initial)
  const filtered = options.filter(m => m.toLowerCase().includes(mercado.toLowerCase()) && m !== mercado).slice(0, 6)
  return (
    <Sheet onClose={onClose}>
      <h2 className="text-white text-lg font-semibold mb-1">Ir ao mercado</h2>
      <p className="text-gray-400 text-sm mb-4">Tela sempre ligada, botões grandes e funciona sem internet. A família vê que você está comprando.</p>
      <input autoFocus value={mercado} onChange={e => setMercado(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && onStart(mercado.trim())}
        placeholder="Qual mercado?"
        className="w-full bg-gray-800 text-white text-base px-4 py-3 rounded-xl outline-none border border-transparent focus:border-green-500 mb-2" />
      {filtered.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {filtered.map(m => (
            <button key={m} onClick={() => setMercado(m)} className="text-sm text-gray-300 bg-gray-800 border border-gray-700 px-3 py-1.5 rounded-full">{m}</button>
          ))}
        </div>
      )}
      <div className="flex gap-2 mt-2">
        <button onClick={onClose} className="flex-1 bg-gray-800 text-white font-semibold py-3 rounded-xl">Cancelar</button>
        <button onClick={() => onStart(mercado.trim())} className="flex-[2] bg-green-500 text-white font-semibold py-3 rounded-xl">Começar</button>
      </div>
    </Sheet>
  )
}

// Modo mercado: tela cheia, linhas grandes, tocar marca como pego
export default function ShoppingMode({
  listName, mercado, pending, checked, catalog, online, pendingSync, othersOnList = [],
  onToggle, onEdit, onAdd, onFinish, onExit, onChangeMarket,
}) {
  const [showChecked, setShowChecked] = useState(false)
  useWakeLock(true)

  const key = marketKey(mercado)
  const totalChecked = checked.reduce((s, e) => s + (e.totalPrice || 0), 0)
  const totalPending = pending.reduce((s, e) => s + (e.totalPrice || 0), 0)

  function priceHere(entry) {
    return latestByMarket(catalog[String(entry.name).toLowerCase()]?.priceHistory).find(m => m.key === key)
  }

  return (
    <div className="fixed inset-0 z-[45] bg-gray-950 flex flex-col">
      {/* Cabeçalho */}
      <div className="bg-gray-900 border-b border-gray-800 px-4 pb-3" style={{ paddingTop: 'max(14px, env(safe-area-inset-top))' }}>
        <div className="flex items-center justify-between mb-2">
          <button onClick={onExit} className="text-gray-400 text-sm">← Sair</button>
          <p className="text-white text-sm font-semibold truncate mx-3">🛒 {mercado || 'Mercado'}</p>
          <button onClick={onChangeMarket} className="text-gray-400 text-sm flex-shrink-0">Trocar</button>
        </div>
        <div className="flex items-end justify-between">
          <div>
            <p className="text-gray-500 text-xs">No carrinho</p>
            <p className="text-green-400 text-2xl font-bold">{fmt(totalChecked)}</p>
          </div>
          <div className="text-right">
            <p className="text-gray-500 text-xs">{listName}</p>
            <p className="text-gray-300 text-sm">Faltam {pending.length}{totalPending > 0 ? ` · ~${fmt(totalPending)}` : ''}</p>
          </div>
        </div>
        {othersOnList.length > 0 && (
          <div className="mt-2 text-xs px-3 py-1.5 rounded-lg bg-green-500/10 text-green-300">
            {othersOnList.map(p => p.name?.split(' ')[0]).join(', ')} também está comprando esta lista agora
          </div>
        )}
        {(!online || pendingSync) && (
          <div className={`mt-2 text-xs px-3 py-1.5 rounded-lg ${online ? 'bg-blue-500/10 text-blue-300' : 'bg-amber-500/10 text-amber-300'}`}>
            {online ? 'Sincronizando…' : 'Sem internet · tudo fica salvo e sincroniza quando a conexão voltar'}
          </div>
        )}
      </div>

      {/* Itens */}
      <div className="flex-1 overflow-y-auto pb-40">
        {pending.length === 0 && (
          <div className="text-center mt-16 px-6">
            <div className="text-5xl mb-3">🎉</div>
            <p className="text-white font-semibold">Tudo no carrinho!</p>
            <p className="text-gray-500 text-sm mt-1">Toque em Finalizar para registrar a compra.</p>
          </div>
        )}
        {groupBy(pending).map(({ cat, items }) => (
          <div key={cat}>
            <p className="text-gray-500 text-xs uppercase tracking-wider px-4 pt-4 pb-2">{cat}</p>
            {items.map(entry => {
              const here = priceHere(entry)
              return (
                <div key={entry.id} className="flex items-stretch border-b border-gray-800/70">
                <button onClick={() => onToggle(entry)}
                  className="flex-1 min-w-0 flex items-center gap-4 pl-4 pr-2 py-4 active:bg-gray-800 text-left">
                  <span className="w-8 h-8 rounded-full border-2 border-gray-500 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-lg leading-tight">{entry.name}</p>
                    <p className="text-gray-500 text-sm">
                      {String(entry.qty).replace('.', ',')} {entry.unit}
                      {entry.obs ? ` · ${entry.obs}` : ''}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    {Number(entry.totalPrice) > 0 && <p className="text-gray-300 text-sm">{fmt(entry.totalPrice)}</p>}
                    {here && <p className="text-emerald-400/80 text-xs">aqui: {fmt(here.price)}/{entry.unit}</p>}
                  </div>
                </button>
                <button onClick={() => onEdit(entry)} aria-label="Editar" className="px-4 text-gray-500 active:bg-gray-800">
                  <IconEdit size={18} />
                </button>
                </div>
              )
            })}
          </div>
        ))}

        {checked.length > 0 && (
          <div className="mt-2">
            <button onClick={() => setShowChecked(v => !v)} className="w-full flex justify-between px-4 py-3 text-gray-500 text-sm">
              <span>Peguei ({checked.length}) · {fmt(totalChecked)}</span>
              <span>{showChecked ? '▼' : '▶'}</span>
            </button>
            {showChecked && checked.map(entry => (
              <div key={entry.id} className="flex items-stretch border-b border-gray-800/50">
                <button onClick={() => onToggle(entry)}
                  className="flex-1 min-w-0 flex items-center gap-4 pl-4 pr-2 py-3 text-left opacity-60">
                  <span className="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0"><IconCheck size={16} /></span>
                  <span className="flex-1 text-gray-400 line-through truncate">{entry.name}</span>
                  <span className="text-gray-500 text-sm">{Number(entry.totalPrice) > 0 ? fmt(entry.totalPrice) : ''}</span>
                </button>
                <button onClick={() => onEdit(entry)} aria-label="Editar preço" className="px-4 text-gray-500">
                  <IconEdit size={18} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Ações */}
      <div className="fixed bottom-0 inset-x-0 bg-gray-950/95 border-t border-gray-800 px-4 pt-3 flex gap-2"
        style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>
        <button onClick={onAdd} className="flex-1 bg-gray-800 text-white font-semibold py-4 rounded-2xl flex items-center justify-center gap-2">
          <IconPlus /> Item
        </button>
        <button onClick={onFinish} disabled={checked.length === 0}
          className="flex-[2] bg-green-500 disabled:opacity-40 text-white font-bold py-4 rounded-2xl">
          Finalizar · {fmt(totalChecked)}
        </button>
      </div>
    </div>
  )
}
