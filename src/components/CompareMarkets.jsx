import { useState } from 'react'
import Sheet from './Sheet'
import { compareList, latestByMarket } from '../lib/prices'
import { fmtDate } from '../lib/firestore'

function fmt(n) {
  return (n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

// Quanto a lista atual custaria em cada mercado, pelo último preço pago lá
export default function CompareMarkets({ entries, catalog, onClose }) {
  const [open, setOpen] = useState(null)
  const rows = compareList(entries, catalog)
  const total = entries.length
  const bestCoverage = rows[0]?.coveredCount || 0
  const sameCoverage = rows.filter(r => r.coveredCount === bestCoverage)
  const savings = sameCoverage.length > 1 ? sameCoverage[sameCoverage.length - 1].total - sameCoverage[0].total : 0

  return (
    <Sheet onClose={onClose}>
      <h2 className="text-white text-lg font-semibold mb-1">Comparar mercados</h2>
      <p className="text-gray-400 text-xs mb-4">
        Estimativa para os {total} itens da lista, pelo último preço pago em cada mercado.
      </p>

      {rows.length === 0 ? (
        <p className="text-gray-500 text-sm py-6 text-center">
          Ainda não há preços por mercado para estes itens. Eles aparecem conforme você finaliza compras informando o mercado.
        </p>
      ) : (
        <>
          {savings > 0.009 && (
            <div className="bg-green-500/10 border border-green-500/30 rounded-xl px-3 py-2.5 mb-3">
              <p className="text-green-400 text-sm font-medium">Diferença de até {fmt(savings)}</p>
              <p className="text-green-400/70 text-xs">
                entre {sameCoverage[0].mercado} e {sameCoverage[sameCoverage.length - 1].mercado}, com {bestCoverage} itens com preço em cada
              </p>
            </div>
          )}
          <div className="flex flex-col gap-2 mb-4">
            {rows.map((r, i) => {
              const isBest = i === 0
              const expanded = open === r.key
              return (
                <div key={r.key} className={`rounded-xl border ${isBest ? 'border-green-500/40 bg-green-500/5' : 'border-gray-800 bg-gray-800/40'}`}>
                  <button onClick={() => setOpen(expanded ? null : r.key)} className="w-full flex items-center gap-3 px-3 py-2.5 text-left">
                    <span className={`w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center flex-shrink-0 ${isBest ? 'bg-green-500 text-white' : 'bg-gray-700 text-gray-300'}`}>{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm truncate">{r.mercado}</p>
                      <p className={`text-xs ${r.coveredCount === total ? 'text-gray-500' : 'text-amber-400/80'}`}>
                        {r.coveredCount} de {total} itens com preço
                      </p>
                    </div>
                    <span className={`text-sm font-semibold ${isBest ? 'text-green-400' : 'text-gray-200'}`}>{fmt(r.total)}</span>
                  </button>
                  {expanded && (
                    <div className="px-3 pb-3 text-xs">
                      {r.covered.map(name => {
                        const h = latestByMarket(catalog[name.toLowerCase()]?.priceHistory).find(m => m.key === r.key)
                        return (
                          <div key={name} className="flex justify-between py-0.5 text-gray-400">
                            <span className="truncate">{name}</span>
                            <span className="text-gray-300 flex-shrink-0 ml-2">{h ? `${fmt(h.price)} · ${fmtDate(h.date, { short: true })}` : ''}</span>
                          </div>
                        )
                      })}
                      {r.missing.length > 0 && (
                        <p className="text-amber-400/70 mt-1.5">Sem preço aqui: {r.missing.join(', ')}</p>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}
      <button onClick={onClose} className="w-full bg-gray-800 text-white font-semibold py-3 rounded-xl">Fechar</button>
    </Sheet>
  )
}
