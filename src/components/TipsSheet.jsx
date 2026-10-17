import Sheet from './Sheet'
import { useTips } from '../lib/tips'
import { toast } from '../lib/feedback'

const TIPS = [
  ['Lista', [
    ['Deslizar o item para a direita', 'marca como pego (ou devolve, se já estava no carrinho)'],
    ['Deslizar para a esquerda', 'remove o item (dá para desfazer)'],
    ['Segurar e arrastar', 'muda a ordem; soltar em outra categoria corrige a categoria'],
    ['Segurar um botão redondo', 'mostra o nome dele (calculadora, ordem, comparar, avisar)'],
    ['Botão de ordem', 'alterna entre categorias (as com mais itens primeiro) e A–Z'],
  ]],
  ['Catálogo', [
    ['"+ lista" ou deslizar →', 'põe o produto na lista sem sair do catálogo'],
    ['Deslizar ←', 'exclui o produto do catálogo'],
    ['Segurar e arrastar', 'troca a categoria do produto'],
    ['Lixeira no histórico de preços', 'remove só um preço lançado errado'],
  ]],
  ['Compras', [
    ['Tocar na compra', 'mostra os itens, "Repetir compra" e conciliar com a nota'],
    ['Tocar no mês ou no ano', 'abre e fecha, para a lista ficar curta'],
    ['Deslizar ←', 'exclui a compra e os preços dela no catálogo'],
  ]],
]

// Conta → Dicas e atalhos: todos os gestos num lugar só, para quem quiser rever
export default function TipsSheet({ onClose }) {
  const tips = useTips()
  return (
    <Sheet onClose={onClose}>
      <h2 className="text-white text-lg font-semibold mb-4">Dicas e atalhos</h2>
      {TIPS.map(([title, rows]) => (
        <div key={title} className="mb-4">
          <p className="text-gray-500 text-xs uppercase tracking-wider mb-2">{title}</p>
          <div className="rounded-xl border border-gray-800 bg-gray-800/40 divide-y divide-gray-800">
            {rows.map(([what, does]) => (
              <div key={what} className="px-3 py-2.5">
                <p className="text-white text-sm">{what}</p>
                <p className="text-gray-400 text-xs mt-0.5">{does}</p>
              </div>
            ))}
          </div>
        </div>
      ))}
      <div className="flex gap-2">
        <button onClick={() => { tips.reset().catch(() => {}); toast('As dicas vão aparecer de novo.', { tone: 'ok' }); onClose() }}
          className="flex-1 min-h-12 bg-gray-800 border border-gray-700 text-gray-200 text-sm font-medium rounded-xl">
          Mostrar as dicas de novo
        </button>
        <button onClick={onClose} className="flex-1 min-h-12 bg-green-500 text-white text-sm font-semibold rounded-xl">Fechar</button>
      </div>
    </Sheet>
  )
}
