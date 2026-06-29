import { useState } from 'react'
import { useFamily } from '../context/FamilyContext'

export default function FamilySetup() {
  const { createFamily, joinFamily } = useFamily()
  const [mode, setMode] = useState(null)
  const [code, setCode] = useState('')
  const [createdCode, setCreatedCode] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleCreate() {
    setLoading(true)
    try {
      const c = await createFamily()
      setCreatedCode(c)
    } catch (e) {
      setError(e.message)
    }
    setLoading(false)
  }

  async function handleJoin() {
    if (code.length < 6) return
    setLoading(true)
    setError('')
    try {
      await joinFamily(code)
    } catch (e) {
      setError(e.message)
    }
    setLoading(false)
  }

  if (createdCode) {
    return (
      <div className="flex flex-col items-center justify-center min-h-svh bg-gray-900 px-6">
        <div className="text-4xl mb-4">🎉</div>
        <h2 className="text-xl font-bold text-white mb-2">Família criada!</h2>
        <p className="text-gray-400 text-sm mb-6 text-center">
          Compartilhe esse código com sua esposa para ela entrar na lista:
        </p>
        <div className="bg-gray-800 rounded-2xl px-10 py-6 text-4xl font-bold tracking-[0.3em] text-green-400 mb-6">
          {createdCode}
        </div>
        <p className="text-gray-500 text-xs text-center">
          Ela vai acessar o app, clicar em "Entrar com código" e digitar esse código.
        </p>
      </div>
    )
  }

  if (!mode) {
    return (
      <div className="flex flex-col items-center justify-center min-h-svh bg-gray-900 px-6">
        <div className="text-5xl mb-4">👨‍👩‍👧</div>
        <h2 className="text-xl font-bold text-white mb-2">Configure sua família</h2>
        <p className="text-gray-400 text-sm mb-10 text-center">
          Crie uma lista nova ou entre em uma já existente
        </p>
        {error && <p className="text-red-400 text-sm mb-4 text-center">{error}</p>}
        <button
          onClick={handleCreate}
          disabled={loading}
          className="w-full max-w-xs bg-green-500 disabled:opacity-50 text-white font-semibold py-4 rounded-xl mb-3 active:scale-95 transition-transform"
        >
          {loading ? 'Criando...' : 'Criar nova lista'}
        </button>
        <button
          onClick={() => setMode('join')}
          className="w-full max-w-xs bg-gray-700 text-white font-semibold py-4 rounded-xl active:scale-95 transition-transform"
        >
          Entrar com código
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-svh bg-gray-900 px-6">
      <button onClick={() => setMode(null)} className="absolute top-6 left-6 text-gray-400 text-2xl">←</button>
      <div className="text-4xl mb-4">🔑</div>
      <h2 className="text-xl font-bold text-white mb-2">Digite o código</h2>
      <p className="text-gray-400 text-sm mb-8 text-center">
        Peça o código de 6 letras para quem criou a lista
      </p>
      <input
        value={code}
        onChange={e => setCode(e.target.value.toUpperCase())}
        maxLength={6}
        placeholder="XXXXXX"
        className="w-full max-w-xs bg-gray-800 text-white text-center text-3xl tracking-widest font-bold py-4 rounded-xl mb-4 outline-none border-2 border-gray-700 focus:border-green-500"
      />
      {error && <p className="text-red-400 text-sm mb-4">{error}</p>}
      <button
        onClick={handleJoin}
        disabled={loading || code.length < 6}
        className="w-full max-w-xs bg-green-500 disabled:opacity-40 text-white font-semibold py-4 rounded-xl active:scale-95 transition-transform"
      >
        {loading ? 'Entrando...' : 'Entrar'}
      </button>
    </div>
  )
}
