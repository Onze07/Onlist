// Botão de ação secundária: pílula com borda, fundo e ícone — deixa claro que é tocável.
// tone: 'default' | 'danger' | 'accent'
// Sem children vira botão redondo só com ícone (label vai em aria-label/title).
export default function ActionChip({ icon, children, label, onClick, tone = 'default', disabled, className = '' }) {
  const tones = {
    default: 'bg-gray-800 border-gray-700 text-gray-200 active:bg-gray-700',
    danger: 'bg-gray-800 border-red-500/30 text-red-300 active:bg-red-500/10',
    accent: 'bg-green-500/10 border-green-500/40 text-green-300 active:bg-green-500/20',
  }
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-label={label} title={label}
      className={`inline-flex items-center justify-center gap-1.5 flex-shrink-0 whitespace-nowrap text-xs font-medium rounded-full border transition-colors disabled:opacity-40 ${children ? 'px-3 py-1.5' : 'w-9 h-9'} ${tones[tone]} ${className}`}>
      {icon}
      {children}
    </button>
  )
}
