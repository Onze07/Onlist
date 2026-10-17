import { useTips } from '../lib/tips'

// Faixa de dica no lugar onde a função existe. Some ao tocar em "Entendi" e não volta.
export default function TipBanner({ id, children }) {
  const tips = useTips()
  if (tips.seen(id)) return null
  return (
    <div className="mx-4 mt-3 flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 pl-3 pr-1 py-1.5" role="note">
      <p className="flex-1 text-amber-200 text-xs leading-relaxed py-1.5">{children}</p>
      <button onClick={() => tips.mark(id)} className="text-amber-100 text-xs font-semibold px-3 min-h-9 rounded-lg active:bg-amber-500/20 flex-shrink-0">
        Entendi
      </button>
    </div>
  )
}
