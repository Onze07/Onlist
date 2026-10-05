import { useState } from 'react'
import Sheet from './Sheet'
import { useFamily } from '../context/FamilyContext'
import { clearPendingInvite } from '../lib/invite'

// Entrar em outra família já tendo uma (ex.: o casal criou uma família cada um)
export default function SwitchFamilySheet({ initialCode = '', onClose }) {
  const { family, isOwner, switchFamily, setNotice } = useFamily()
  const [code, setCode] = useState(initialCode)
  const [mode, setMode] = useState('merge')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const alone = family.members.length === 1
  const blocked = isOwner && !alone
  const familyName = family.name || 'sua família atual'
  const valid = /^[A-Z0-9]{6}$/.test(code)

  function close() {
    clearPendingInvite()
    onClose()
  }

  async function submit() {
    if (!valid || busy) return
    if (isOwner && mode === 'fresh'
      && !confirm(`As listas, o catálogo e os registros de "${familyName}" serão apagados para sempre. Continuar?`)) return
    setBusy(true)
    setError('')
    try {
      const result = await switchFamily(code, isOwner ? mode : 'fresh')
      clearPendingInvite()
      const m = result.merged
      setNotice(m
        ? `Pronto! Você entrou na nova família e trouxe ${m.catalog} produtos, ${m.history} compras e ${m.lists} listas.`
        : 'Pronto! Você entrou na nova família.')
    } catch (e) {
      setError(e.message)
      setBusy(false)
    }
  }

  return (
    <Sheet onClose={busy ? undefined : close}>
      <h2 className="text-white text-lg font-semibold mb-1">Entrar em outra família</h2>
      <p className="text-gray-400 text-sm mb-4">Use o código ou o link que a outra pessoa enviou.</p>

      <input value={code} onChange={e => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
        maxLength={6} placeholder="CÓDIGO" disabled={busy || blocked}
        className="w-full bg-gray-800 text-white text-center text-2xl tracking-[0.3em] font-bold py-3 rounded-xl mb-4 outline-none border-2 border-gray-700 focus:border-green-500 disabled:opacity-50" />

      {blocked ? (
        <p className="bg-amber-500/10 border border-amber-500/30 text-amber-300 text-sm rounded-xl px-3 py-2.5 mb-4">
          Você é o dono de "{familyName}" e há outras pessoas nela. Primeiro passe a posse para alguém
          (em Pessoas, toque em ⋯ ao lado do nome e escolha "Passar a posse"). Depois volte aqui.
        </p>
      ) : isOwner ? (
        <div className="flex flex-col gap-2 mb-4">
          <p className="text-gray-500 text-xs">O que fazer com os dados de "{familyName}"?</p>
          {[
            { id: 'merge', title: 'Levar meus dados', desc: 'Produtos, preços, compras e listas vão para a nova família. Produtos com o mesmo nome são juntados.' },
            { id: 'fresh', title: 'Começar do zero', desc: 'Os dados atuais são apagados.' },
          ].map(o => (
            <button key={o.id} type="button" onClick={() => setMode(o.id)} disabled={busy} aria-pressed={mode === o.id}
              className={`text-left rounded-xl border px-3 py-2.5 ${mode === o.id ? 'border-green-500 bg-green-500/10' : 'border-gray-700 bg-gray-800'}`}>
              <span className="flex items-center gap-2">
                <span className={`w-4 h-4 rounded-full border-2 flex-shrink-0 ${mode === o.id ? 'border-green-500 bg-green-500' : 'border-gray-500'}`} />
                <span className="text-white text-sm font-medium">{o.title}</span>
              </span>
              <span className="block text-gray-400 text-xs mt-1 ml-6">{o.desc}</span>
            </button>
          ))}
        </div>
      ) : (
        <p className="text-gray-400 text-sm mb-4">
          Você vai sair de "{familyName}". As listas e registros continuam lá para as outras pessoas.
        </p>
      )}

      {error && <p className="text-red-400 text-sm mb-3">{error}</p>}

      <div className="flex gap-3">
        <button onClick={close} disabled={busy} className="flex-1 bg-gray-800 text-white font-medium py-3.5 rounded-xl text-sm disabled:opacity-50">Cancelar</button>
        <button onClick={submit} disabled={!valid || busy || blocked}
          className="flex-1 bg-green-500 disabled:opacity-40 text-white font-semibold py-3.5 rounded-xl text-sm">
          {busy ? (mode === 'merge' && isOwner ? 'Levando os dados...' : 'Entrando...') : 'Entrar'}
        </button>
      </div>
    </Sheet>
  )
}
