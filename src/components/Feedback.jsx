import { useEffect, useRef, useSyncExternalStore } from 'react'
import { subscribe, getState, dismiss } from '../lib/feedback'

const TONES = {
  ok: 'border-green-500/40',
  error: 'border-red-500/50',
  info: 'border-gray-700',
}

// Avisos (embaixo, acima da barra de abas) e diálogo de confirmação
export default function Feedback() {
  const { toasts, dialog } = useSyncExternalStore(subscribe, getState)
  return (
    <>
      <div className="fixed inset-x-0 z-[70] px-4 flex flex-col gap-2 max-w-lg mx-auto pointer-events-none"
        style={{ bottom: 'calc(84px + env(safe-area-inset-bottom))' }} aria-live="polite">
        {toasts.map(t => (
          <div key={t.id} role={t.tone === 'error' ? 'alert' : 'status'}
            className={`toast-in pointer-events-auto flex items-center gap-3 bg-gray-800 border ${TONES[t.tone]} text-gray-100 text-sm rounded-xl pl-4 pr-2 py-2 shadow-xl`}>
            <span className="flex-1 py-1.5">{t.message}</span>
            {t.action && (
              <button onClick={() => { t.action.run(); dismiss(t.id) }}
                className="min-h-11 px-3 font-semibold text-green-400 rounded-lg active:bg-gray-700">
                {t.action.label}
              </button>
            )}
            <button onClick={() => dismiss(t.id)} aria-label="Fechar aviso"
              className="min-h-11 min-w-11 text-gray-500 rounded-lg active:bg-gray-700">✕</button>
          </div>
        ))}
      </div>
      {dialog && <ConfirmDialog {...dialog} />}
    </>
  )
}

function ConfirmDialog({ title, message, confirm, cancel, danger, close }) {
  const cancelRef = useRef(null)
  useEffect(() => {
    // Foco no "Cancelar": Enter por engano não apaga nada
    cancelRef.current?.focus()
    const onKey = e => e.key === 'Escape' && close(null)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [close])
  return (
    <div className="fixed inset-0 bg-black/70 z-[80] flex items-end sm:items-center" onClick={() => close(null)}>
      <div role="alertdialog" aria-modal="true" aria-labelledby="confirm-title"
        className="bg-gray-900 rounded-t-3xl sm:rounded-2xl w-full max-w-lg mx-auto px-5 pt-5 border-t border-gray-800"
        style={{ paddingBottom: 'max(20px, env(safe-area-inset-bottom))' }}
        onClick={e => e.stopPropagation()}>
        <h2 id="confirm-title" className="text-white text-base font-semibold mb-1">{title}</h2>
        {message && <p className="text-gray-400 text-sm mb-5">{message}</p>}
        <div className={`flex gap-3 ${message ? '' : 'mt-5'}`}>
          <button ref={cancelRef} onClick={() => close(false)}
            className="flex-1 min-h-12 bg-gray-800 text-gray-200 font-medium rounded-xl text-sm">{cancel}</button>
          <button onClick={() => close(true)}
            className={`flex-1 min-h-12 font-semibold rounded-xl text-sm text-white ${danger ? 'bg-red-600 active:bg-red-700' : 'bg-green-600 active:bg-green-700'}`}>
            {confirm}
          </button>
        </div>
      </div>
    </div>
  )
}
