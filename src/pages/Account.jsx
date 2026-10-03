import { useState } from 'react'
import { signOut } from 'firebase/auth'
import { auth } from '../firebase'
import { useAuth } from '../context/AuthContext'
import { useFamily } from '../context/FamilyContext'
import { IconEdit, IconX } from '../components/Icon'
import { userPhoto } from '../lib/user'
import { useInstall } from '../lib/install'
import InstallGuide from '../components/InstallGuide'
import FeedbackSheet from '../components/FeedbackSheet'

const APP_URL = typeof window !== 'undefined' ? window.location.origin : ''

function Avatar({ profile, size = 36 }) {
  const initial = (profile?.name || profile?.email || '?').trim().charAt(0).toUpperCase()
  if (profile?.photoURL) {
    return <img src={profile.photoURL} alt="" referrerPolicy="no-referrer"
      className="rounded-full flex-shrink-0 object-cover" style={{ width: size, height: size }} />
  }
  return (
    <div className="rounded-full bg-gray-700 text-gray-200 flex items-center justify-center flex-shrink-0 font-semibold"
      style={{ width: size, height: size, fontSize: size * 0.4 }}>
      {initial}
    </div>
  )
}

function Section({ title, children, right }) {
  return (
    <div className="px-4 pt-6">
      <div className="flex items-center justify-between mb-2">
        <p className="text-gray-500 text-xs uppercase tracking-wider">{title}</p>
        {right}
      </div>
      <div className="bg-gray-800/60 rounded-2xl border border-gray-800">{children}</div>
    </div>
  )
}

