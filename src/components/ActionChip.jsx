// Botão de ação secundária: pílula com borda, fundo e ícone — deixa claro que é tocável.
// tone: 'default' | 'danger' | 'accent'
export default function ActionChip({ icon, children, onClick, tone = 'default', disabled, className = '' }) {
  const tones = {
    default: 'bg-gray-800 border-gray-700 text-gray-200 active:bg-gray-700',
    danger: 'bg-gray-800 border-red-500/30 text-red-300 active:bg-red-500/10',
    accent: 'bg-green-500/10 border-green-500/40 text-green-300 active:bg-green-500/20',
  }
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      className={`inline-flex items-center gap-1.5 flex-shrink-0 whitespace-nowrap text-xs font-medium px-3 py-1.5 rounded-full border transition-colors disabled:opacity-40 ${tones[tone]} ${className}`}>
      {icon}
      {children}
    </button>
  )
}
