import { IconBarChart, IconUser } from './Icon'

export default function BottomNav({ tab, setTab }) {
  const tabs = [
    {
      id: 'list', label: 'Lista',
      icon: (active) => (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2 : 1.5} strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
        </svg>
      ),
    },
    {
      id: 'catalog', label: 'Catálogo',
      icon: (active) => (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2 : 1.5} strokeLinecap="round" strokeLinejoin="round">
          <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" />
          <line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
        </svg>
      ),
    },
    {
      id: 'history', label: 'Registros',
      icon: (active) => (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2 : 1.5} strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" />
        </svg>
      ),
    },
    {
      id: 'reports', label: 'Relatórios',
      icon: () => <IconBarChart size={22} />,
    },
    {
      id: 'account', label: 'Conta',
      icon: (active) => <IconUser size={22} strokeWidth={active ? 2 : 1.5} />,
    },
  ]

  return (
    <div className="fixed bottom-0 left-0 right-0 max-w-lg mx-auto bg-gray-900 border-t border-gray-800 flex">
      {tabs.map(t => (
        <button key={t.id} onClick={() => setTab(t.id)}
          className={`flex-1 flex flex-col items-center py-2.5 gap-1 transition-colors
            ${tab === t.id ? 'text-green-400' : 'text-gray-600'}`}>
          {t.icon(tab === t.id)}
          <span className="text-[10px]">{t.label}</span>
        </button>
      ))}
    </div>
  )
}
