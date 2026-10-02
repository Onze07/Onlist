import { useState } from 'react'
import { serverTimestamp } from 'firebase/firestore'
import { signOut } from 'firebase/auth'
import { auth } from '../firebase'
import { useFamily } from '../context/FamilyContext'
import { LEGAL_VERSION } from '../lib/legal'

// Aceite obrigatório dos Termos e da Política (primeiro acesso ou nova versão)
export default function LegalConsent({ updated }) {
  const { updateUserDoc } = useFamily()
  const [checked, setChecked] = useState(false)
  const [busy, setBusy] = useState(false)

  async function accept() {
    setBusy(true)
    try {
      await updateUserDoc({ legalVersion: LEGAL_VERSION, legalAcceptedAt: serverTimestamp() })
    } catch (e) {
      alert('Erro: ' + e.message)
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col justify-center min-h-svh bg-gray-900 px-6">
      <div className="max-w-sm mx-auto w-full">
        <div className="text-4xl mb-4">📄</div>
        <h1 className="text-white text-xl font-bold mb-2">{updated ? 'Atualizamos nossos termos' : 'Antes de começar'}</h1>
        <p className="text-gray-400 text-sm mb-6 leading-relaxed">
          Leia como o Onlist funciona e como cuidamos dos seus dados, conforme a LGPD.
        </p>
        <div className="flex flex-col gap-2 mb-6">
          <a href="#/termos" className="bg-gray-800 text-white text-sm px-4 py-3 rounded-xl flex justify-between">Termos de Uso <span className="text-gray-500">→</span></a>
          <a href="#/privacidade" className="bg-gray-800 text-white text-sm px-4 py-3 rounded-xl flex justify-between">Política de Privacidade <span className="text-gray-500">→</span></a>
        </div>
        <label className="flex items-start gap-3 mb-6 cursor-pointer">
          <input type="checkbox" checked={checked} onChange={e => setChecked(e.target.checked)}
            className="mt-0.5 w-5 h-5 accent-green-500 flex-shrink-0" />
          <span className="text-gray-300 text-sm">Li e aceito os Termos de Uso e a Política de Privacidade.</span>
        </label>
        <button onClick={accept} disabled={!checked || busy}
          className="w-full bg-green-500 disabled:opacity-40 text-white font-semibold py-3.5 rounded-xl mb-3">
          {busy ? 'Salvando...' : 'Continuar'}
        </button>
        <button onClick={() => signOut(auth)} className="w-full text-gray-500 text-sm py-2">Sair</button>
      </div>
    </div>
  )
}
