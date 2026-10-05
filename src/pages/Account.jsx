import { useState } from 'react'
import { signOut } from 'firebase/auth'
import { auth } from '../firebase'
import { useAuth } from '../context/AuthContext'
import { useFamily } from '../context/FamilyContext'
import { IconEdit, IconX, IconQr, IconLink, IconWhatsApp } from '../components/Icon'
import { userPhoto } from '../lib/user'
import { useInstall } from '../lib/install'
import InstallGuide from '../components/InstallGuide'
import FeedbackSheet from '../components/FeedbackSheet'
import { pushStatus, enablePush, disablePush } from '../lib/push'
import { inviteLink, inviteText } from '../lib/invite'
import InviteQr from '../components/InviteQr'
import SwitchFamilySheet from '../components/SwitchFamilySheet'

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
    renameFamily, regenerateCode, removeMember, setAdmin, leaveFamily, deleteAccount, transferOwnership, updateFamilySettings,
    userDoc, updateUserDoc,
  } = useFamily()
  const decimals = userDoc?.priceDecimals === 3 ? 3 : 2
  const install = useInstall()
  const [sheet, setSheet] = useState(null)
  const [push, setPush] = useState(() => pushStatus())
  const [editingName, setEditingName] = useState(false)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [showQr, setShowQr] = useState(false)

  if (!family) return null

  const admins = family.admins || []
  const members = [...family.members].sort((a, b) => {
    const rank = uid => (uid === family.createdBy ? 0 : admins.includes(uid) ? 1 : 2)
    return rank(a) - rank(b) || (profiles[a]?.name || '').localeCompare(profiles[b]?.name || '')
  })
  const used = family.members.length
  const full = used >= seats

  async function run(fn) {
    if (busy) return
    setBusy(true)
    try { await fn() } catch (e) { alert('Erro: ' + e.message) } finally { setBusy(false) }
  }

  const text = inviteText(family.name, family.code)

  async function shareInvite() {
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
        {isAdmin && (
          <button disabled={busy} onClick={() => run(() => updateFamilySettings({ brandsEnabled: !family.brandsEnabled }))}
            className="w-full px-4 py-3 flex items-center justify-between gap-3 text-left border-b border-gray-800" aria-pressed={!!family.brandsEnabled}>
            <span>
              <span className="text-white text-sm block">Anotar marca dos produtos</span>
              <span className="text-gray-500 text-xs">Campo opcional no item. O produto continua um só (ex.: Arroz).</span>
            </span>
            <span className={`w-11 h-6 rounded-full p-0.5 transition-colors flex-shrink-0 ${family.brandsEnabled ? 'bg-green-500' : 'bg-gray-700'}`}>
              <span className={`block w-5 h-5 rounded-full bg-white transition-transform ${family.brandsEnabled ? 'translate-x-5' : ''}`} />
            </span>
          </button>
        )}
        <div className="p-4 flex items-center justify-between">
          <span className="text-gray-400 text-sm">{family.plan?.name ? `Plano ${family.plan.name}` : 'Pessoas na família'}</span>
          <span className={`text-sm font-medium ${full ? 'text-amber-400' : 'text-gray-300'}`}>
            {family.plan ? `${used} de ${seats}` : used}
          </span>
        </div>
        {full && <p className="text-amber-400/80 text-xs px-4 pb-3 -mt-2">Todas as vagas estão ocupadas. Ninguém novo consegue entrar.</p>}
      </Section>

      {/* Convite */}
      <Section title="Convidar">
        <div className="p-4">
          <p className="text-gray-400 text-xs mb-1">Envie o link. Quem abrir entra direto na família.</p>
          <p className="text-gray-500 text-xs mb-3">Código: <span className="text-green-400 font-bold tracking-[0.2em]">{family.code}</span></p>
          <div className="flex items-center gap-2">
            <a href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener noreferrer"
              onClick={e => full && e.preventDefault()}
              className={`flex-1 inline-flex items-center justify-center gap-2 bg-green-500 text-white text-sm font-semibold py-2.5 rounded-xl ${full ? 'opacity-40' : ''}`}>
              <IconWhatsApp size={18} /> WhatsApp
            </a>
            <button onClick={shareInvite} disabled={full} aria-label="Compartilhar link" title="Compartilhar link"
              className="inline-flex items-center justify-center gap-1.5 bg-gray-800 border border-gray-700 text-gray-200 text-sm px-3 py-2.5 rounded-xl disabled:opacity-40">
              <IconLink size={16} /> {copied ? 'Copiado!' : 'Link'}
            </button>
            <button onClick={() => setShowQr(v => !v)} disabled={full} aria-label="Mostrar QR code" title="QR code" aria-pressed={showQr}
              className={`inline-flex items-center justify-center w-11 h-11 rounded-xl border disabled:opacity-40 ${showQr ? 'bg-green-500/10 border-green-500/40 text-green-300' : 'bg-gray-800 border-gray-700 text-gray-200'}`}>
              <IconQr size={18} />
            </button>
          </div>
          {showQr && !full && (
            <div className="mt-4 text-center">
              <InviteQr value={inviteLink(family.code)} />
              <p className="text-gray-500 text-xs mt-2">Aponte a câmera do celular da outra pessoa</p>
            </div>
          )}
          {isAdmin && (
            <button disabled={busy}
              onClick={() => confirm('Gerar um novo código? O código e o link atuais deixam de funcionar.') && run(regenerateCode)}
              className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full border border-gray-700 bg-gray-800 text-gray-300 active:bg-gray-700">
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
                    if (action === 'owner' && confirm(`Passar a posse da família para ${who}? Você vira admin e pode sair da família depois.`)) {
                      run(() => transferOwnership(uid))
                    }
                  }}
                  className="bg-transparent text-gray-400 text-lg w-6 outline-none appearance-none text-center cursor-pointer"
                  aria-label="Ações">
                  <option value="" disabled hidden>⋯</option>
                  {isOwner && role === 'Membro' && <option value="admin">Tornar admin</option>}
                  {isOwner && role === 'Admin' && <option value="unadmin">Remover admin</option>}
                  {isOwner && <option value="owner">Passar a posse</option>}
                  {canRemove && <option value="remove">Remover da família</option>}
                </select>
              ) : <span className="w-6" />}
            </div>
          )
        })}
      </Section>

      <div className="px-4 pt-6 flex flex-col gap-2">
        <button disabled={busy} onClick={() => setSheet('switch')}
          className="w-full text-gray-200 text-sm border border-gray-700 bg-gray-800 py-3 rounded-xl">
          Entrar em outra família
        </button>
        {!isOwner && (
          <button disabled={busy}
            onClick={() => confirm('Sair desta família? Você perde acesso às listas e ao histórico.') && run(leaveFamily)}
            className="w-full text-red-400 text-sm border border-red-500/30 py-3 rounded-xl">
            Sair da família
          </button>
        )}
      </div>

      <Section title="Notificações">
        <div className={`px-4 py-3 ${push === 'enabled' ? 'border-b border-gray-800' : ''}`}>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-white text-sm">Avisos neste aparelho</p>
              <p className="text-gray-500 text-xs">
                {{
                  enabled: 'Ativados',
                  off: 'Desativados',
                  denied: 'Bloqueados nas configurações do aparelho',
                  'ios-install': 'No iPhone, instale o app na tela inicial primeiro',
                  unsupported: 'Este navegador não aceita notificações',
                  unconfigured: 'Em configuração',
                }[push]}
              </p>
            </div>
            {push === 'off' && (
              <button disabled={busy} onClick={() => run(async () => { await enablePush(user, family.id); setPush(pushStatus()) })}
                className="bg-green-500 text-white text-sm font-semibold px-3 py-1.5 rounded-lg flex-shrink-0">Ativar</button>
            )}
            {push === 'enabled' && (
              <button disabled={busy} onClick={() => run(async () => { await disablePush(user, family.id); setPush(pushStatus()) })}
                className="text-gray-400 text-sm border border-gray-700 px-3 py-1.5 rounded-lg flex-shrink-0">Desativar</button>
            )}
            {push === 'ios-install' && (
              <button onClick={() => setSheet('install')}
                className="text-green-400 text-sm border border-green-500/40 px-3 py-1.5 rounded-lg flex-shrink-0">Como?</button>
            )}
          </div>
        </div>
        {/* Preferência só faz sentido depois de ativar os avisos neste aparelho */}
        {push === 'enabled' && (
          <button onClick={() => updateUserDoc({ notifyShopping: userDoc?.notifyShopping === false }).catch(e => alert('Erro: ' + e.message))}
            className="w-full px-4 py-3 flex items-center justify-between gap-3 text-left" aria-pressed={userDoc?.notifyShopping !== false}>
            <span>
              <span className="text-white text-sm block">Quando alguém começar a comprar</span>
              <span className="text-gray-500 text-xs">"Ana está no mercado"</span>
            </span>
            <span className={`w-11 h-6 rounded-full p-0.5 transition-colors flex-shrink-0 ${userDoc?.notifyShopping !== false ? 'bg-green-500' : 'bg-gray-700'}`}>
              <span className={`block w-5 h-5 rounded-full bg-white transition-transform ${userDoc?.notifyShopping !== false ? 'translate-x-5' : ''}`} />
            </span>
          </button>
        )}
      </Section>

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
      {sheet === 'switch' && <SwitchFamilySheet onClose={() => setSheet(null)} />}
    </div>
  )
}
