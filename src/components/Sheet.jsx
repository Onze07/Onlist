// Folha inferior padrão (modal) usada pelos diálogos do app
export default function Sheet({ onClose, children, className = '' }) {
  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-end" onClick={onClose}>
      <div className={`bg-gray-900 rounded-t-3xl w-full max-w-lg mx-auto px-5 pt-3 max-h-[90svh] overflow-y-auto border-t border-gray-800 ${className}`}
        style={{ paddingBottom: 'max(20px, env(safe-area-inset-bottom))' }}
        onClick={e => e.stopPropagation()}>
        <div className="w-10 h-1 bg-gray-700 rounded-full mx-auto mb-4" />
        {children}
      </div>
    </div>
  )
}
