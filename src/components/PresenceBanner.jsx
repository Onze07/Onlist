// "Ana está no Irmãos Gonçalves comprando" para os outros membros da família
export default function PresenceBanner({ people }) {
  if (!people?.length) return null
  return (
    <div className="px-4 pt-2">
      {people.map(p => {
        const since = p.startedAt?.toDate?.()
        return (
          <div key={p.id} className="bg-green-500/10 border border-green-500/30 rounded-xl px-3 py-2 mb-1 text-sm text-green-300 flex items-center gap-2">
            <span className="text-base">🛒</span>
            <span className="flex-1 min-w-0">
              <b className="text-green-200">{p.name?.split(' ')[0] || 'Alguém'}</b> está no mercado comprando{p.listName ? ` (${p.listName})` : ''}
            </span>
            {since && <span className="text-green-400/60 text-xs flex-shrink-0">desde {since.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>}
          </div>
        )
      })}
    </div>
  )
}
