import { useState } from 'react'
import { addDoc, collection, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../context/AuthContext'
import { useFamily } from '../context/FamilyContext'
import Sheet from './Sheet'

const TYPES = [
  { id: 'sugestao', label: '💡 Sugestão' },
  { id: 'problema', label: '🐞 Problema' },
  { id: 'elogio', label: '❤️ Elogio' },
]

export default function FeedbackSheet({ onClose }) {
  const user = useAuth()
  const { familyId } = useFamily()
  const [type, setType] = useState('sugestao')
  const [message, setMessage] = useState('')
  const [status, setStatus] = useState('idle')

  async function send() {
    if (!message.trim()) return
    setStatus('sending')
    try {
      await addDoc(collection(db, 'feedback'), {
        uid: user.uid,
        email: user.email,
        familyId: familyId || null,
        type,
        message: message.trim().slice(0, 2000),
        userAgent: navigator.userAgent.slice(0, 300),
        createdAt: serverTimestamp(),
      })
      setStatus('sent')
    } catch (e) {
      alert('Erro ao enviar: ' + e.message)
      setStatus('idle')
    }
  }

  if (status === 'sent') {
    return (
      <Sheet onClose={onClose}>
        <div className="text-center py-4">
          <div className="text-4xl mb-3">🙏</div>
          <h2 className="text-white text-lg font-semibold mb-1">Obrigado!</h2>
          <p className="text-gray-400 text-sm mb-6">Sua mensagem chegou. Ela ajuda a melhorar o Onlist.</p>
          <button onClick={onClose} className="w-full bg-green-500 text-white font-semibold py-3 rounded-xl">Fechar</button>
        </div>
      </Sheet>
    )
  }

  return (
    <Sheet onClose={onClose}>
      <h2 className="text-white text-lg font-semibold mb-4">Enviar feedback</h2>
      <div className="flex gap-2 mb-3">
        {TYPES.map(t => (
          <button key={t.id} onClick={() => setType(t.id)}
            className={`flex-1 text-sm py-2 rounded-xl border ${type === t.id ? 'border-green-500 bg-green-500/10 text-white' : 'border-gray-700 text-gray-400'}`}>
            {t.label}
          </button>
        ))}
      </div>
      <textarea value={message} onChange={e => setMessage(e.target.value)} maxLength={2000} rows={5} autoFocus
        placeholder="Conte o que achou, o que falta ou o que deu errado..."
        className="w-full bg-gray-800 text-white text-base px-3 py-2.5 rounded-xl outline-none border border-transparent focus:border-green-500 mb-4 resize-none" />
      <div className="flex gap-2">
        <button onClick={onClose} className="flex-1 bg-gray-800 text-white font-semibold py-3 rounded-xl">Cancelar</button>
        <button onClick={send} disabled={!message.trim() || status === 'sending'}
          className="flex-[2] bg-green-500 disabled:opacity-40 text-white font-semibold py-3 rounded-xl">
          {status === 'sending' ? 'Enviando...' : 'Enviar'}
        </button>
      </div>
    </Sheet>
  )
}