export default function Account() {
  const user = useAuth()
  const {
    family, profiles, isOwner, isAdmin, seats,
    renameFamily, regenerateCode, removeMember, setAdmin, leaveFamily, deleteAccount,
    userDoc, updateUserDoc,
  } = useFamily()
  const decimals = userDoc?.priceDecimals === 3 ? 3 : 2
  const install = useInstall()
  const [sheet, setSheet] = useState(null)
  const [editingName, setEditingName] = useState(false)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)

  if (!family) return null

  const admins = family.admins || []
  const members = [...family.members].sort((a, b) => {
    const rank = uid => (uid === family.createdBy ? 0 : admins.includes(uid) ? 1 : 2)
    return rank(a) - rank(b) || (profiles[a]?.name || '').localeCompare(profiles[b]?.name || '')
  })
  const used = family.members.length
  const full = used >= seats
  const planLabel = family.plan?.name || 'Teste'

  async function run(fn) {
    if (busy) return
    setBusy(true)
    try { await fn() } catch (e) { alert('Erro: ' + e.message) } finally { setBusy(false) }
  }

  async function shareCode() {
    const text = `Entre na lista de compras "${family.name || 'da família'}" no Onlist.\nCódigo: ${family.code}\n${APP_URL}`
    if (navigator.share) {
      try { await navigator.share({ title: 'Convite Onlist', text }); return } catch { /* cancelado */ }
    }
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      alert(text)
    }
  }

  function roleOf(uid) {
    if (uid === family.createdBy) return 'Dono'
    if (admins.includes(uid)) return 'Admin'
    return 'Membro'
  }

  return (
    <div className="flex flex-col min-h-svh bg-gray-900 pb-28">
      <div className="px-4 pt-12 pb-3 border-b border-gray-800">
        <h1 className="text-white text-xl font-semibold">Conta</h1>
      </div>

      {/* Usuário */}
      <div className="px-4 pt-5 flex items-center gap-3">
        <Avatar profile={{ name: user.displayName, email: user.email, photoURL: userPhoto(user) }} size={48} />
        <div className="flex-1 min-w-0">
          <p className="text-white font-medium truncate">{user.displayName || user.email}</p>
          <p className="text-gray-500 text-xs truncate">{user.email}</p>
        </div>
        <button onClick={() => confirm('Sair da sua conta neste aparelho?') && signOut(auth)}
          className="text-gray-400 text-xs border border-gray-700 px-3 py-1.5 rounded-lg">
          Sair
        </button>
      </div>

      {/* Família e plano */}
      <Section title="Família">
        <div className="p-4 border-b border-gray-800">
          {editingName ? (
            <div className="flex gap-2">
              <input autoFocus value={name} onChange={e => setName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && run(async () => { await renameFamily(name); setEditingName(false) })}
                className="flex-1 bg-gray-800 text-white px-3 py-2 rounded-lg outline-none text-sm border border-gray-700" />
              <button onClick={() => run(async () => { await renameFamily(name); setEditingName(false) })}
                className="text-green-400 text-sm font-semibold px-2">OK</button>
              <button onClick={() => setEditingName(false)} className="text-gray-500 px-1"><IconX /></button>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <span className="text-white font-medium">{family.name || 'Minha família'}</span>
              {isAdmin && (
                <button onClick={() => { setName(family.name || ''); setEditingName(true) }} className="text-gray-400">
                  <IconEdit size={16} />
                </button>
              )}
            </div>
          )}
        </div>
        <div className="p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-400 text-sm">Plano {planLabel}</span>
            <span className={`text-sm font-medium ${full ? 'text-amber-400' : 'text-gray-300'}`}>{used} de {seats} pessoas</span>
          </div>
          <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
            <div className={`h-full rounded-full ${full ? 'bg-amber-400' : 'bg-green-500'}`}
              style={{ width: `${Math.min(100, (used / seats) * 100)}%` }} />
          </div>
          {full && <p className="text-amber-400/80 text-xs mt-2">Todas as vagas estão ocupadas. Ninguém novo consegue entrar.</p>}
        </div>
      </Section>

      {/* Convite */}
      <Section title="Convidar">
        <div className="p-4">
          <p className="text-gray-400 text-xs mb-2">Código de convite</p>
          <div className="flex items-center justify-between gap-3">
            <span className="text-green-400 text-2xl font-bold tracking-[0.25em]">{family.code}</span>
            <button onClick={shareCode} disabled={full}
              className="bg-green-500 disabled:opacity-40 text-white text-sm font-semibold px-4 py-2 rounded-xl">
              {copied ? 'Copiado!' : 'Compartilhar'}
            </button>
          </div>
          {isAdmin && (
            <button disabled={busy}
              onClick={() => confirm('Gerar um novo código? O código atual deixa de funcionar.') && run(regenerateCode)}
              className="text-gray-500 text-xs mt-3 underline underline-offset-2">
              Gerar novo código
            </button>
          )}
        </div>
      </Section>

      {/* Membros */}
      <Section title={`Pessoas (${used})`}>
        {members.map((uid, i) => {
          const p = profiles[uid]
          const isMe = uid === user.uid
          const role = roleOf(uid)
          const canRemove = !isMe && uid !== family.createdBy && (isOwner || (isAdmin && role === 'Membro'))
          return (
            <div key={uid} className={`flex items-center gap-3 px-4 py-3 ${i < members.length - 1 ? 'border-b border-gray-800' : ''}`}>
              <Avatar profile={p} />
              <div className="flex-1 min-w-0">
                <p className="text-white text-sm truncate">
                  {p?.name || 'Pessoa sem perfil'}{isMe && <span className="text-gray-500"> (você)</span>}
                </p>
                <p className="text-gray-500 text-xs truncate">{p?.email || uid.slice(0, 8)}</p>
              </div>
              <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full
                ${role === 'Dono' ? 'bg-green-500/15 text-green-400' : role === 'Admin' ? 'bg-blue-500/15 text-blue-300' : 'bg-gray-700 text-gray-400'}`}>
                {role}
              </span>
              {(isOwner && !isMe) || canRemove ? (
                <select value="" disabled={busy}
                  onChange={e => {
                    const action = e.target.value
                    const who = p?.name || 'esta pessoa'
                    if (action === 'admin') run(() => setAdmin(uid, true))
                    if (action === 'unadmin') run(() => setAdmin(uid, false))
                    if (action === 'remove' && confirm(`Remover ${who} da família?`)) run(() => removeMember(uid))
                  }}
                  className="bg-transparent text-gray-400 text-lg w-6 outline-none appearance-none text-center cursor-pointer"
                  aria-label="Ações">
                  <option value="" disabled hidden>⋯</option>
                  {isOwner && role === 'Membro' && <option value="admin">Tornar admin</option>}
                  {isOwner && role === 'Admin' && <option value="unadmin">Remover admin</option>}
                  {canRemove && <option value="remove">Remover da família</option>}
                </select>
              ) : <span className="w-6" />}
            </div>
          )
        })}
      </Section>

      {!isOwner && (
        <div className="px-4 pt-6">
          <button disabled={busy}
            onClick={() => confirm('Sair desta família? Você perde acesso às listas e ao histórico.') && run(leaveFamily)}
            className="w-full text-red-400 text-sm border border-red-500/30 py-3 rounded-xl">
            Sair da família
          </button>
        </div>
      )}

      <Section title="App">
        <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between gap-3">
          <div>
            <p className="text-white text-sm">Casas decimais do preço</p>
            <p className="text-gray-500 text-xs">Ao digitar 599: {decimals === 3 ? '0,599' : '5,99'}</p>
          </div>
          <div className="flex bg-gray-900 rounded-lg p-0.5 border border-gray-700">
            {[2, 3].map(n => (
              <button key={n} onClick={() => updateUserDoc({ priceDecimals: n }).catch(e => alert('Erro: ' + e.message))}
                className={`px-3 py-1 text-sm rounded-md ${decimals === n ? 'bg-green-500 text-white' : 'text-gray-400'}`}>
                {n}
              </button>
            ))}
          </div>
        </div>
        {!install.standalone && (install.canPrompt || install.ios) && (
          <button onClick={() => (install.canPrompt ? install.promptInstall() : setSheet('install'))}
            className="w-full text-left px-4 py-3 text-white text-sm border-b border-gray-800 flex justify-between">
            Instalar o app <span className="text-gray-500">→</span>
          </button>
        )}
        <button onClick={() => setSheet('feedback')}
          className="w-full text-left px-4 py-3 text-white text-sm border-b border-gray-800 flex justify-between">
          Enviar feedback <span className="text-gray-500">→</span>
        </button>
        <a href="#/termos" className="px-4 py-3 text-white text-sm border-b border-gray-800 flex justify-between">
          Termos de Uso <span className="text-gray-500">→</span>
        </a>
        <a href="#/privacidade" className="px-4 py-3 text-white text-sm flex justify-between">
          Política de Privacidade <span className="text-gray-500">→</span>
        </a>
      </Section>

      <div className="px-4 pt-8 pb-4 text-center">
        <button disabled={busy}
          onClick={() => {
            const msg = isOwner && family.members.length === 1
              ? 'Excluir sua conta? Todas as listas, o catálogo e o histórico da família serão apagados para sempre.'
              : 'Excluir sua conta? Você sai da família e seus dados pessoais são apagados.'
            if (confirm(msg) && confirm('Tem certeza? Isso não pode ser desfeito.')) run(deleteAccount)
          }}
          className="text-red-400/80 text-xs underline underline-offset-2">
          Excluir minha conta
        </button>
      </div>

      {sheet === 'install' && <InstallGuide onClose={() => setSheet(null)} />}
      {sheet === 'feedback' && <FeedbackSheet onClose={() => setSheet(null)} />}
    </div>
  )
}
