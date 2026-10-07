import { useCallback, useEffect, useMemo, useState } from 'react'
import { adminApi } from './firebase'

// Painel do dono do app (desktop primeiro): clientes, famílias, membros e planos.
const fmtMoney = n => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtDate = iso => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '—')

function ago(iso) {
  if (!iso) return 'nunca'
  const d = Math.floor((Date.now() - Date.parse(iso)) / 86400000)
  if (d <= 0) return 'hoje'
  if (d === 1) return 'ontem'
  if (d < 30) return `há ${d} dias`
  return fmtDate(iso)
}

const STATUS = {
  trial: { label: 'Teste', cls: 'bg-blue-500/15 text-blue-300 border-blue-500/30' },
  active: { label: 'Ativo', cls: 'bg-green-500/15 text-green-300 border-green-500/30' },
  past_due: { label: 'Atrasado', cls: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
  canceled: { label: 'Cancelado', cls: 'bg-gray-800 text-gray-400 border-gray-700' },
}
const INTERVAL = { monthly: 'Mensal', annual: 'Anual', lifetime: 'Vitalício', none: 'Sem cobrança' }

// Modelos de plano: escolher um preenche os campos (dá para ajustar antes de salvar).
// As limitações do Básico só passam a valer quando a cobrança for ligada no app.
const TIERS = {
  founder: { label: 'Fundador', hint: 'Testadores do início: tudo liberado, sem cobrança', preset: { name: 'Fundador', interval: 'lifetime', price: 0, seats: 20 } },
  basic: { label: 'Básico', hint: 'Lista e relatório de 60 dias', preset: { name: 'Básico', interval: 'none', price: 0, seats: 4 } },
  premium: { label: 'Premium', hint: 'Todas as funções', preset: { name: 'Premium', interval: 'monthly', price: 7.9, seats: 4 } },
  custom: { label: 'Personalizado', hint: 'Valores livres', preset: {} },
}
const FEEDBACK = {
  new: { label: 'Novo', cls: 'bg-blue-500/15 text-blue-300 border-blue-500/30' },
  doing: { label: 'Em andamento', cls: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
  done: { label: 'Resolvido', cls: 'bg-green-500/15 text-green-300 border-green-500/30' },
}

const Spinner = () => <div className="w-6 h-6 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />

function PlanBadge({ plan }) {
  if (!plan) return <span className="text-[11px] px-2 py-0.5 rounded-full border bg-gray-900 text-gray-500 border-gray-700 whitespace-nowrap">Livre</span>
  const s = STATUS[plan.status] || STATUS.trial
  return <span className={`text-[11px] px-2 py-0.5 rounded-full border whitespace-nowrap ${s.cls}`}>{plan.name} · {s.label}</span>
}

function Tile({ label, value, hint }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
      <p className="text-gray-500 text-xs">{label}</p>
      <p className="text-white text-3xl font-semibold mt-1 tabular-nums">{value}</p>
      {hint && <p className="text-gray-500 text-xs mt-1">{hint}</p>}
    </div>
  )
}

// Funil de uma série só: barras horizontais com rótulo direto
function Funnel({ steps }) {
  const max = Math.max(1, ...steps.map(s => s.value))
  return (
    <div className="flex flex-col gap-3">
      {steps.map((s, i) => {
        const prev = i > 0 ? steps[i - 1].value : null
        const rate = prev ? Math.round((s.value / prev) * 100) : null
        return (
          <div key={s.label} className="grid grid-cols-[180px_1fr_120px] items-center gap-3 max-md:grid-cols-[1fr_auto]">
            <span className="text-gray-300 text-sm">{s.label}</span>
            <div className="h-3 bg-gray-800 rounded-full overflow-hidden max-md:col-span-2 max-md:order-last" title={`${s.label}: ${s.value}`}>
              <div className="h-full bg-green-500 rounded-full" style={{ width: `${Math.max(1.5, (s.value / max) * 100)}%` }} />
            </div>
            <span className="text-sm tabular-nums text-right">
              <span className="text-white">{s.value}</span>
              {rate !== null && <span className="text-gray-500"> · {rate}%</span>}
            </span>
          </div>
        )
      })}
    </div>
  )
}

function PlanEditor({ family, onSaved }) {
  const p = family.plan
  const [form, setForm] = useState({
    tier: p?.tier || (p ? 'custom' : 'founder'),
    name: p?.name || 'Fundador',
    status: p?.status || 'active',
    interval: p?.interval || 'lifetime',
    seats: p?.seats || 20,
    price: p?.price ?? 0,
    validUntil: p?.validUntil ? p.validUntil.slice(0, 10) : '',
    notes: p?.notes || '',
  })
  const [busy, setBusy] = useState(false)
  const field = 'w-full mt-1 bg-gray-800 text-white rounded-lg px-3 h-9 text-sm outline-none border border-gray-700 focus:border-green-500'
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  async function save(plan) {
    setBusy(true)
    try {
      await adminApi('setPlan', { familyId: family.id, plan })
      onSaved()
    } catch (e) {
      alert(e.message)
    }
    setBusy(false)
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-4 gap-1.5">
        {Object.entries(TIERS).map(([id, t]) => (
          <button key={id} type="button" title={t.hint} aria-pressed={form.tier === id}
            onClick={() => setForm(f => ({ ...f, ...t.preset, tier: id }))}
            className={`text-xs py-2 rounded-lg border ${form.tier === id ? 'bg-green-500/15 border-green-500/50 text-green-300' : 'bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700'}`}>
            {t.label}
          </button>
        ))}
      </div>
      <p className="text-gray-500 text-xs -mt-1">{TIERS[form.tier]?.hint}</p>
      <div className="grid grid-cols-2 gap-3">
        <label className="text-gray-500 text-xs">Nome do plano
          <input value={form.name} onChange={e => set('name', e.target.value)} className={field} />
        </label>
        <label className="text-gray-500 text-xs">Situação
          <select value={form.status} onChange={e => set('status', e.target.value)} className={field}>
            {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </label>
        <label className="text-gray-500 text-xs">Período
          <select value={form.interval} onChange={e => set('interval', e.target.value)} className={field}>
            {Object.entries(INTERVAL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label className="text-gray-500 text-xs">Valor (R$)
          <input value={form.price} onChange={e => set('price', e.target.value.replace(',', '.'))} inputMode="decimal" className={field} />
        </label>
        <label className="text-gray-500 text-xs">Limite de pessoas
          <input value={form.seats} onChange={e => set('seats', e.target.value.replace(/\D/g, ''))} inputMode="numeric" className={field} />
        </label>
        <label className="text-gray-500 text-xs">Válido até
          <input type="date" value={form.validUntil} onChange={e => set('validUntil', e.target.value)} className={`${field} [color-scheme:dark]`} />
        </label>
      </div>
      <label className="text-gray-500 text-xs">Observação (ex.: pagou por Pix em 05/10)
        <input value={form.notes} onChange={e => set('notes', e.target.value)} className={field} />
      </label>
      <div className="flex gap-2">
        {p && (
          <button disabled={busy} onClick={() => confirm('Remover o plano? A família volta ao acesso livre.') && save(null)}
            className="px-4 border border-red-500/30 text-red-300 text-sm py-2 rounded-lg hover:bg-red-500/10 disabled:opacity-50">Remover plano</button>
        )}
        <button disabled={busy} onClick={() => save({ ...form, seats: Number(form.seats), price: Number(form.price) })}
          className="flex-1 bg-green-500 hover:bg-green-400 text-white font-semibold text-sm py-2 rounded-lg disabled:opacity-50">
          {busy ? 'Salvando...' : p ? 'Salvar alterações' : 'Criar plano'}
        </button>
      </div>
      {p?.updatedAt && <p className="text-gray-600 text-xs">Atualizado em {fmtDate(p.updatedAt)}{p.updatedBy ? ` por ${p.updatedBy}` : ''}</p>}
    </div>
  )
}

// Detalhe da família em painel lateral à direita
function FamilyDrawer({ familyId, onClose, onChanged }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const load = useCallback(() => {
    adminApi('family', { familyId }).then(setData).catch(e => setError(e.message))
  }, [familyId])
  useEffect(() => { setData(null); load() }, [load])
  useEffect(() => {
    const fn = e => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50" onClick={onClose}>
      <aside className="w-full max-w-[480px] h-full bg-gray-900 border-l border-gray-800 overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-gray-900/95 backdrop-blur border-b border-gray-800 px-6 py-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-white text-lg font-semibold truncate">{data?.name || 'Família'}</h2>
            {data && <p className="text-gray-500 text-xs">Criada em {fmtDate(data.createdAt)} · código {data.code}{data.brandsEnabled ? ' · usa marcas' : ''}</p>}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-sm px-2" aria-label="Fechar">✕</button>
        </div>
        {!data && !error && <div className="py-24 flex justify-center"><Spinner /></div>}
        {error && <p className="text-red-300 text-sm p-6">{error}</p>}
        {data && (
          <div className="px-6 py-5 flex flex-col gap-6">
            <div className="grid grid-cols-4 gap-2 text-center">
              {[['Compras', data.counts.purchases], ['Com nota', data.counts.nfce], ['Produtos', data.counts.catalog], ['Listas', data.counts.lists]].map(([l, v]) => (
                <div key={l} className="bg-gray-800/60 rounded-xl py-2.5">
                  <p className="text-white text-lg font-semibold tabular-nums">{v}</p>
                  <p className="text-gray-500 text-[11px]">{l}</p>
                </div>
              ))}
            </div>

            <section>
              <h3 className="text-gray-400 text-xs font-medium uppercase tracking-wider mb-2">Pessoas ({data.members.length})</h3>
              <div className="border border-gray-800 rounded-xl divide-y divide-gray-800">
                {data.members.map(m => (
                  <div key={m.uid} className="px-3 py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-white text-sm truncate">{m.name || 'Sem nome'}</span>
                      <span className="text-gray-400 text-[11px] uppercase tracking-wider">{m.role}</span>
                    </div>
                    <p className="text-gray-400 text-xs truncate select-all">{m.email || m.uid}</p>
                    <p className="text-gray-600 text-[11px]">Entrou {fmtDate(m.joinedAt)} · visto {ago(m.lastSeenAt)} · avisos {m.pushEnabled ? 'ligados' : 'desligados'}</p>
                  </div>
                ))}
              </div>
            </section>

            <section>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-gray-400 text-xs font-medium uppercase tracking-wider">Plano / assinatura</h3>
                <PlanBadge plan={data.plan} />
              </div>
              <PlanEditor key={data.plan?.updatedAt || 'none'} family={data} onSaved={() => { load(); onChanged() }} />
            </section>

            {data.recent.length > 0 && (
              <section>
                <h3 className="text-gray-400 text-xs font-medium uppercase tracking-wider mb-2">Últimas compras</h3>
                <div className="flex flex-col gap-1.5">
                  {data.recent.map(r => (
                    <div key={r.id} className="flex justify-between text-sm gap-3">
                      <span className="text-gray-400 truncate">{fmtDate(r.createdAt)} · {r.mercado || 'Não informado'} · {r.items} itens{r.source === 'nfce' ? ' · nota' : ''}</span>
                      <span className="text-gray-200 tabular-nums flex-shrink-0">{fmtMoney(r.total)}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </aside>
    </div>
  )
}

// Tabela com ordenação ao clicar no cabeçalho
function SortTh({ id, sort, setSort, children, className = '' }) {
  const active = sort.key === id
  return (
    <th className={`font-medium px-4 py-2.5 ${className}`}>
      <button onClick={() => setSort(s => ({ key: id, dir: s.key === id && s.dir === 'desc' ? 'asc' : 'desc' }))}
        className={`inline-flex items-center gap-1 hover:text-white ${active ? 'text-white' : ''}`}>
        {children}{active && <span>{sort.dir === 'desc' ? '↓' : '↑'}</span>}
      </button>
    </th>
  )
}

// Atendimento das mensagens do "Enviar feedback": novo -> em andamento -> resolvido
function SupportItem({ f, onChanged }) {
  const [note, setNote] = useState(f.adminNote)
  const [busy, setBusy] = useState(false)
  const s = FEEDBACK[f.status] || FEEDBACK.new

  async function update(status) {
    setBusy(true)
    try {
      await adminApi('feedbackStatus', { id: f.id, status, note })
      onChanged()
    } catch (e) {
      alert(e.message)
      setBusy(false)
    }
  }

  const subject = encodeURIComponent('Onlist: sobre sua mensagem')
  const body = encodeURIComponent(`Olá!\n\nSobre sua mensagem: "${f.message.slice(0, 200)}"\n\n`)
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="text-gray-400 truncate select-all">{f.email || 'anônimo'}{f.type ? ` · ${f.type}` : ''}</span>
        <span className="flex items-center gap-2 flex-shrink-0">
          <span className="text-gray-500">{fmtDate(f.createdAt)}</span>
          <span className={`px-2 py-0.5 rounded-full border ${s.cls}`}>{s.label}</span>
        </span>
      </div>
      <p className="text-gray-100 text-sm whitespace-pre-wrap">{f.message}</p>
      <input value={note} onChange={e => setNote(e.target.value)} placeholder="Anotação interna (o usuário não vê)"
        className="w-full bg-gray-800 text-white rounded-lg px-3 h-9 text-sm outline-none border border-gray-700 focus:border-green-500" />
      <div className="flex flex-wrap items-center gap-2">
        {f.email && (
          <a href={`mailto:${f.email}?subject=${subject}&body=${body}`}
            className="text-sm px-3 py-1.5 rounded-lg border border-gray-700 bg-gray-800 text-gray-200 hover:bg-gray-700">Responder por e-mail</a>
        )}
        <span className="flex-1" />
        {f.status !== 'doing' && f.status !== 'done' && (
          <button disabled={busy} onClick={() => update('doing')}
            className="text-sm px-3 py-1.5 rounded-lg border border-amber-500/30 text-amber-300 hover:bg-amber-500/10 disabled:opacity-50">Em andamento</button>
        )}
        {f.status !== 'done' ? (
          <button disabled={busy} onClick={() => update('done')}
            className="text-sm px-3 py-1.5 rounded-lg bg-green-500 hover:bg-green-400 text-white font-medium disabled:opacity-50">Marcar resolvido</button>
        ) : (
          <button disabled={busy} onClick={() => update('new')}
            className="text-sm px-3 py-1.5 rounded-lg border border-gray-700 text-gray-300 hover:bg-gray-800 disabled:opacity-50">Reabrir</button>
        )}
      </div>
      {f.handledBy && <p className="text-gray-600 text-[11px]">Última ação em {fmtDate(f.handledAt)} por {f.handledBy}</p>}
    </div>
  )
}

function SupportList({ feedback, onChanged }) {
  const [filter, setFilter] = useState('open')
  if (!feedback) return <div className="py-24 flex justify-center"><Spinner /></div>
  const list = feedback.filter(f => (filter === 'open' ? f.status !== 'done' : filter === 'done' ? f.status === 'done' : true))
  const open = feedback.filter(f => f.status !== 'done').length
  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-1.5">
        {[['open', `Em aberto (${open})`], ['done', 'Resolvidos'], ['all', 'Todos']].map(([id, label]) => (
          <button key={id} onClick={() => setFilter(id)} aria-pressed={filter === id}
            className={`text-sm px-3 py-1.5 rounded-lg border ${filter === id ? 'bg-green-500/15 border-green-500/40 text-green-300' : 'bg-gray-900 border-gray-800 text-gray-400 hover:text-white'}`}>
            {label}
          </button>
        ))}
      </div>
      {list.length === 0 && <p className="text-gray-500 text-sm">{filter === 'open' ? 'Nada em aberto. 🎉' : 'Nenhuma mensagem.'}</p>}
      <div className="grid lg:grid-cols-2 gap-3">
        {list.map(f => <SupportItem key={`${f.id}-${f.status}`} f={f} onChanged={onChanged} />)}
      </div>
    </div>
  )
}

const NAV = [
  { id: 'overview', label: 'Visão geral', icon: '◧' },
  { id: 'families', label: 'Famílias', icon: '⌂' },
  { id: 'nofamily', label: 'Sem família', icon: '◌' },
  { id: 'feedback', label: 'Suporte', icon: '✉' },
]

export default function AdminPanel({ user, onSignOut }) {
  const [tab, setTab] = useState('overview')
  const [data, setData] = useState(null)
  const [feedback, setFeedback] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState({ key: 'lastSeen', dir: 'desc' })
  const [open, setOpen] = useState(null)

  const load = useCallback(() => {
    setLoading(true)
    setError('')
    adminApi('overview')
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])
  useEffect(load, [load])

  useEffect(() => {
    if (tab !== 'feedback' || feedback) return
    adminApi('feedback').then(r => setFeedback(r.feedback)).catch(e => setError(e.message))
  }, [tab, feedback])

  const families = useMemo(() => {
    const q = search.trim().toLowerCase()
    let list = data?.families || []
    if (q) list = list.filter(f => [f.name, f.owner?.name, f.owner?.email, f.code].some(v => String(v || '').toLowerCase().includes(q)))
    const val = f => (sort.key === 'owner' ? f.owner?.email || '' : sort.key === 'plan' ? f.plan?.name || '' : f[sort.key] ?? '')
    return [...list].sort((a, b) => {
      const x = val(a), y = val(b)
      const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y))
      return sort.dir === 'desc' ? -c : c
    })
  }, [data, search, sort])

  const k = data?.kpis
  const counts = { families: k?.families, nofamily: k?.usersNoFamily, feedback: k?.feedbackOpen ?? k?.feedback }
  const title = NAV.find(n => n.id === tab)?.label

  return (
    <div className="min-h-svh bg-gray-950 text-gray-200 md:flex">
      {/* Menu lateral (no celular vira abas no topo) */}
      <aside className="md:w-60 md:h-svh md:sticky md:top-0 md:border-r border-gray-800 bg-gray-900/60 flex md:flex-col">
        <div className="hidden md:flex items-center gap-2.5 px-5 py-5 border-b border-gray-800">
          <img src="/favicon.svg" alt="" className="w-8 h-8" />
          <div>
            <p className="text-white font-semibold leading-tight">Onlist</p>
            <p className="text-gray-500 text-xs">Painel administrativo</p>
          </div>
        </div>
        <nav className="flex md:flex-col gap-1 p-2 md:p-3 overflow-x-auto flex-1">
          {NAV.map(n => (
            <button key={n.id} onClick={() => setTab(n.id)} aria-current={tab === n.id ? 'page' : undefined}
              className={`flex items-center gap-3 whitespace-nowrap px-3 py-2 rounded-lg text-sm text-left ${tab === n.id ? 'bg-green-500/15 text-green-300' : 'text-gray-400 hover:bg-gray-800 hover:text-white'}`}>
              <span className="w-4 text-center opacity-70" aria-hidden="true">{n.icon}</span>
              <span className="flex-1">{n.label}</span>
              {counts[n.id] !== undefined && <span className="text-xs text-gray-500 tabular-nums">{counts[n.id]}</span>}
            </button>
          ))}
        </nav>
        <div className="hidden md:block p-4 border-t border-gray-800">
          <p className="text-gray-300 text-xs truncate">{user.displayName || 'Admin'}</p>
          <p className="text-gray-500 text-xs truncate mb-2">{user.email}</p>
          <button onClick={onSignOut} className="text-gray-400 hover:text-white text-xs underline underline-offset-2">Sair do painel</button>
        </div>
      </aside>

      <main className="flex-1 min-w-0 px-4 md:px-8 py-6 max-w-6xl">
        <div className="flex items-center justify-between gap-3 mb-6">
          <div>
            <h1 className="text-white text-2xl font-semibold">{title}</h1>
            {data && <p className="text-gray-500 text-xs mt-0.5">Atualizado {new Date(data.generatedAt).toLocaleString('pt-BR')}</p>}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={load} disabled={loading}
              className="text-gray-200 text-sm border border-gray-700 bg-gray-900 hover:bg-gray-800 px-3 py-1.5 rounded-lg disabled:opacity-50">
              {loading ? 'Atualizando...' : 'Atualizar'}
            </button>
            <button onClick={onSignOut} className="md:hidden text-gray-400 text-sm px-2">Sair</button>
          </div>
        </div>

        {error && <p className="text-red-300 text-sm bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-2.5 mb-4">{error}</p>}
        {!data && !error && <div className="py-32 flex justify-center"><Spinner /></div>}

        {data && tab === 'overview' && (
          <div className="flex flex-col gap-6">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Tile label="Usuários" value={k.users} hint={`${k.usersNoFamily} sem família`} />
              <Tile label="Famílias" value={k.families} hint={`${k.familiesWithPurchase} já fizeram compra`} />
              <Tile label="Famílias ativas (7 dias)" value={k.active7} hint={`${k.active30} nos últimos 30 dias`} />
              <Tile label="Compras (30 dias)" value={k.purchases30} />
              <Tile label="Pagantes" value={k.paying} hint={`${k.founders ?? 0} fundadores · ${k.premium ?? 0} premium · ${k.basic ?? 0} básico`} />
              <Tile label="Receita mensal" value={fmtMoney(k.mrr)} hint="planos ativos · anual ÷ 12" />
              <Tile label="Suporte em aberto" value={k.feedbackOpen ?? k.feedback} hint={`${k.feedback} mensagens no total`} />
            </div>
            <div className="grid lg:grid-cols-[3fr_2fr] gap-3">
              <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
                <h2 className="text-white font-medium mb-1">Funil das famílias</h2>
                <p className="text-gray-500 text-xs mb-4">% em relação à etapa anterior</p>
                <Funnel steps={[
                  { label: 'Criadas', value: k.families },
                  { label: 'Fizeram a 1ª compra', value: k.familiesWithPurchase },
                  { label: 'Compraram em 30 dias', value: k.familiesBuying30 ?? 0 },
                  { label: 'Pagantes', value: k.paying },
                ]} />
              </div>
              <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
                <h2 className="text-white font-medium mb-3">Mais ativas agora</h2>
                <div className="flex flex-col divide-y divide-gray-800">
                  {data.families.slice(0, 6).map(f => (
                    <button key={f.id} onClick={() => setOpen(f.id)} className="flex items-center justify-between gap-3 py-2 text-left hover:bg-gray-800/40 -mx-2 px-2 rounded">
                      <span className="min-w-0">
                        <span className="text-gray-200 text-sm block truncate">{f.name}</span>
                        <span className="text-gray-500 text-xs">{f.purchases30} compras em 30 dias</span>
                      </span>
                      <span className="text-gray-500 text-xs flex-shrink-0">{ago(f.lastSeen)}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {data && tab === 'families' && (
          <div className="flex flex-col gap-3">
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por família, dono, e-mail ou código"
              className="w-full max-w-md bg-gray-900 text-white rounded-lg px-3 h-10 text-sm outline-none border border-gray-800 focus:border-green-500" />
            <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-gray-500 text-xs text-left border-b border-gray-800">
                  <tr>
                    <SortTh id="name" sort={sort} setSort={setSort}>Família</SortTh>
                    <SortTh id="owner" sort={sort} setSort={setSort}>Dono</SortTh>
                    <SortTh id="members" sort={sort} setSort={setSort} className="text-right">Pessoas</SortTh>
                    <SortTh id="purchases" sort={sort} setSort={setSort} className="text-right">Compras</SortTh>
                    <SortTh id="purchases30" sort={sort} setSort={setSort} className="text-right">30 dias</SortTh>
                    <SortTh id="lastSeen" sort={sort} setSort={setSort}>Última atividade</SortTh>
                    <SortTh id="plan" sort={sort} setSort={setSort}>Plano</SortTh>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {families.length === 0 && <tr><td colSpan={7} className="px-4 py-6 text-gray-500">Nenhuma família.</td></tr>}
                  {families.map(f => (
                    <tr key={f.id} onClick={() => setOpen(f.id)} className="hover:bg-gray-800/50 cursor-pointer">
                      <td className="px-4 py-3">
                        <p className="text-white">{f.name}</p>
                        <p className="text-gray-600 text-xs">desde {fmtDate(f.createdAt)}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-gray-200">{f.owner?.name || '—'}</p>
                        <p className="text-gray-500 text-xs">{f.owner?.email || '—'}</p>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">{f.members}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{f.purchases}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{f.purchases30}</td>
                      <td className="px-4 py-3 text-gray-400 whitespace-nowrap">{ago(f.lastSeen)}</td>
                      <td className="px-4 py-3"><PlanBadge plan={f.plan} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {data && tab === 'nofamily' && (
          <div className="flex flex-col gap-3">
            <p className="text-gray-500 text-sm">Entraram com o Google mas não criaram nem entraram em uma família. Vale chamar no WhatsApp.</p>
            <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-gray-500 text-xs text-left border-b border-gray-800">
                  <tr><th className="font-medium px-4 py-2.5">Nome</th><th className="font-medium px-4 py-2.5">E-mail</th><th className="font-medium px-4 py-2.5">Cadastro</th><th className="font-medium px-4 py-2.5">Último acesso</th></tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {data.usersNoFamily.length === 0 && <tr><td colSpan={4} className="px-4 py-6 text-gray-500">Ninguém. 🎉</td></tr>}
                  {data.usersNoFamily.map(u => (
                    <tr key={u.uid}>
                      <td className="px-4 py-3 text-white">{u.name || 'Sem nome'}</td>
                      <td className="px-4 py-3 text-gray-300 select-all">{u.email || u.uid}</td>
                      <td className="px-4 py-3 text-gray-400">{fmtDate(u.createdAt)}</td>
                      <td className="px-4 py-3 text-gray-400">{ago(u.lastSignIn)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === 'feedback' && <SupportList feedback={feedback} onChanged={() => { setFeedback(null); load() }} />}
      </main>

      {open && <FamilyDrawer familyId={open} onClose={() => setOpen(null)} onChanged={load} />}
    </div>
  )
}
