import Sheet from './Sheet'

function ShareIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="inline -mt-1">
      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" /><polyline points="16 6 12 2 8 6" /><line x1="12" y1="2" x2="12" y2="15" />
    </svg>
  )
}

function AddIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="inline -mt-1">
      <rect x="3" y="3" width="18" height="18" rx="4" /><line x1="12" y1="8" x2="12" y2="16" /><line x1="8" y1="12" x2="16" y2="12" />
    </svg>
  )
}

// Passo a passo para iPhone/iPad (a Apple não permite instalar por botão)
export default function InstallGuide({ onClose }) {
  const steps = [
    <>Abra o Onlist no <b className="text-white">Safari</b>.</>,
    <>Toque em <span className="text-blue-400"><ShareIcon /> Compartilhar</span>, na barra de baixo (ou no topo, no iPad).</>,
    <>Role a lista e toque em <span className="text-white"><AddIcon /> Adicionar à Tela de Início</span>.</>,
    <>Toque em <b className="text-white">Adicionar</b>. Pronto: abra o Onlist pelo ícone na tela inicial.</>,
  ]
  return (
    <Sheet onClose={onClose}>
      <h2 className="text-white text-lg font-semibold mb-1">Instalar no iPhone</h2>
      <p className="text-gray-400 text-sm mb-5">O app abre em tela cheia, mais rápido, e pode receber avisos.</p>
      <ol className="flex flex-col gap-4 mb-6">
        {steps.map((s, i) => (
          <li key={i} className="flex gap-3 items-start">
            <span className="w-6 h-6 rounded-full bg-green-500/15 text-green-400 text-xs font-bold flex items-center justify-center flex-shrink-0">{i + 1}</span>
            <span className="text-gray-300 text-sm leading-relaxed">{s}</span>
          </li>
        ))}
      </ol>
      <button onClick={onClose} className="w-full bg-green-500 text-white font-semibold py-3 rounded-xl">Entendi</button>
    </Sheet>
  )
}
