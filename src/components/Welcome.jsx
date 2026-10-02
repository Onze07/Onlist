import { useState } from 'react'
import { serverTimestamp } from 'firebase/firestore'
import { useFamily } from '../context/FamilyContext'

const SLIDES = [
  {
    icon: '📝',
    title: 'Monte a lista',
    text: 'Toque em "Adicionar item". Escolha a categoria, a quantidade e, se souber, o preço. Itens já comprados aparecem como sugestão.',
  },
  {
    icon: '🛒',
    title: 'No mercado',
    text: 'Marque o que já pegou. No fim, toque em "Finalizar", informe o mercado e pronto: a compra vai para os Registros com os preços pagos.',
  },
  {
    icon: '👨‍👩‍👧',
    title: 'Em família',
    text: 'Na aba Conta, compartilhe o código de convite. Todos veem a mesma lista em tempo real. Acompanhe os gastos em Relatórios.',
  },
]

// Tutorial rápido no primeiro acesso
export default function Welcome() {
  const { updateUserDoc } = useFamily()
  const [i, setI] = useState(0)
  const last = i === SLIDES.length - 1
  const slide = SLIDES[i]

  function finish() {
    updateUserDoc({ onboardedAt: serverTimestamp() }).catch(() => {})
  }

  return (
    <div className="fixed inset-0 z-50 bg-gray-900 flex flex-col px-6"
      style={{ paddingTop: 'max(24px, env(safe-area-inset-top))', paddingBottom: 'max(24px, env(safe-area-inset-bottom))' }}>
      <div className="flex justify-end">
        {!last && <button onClick={finish} className="text-gray-500 text-sm py-2">Pular</button>}
      </div>
      <div className="flex-1 flex flex-col items-center justify-center text-center max-w-sm mx-auto">
        <div className="text-6xl mb-6">{slide.icon}</div>
        <h2 className="text-white text-2xl font-bold mb-3">{slide.title}</h2>
        <p className="text-gray-400 leading-relaxed">{slide.text}</p>
      </div>
      <div className="flex justify-center gap-2 mb-6">
        {SLIDES.map((_, idx) => (
          <span key={idx} className={`h-1.5 rounded-full transition-all ${idx === i ? 'w-6 bg-green-500' : 'w-1.5 bg-gray-700'}`} />
        ))}
      </div>
      <button onClick={() => (last ? finish() : setI(i + 1))}
        className="w-full max-w-sm mx-auto bg-green-500 text-white font-semibold py-3.5 rounded-xl">
        {last ? 'Começar' : 'Próximo'}
      </button>
    </div>
  )
}
