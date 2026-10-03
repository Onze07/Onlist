import { useState } from 'react'
import Sheet from './Sheet'
import { useAuth } from '../context/AuthContext'
import { useFamily } from '../context/FamilyContext'
import { sendNotify } from '../lib/push'

// "Avisar fulano": escolhe quem recebe o aviso de que tem compra para fazer
export default function NotifySheet({ listName, pendingCount, onClose }) {
  const user = useAuth()
  const { family, profiles } = useFamily()
  const others = (family?.members || []).filter(uid => uid !== user.uid)
  const [selected, setSelected] = useState(() => others.length === 1 ? others : [])
  const [message, setMessage] = useState('')
  const [status, setStatus] = useState('idle')
  const [result, setResult] = useState(null)

  const defaultText = `${pendingCount > 0 ? `${pendingCount} ${pendingCount === 1 ? 'item' : 'itens'} para comprar` : 'Tem compra para fazer'} em "${listName}".`

  function toggle(uid) {
    setSelected(s => s.includes(uid) ? s.filter(x => x !== uid) : [...s, uid])
  }

  async function send() {
    setStatus('sending')
    try {
      const r = await sendNotify({ familyId: family.id, type: 'list', to: selected, listName, count: pendingCount, message })
      setResult(r)
      setStatus('sent')
    } catch (e) {
      alert(e.message)
      setStatus('idle')
    }
  }

  if (others.length === 0) {
    return (
      <Sheet onClose={onClose}>
        <h2 className="text-white text-lg font-semibold mb-2">Avisar alguém</h2>
        <p className="text-gray-400 text-sm mb-5">Ainda não há outras pessoas na família. Convide pelo código na aba Conta.</p>
        <button onClick={onClose} className="w-full bg-gray-800 text-white font-semibold py-3 rounded-xl">Fechar</button>
      </Sheet>
    )
  }

  if (status === 'sent') {
    const names = uids => uids.map(u => profiles[u]?.name?.split(' ')[0] || 'alguém').join(', ')
    const without = result?.withoutDevice || []
    return (
      <Sheet onClose={onClose}>
        <div className="text-center py-2">
          <div className="text-4xl mb-3">{result?.sent > 0 ? '📨' : '🔕'}</div>
          <h2 className="text-white text-lg font-semibold mb-1">{result?.sent > 0 ? 'Aviso enviado' : 'Ninguém recebeu'}</h2>
          {without.length > 0 && (
            <p className="text-amber-300/90 text-sm mb-1">{names(without)} ainda não ativou as notificações (aba Conta).</p>
          )}
          <button onClick={onClose} className="w-full bg-green-500 text-white font-semibold py-3 rounded-xl mt-5">Fechar</button>
        </div>
      </Sheet>
    )
  }

  return (
    <Sheet onClose={onClose}>
      <h2 className="text-white text-lg font-semibold mb-1">Avisar alguém</h2>
      <p className="text-gray-400 text-sm mb-4">A pessoa recebe uma notificação no celular.</p>
      <div className="flex flex-col gap-2 mb-4">
        {others.map(uid => {
          const p = profiles[uid]
          const on = selected.includes(uid)
          return (
            <button key={uid} onClick={() => toggle(uid)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left ${on ? 'border-green-500 bg-green-500/10' : 'border-gray-700'}`}>
              <span className={`w-5 h-5 rounded-md border flex items-center justify-center text-xs ${on ? 'bg-green-500 border-green-500 text-white' : 'border-gray-500'}`}>{on ? '✓' : ''}</span>
              <span className="flex-1 min-w-0">
                <span className="text-white text-sm block truncate">{p?.name || 'Pessoa'}</span>
                {!p?.pushEnabled && <span className="text-gray-500 text-xs">notificações não ativadas</span>}
              </span>
            </button>
          )
        })}
      </div>
      <textarea value={message} onChange={e => setMessage(e.target.value)} maxLength={200} rows={2}
        placeholder={defaultText}
        className="w-full bg-gray-800 text-white text-base px-3 py-2.5 rounded-xl outline-none border border-transparent focus:border-green-500 mb-4 resize-none" />
      <div className="flex gap-2">
        <button onClick={onClose} className="flex-1 bg-gray-800 text-white font-semibold py-3 rounded-xl">Cancelar</button>
        <button onClick={send} disabled={selected.length === 0 || status === 'sending' || !navigator.onLine}
          className="flex-[2] bg-green-500 disabled:opacity-40 text-white font-semibold py-3 rounded-xl">
          {!navigator.onLine ? 'Sem internet' : status === 'sending' ? 'Enviando...' : 'Enviar aviso'}
        </button>
      </div>
    </Sheet>
  )
}
