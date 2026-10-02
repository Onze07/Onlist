import { useState } from 'react'
import { useInstall } from '../lib/install'
import InstallGuide from './InstallGuide'

const KEY = 'installBannerDismissedAt'
const SNOOZE_MS = 7 * 24 * 60 * 60 * 1000

function dismissedRecently() {
  try { return Date.now() - Number(localStorage.getItem(KEY) || 0) < SNOOZE_MS } catch { return false }
}

// Faixa no topo convidando a instalar: botão no Android, guia no iPhone. Some por 7 dias ao fechar.
export default function InstallBanner() {
  const { canPrompt, ios, promptInstall } = useInstall()
  const [hidden, setHidden] = useState(dismissedRecently)
  const [guide, setGuide] = useState(false)

  if (hidden || (!canPrompt && !ios)) return guide ? <InstallGuide onClose={() => setGuide(false)} /> : null

  function dismiss() {
    try { localStorage.setItem(KEY, String(Date.now())) } catch { /* ignora */ }
    setHidden(true)
  }

  return (
    <>
      <div className="fixed top-0 inset-x-0 z-40 max-w-lg mx-auto px-3" style={{ paddingTop: 'max(8px, env(safe-area-inset-top))' }}>
        <div className="bg-gray-800 border border-gray-700 rounded-2xl px-3 py-2.5 flex items-center gap-3 shadow-xl">
          <img src="/pwa-192x192.png" alt="" className="w-9 h-9 rounded-xl flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-white text-sm font-medium">Instale o Onlist</p>
            <p className="text-gray-400 text-xs">Abre em tela cheia e recebe avisos</p>
          </div>
          <button onClick={() => (canPrompt ? promptInstall().then(ok => ok && setHidden(true)) : setGuide(true))}
            className="bg-green-500 text-white text-xs font-semibold px-3 py-1.5 rounded-lg">
            {canPrompt ? 'Instalar' : 'Como?'}
          </button>
          <button onClick={dismiss} aria-label="Fechar" className="text-gray-500 text-lg leading-none px-1">×</button>
        </div>
      </div>
      {guide && <InstallGuide onClose={() => setGuide(false)} />}
    </>
  )
}
