import { PRIVACY, TERMS, LEGAL_UPDATED, CONTROLLER } from '../lib/legal'

// Abre em #/privacidade ou #/termos (funciona sem login)
export default function Legal({ doc: which }) {
  const content = which === 'termos' ? TERMS : PRIVACY
  const other = which === 'termos' ? { href: '#/privacidade', label: PRIVACY.title } : { href: '#/termos', label: TERMS.title }

  function back() {
    if (window.history.length > 1) window.history.back()
    else window.location.hash = ''
  }

  return (
    <div className="min-h-svh bg-gray-900">
      <div className="sticky top-0 bg-gray-900/95 backdrop-blur border-b border-gray-800 px-4 pb-3 flex items-center gap-3"
        style={{ paddingTop: 'max(16px, env(safe-area-inset-top))' }}>
        <button onClick={back} className="text-gray-400 text-2xl leading-none" aria-label="Voltar">←</button>
        <h1 className="text-white text-lg font-semibold">{content.title}</h1>
      </div>
      <div className="max-w-2xl mx-auto px-5 py-5 pb-16">
        <p className="text-gray-500 text-xs mb-6">Última atualização: {LEGAL_UPDATED}</p>
        {content.sections.map(s => (
          <section key={s.h} className="mb-6">
            <h2 className="text-white font-semibold mb-2">{s.h}</h2>
            {s.p.map((t, i) => <p key={i} className="text-gray-300 text-sm leading-relaxed mb-2">{t}</p>)}
          </section>
        ))}
        <div className="border-t border-gray-800 pt-4 text-gray-500 text-xs leading-relaxed">
          <p>{CONTROLLER.name} · CNPJ {CONTROLLER.cnpj}</p>
          <p>{CONTROLLER.email}</p>
          <a href={other.href} className="text-green-400 inline-block mt-3">{other.label} →</a>
        </div>
      </div>
    </div>
  )
}
