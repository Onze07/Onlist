import { useEffect, useRef, useState } from 'react'
import {
  collection, onSnapshot, addDoc, updateDoc, deleteDoc,
  doc, setDoc, serverTimestamp, getDocs, query, orderBy, arrayUnion
} from 'firebase/firestore'
import { db } from '../firebase'
import { commitInChunks, localDate, queueWrite } from '../lib/firestore'
import { useFamily } from '../context/FamilyContext'
import { useAuth } from '../context/AuthContext'
import ItemForm from '../components/ItemForm'
import ListManager from '../components/ListManager'
import MoneyInput from '../components/MoneyInput'
import CompareMarkets from '../components/CompareMarkets'
import PresenceBanner from '../components/PresenceBanner'
import NotifySheet from '../components/NotifySheet'
import NfceReader from '../components/NfceReader'
import { sendNotify } from '../lib/push'
import { useOnline, useWriteErrors } from '../lib/useSync'
import { usePresence } from '../lib/usePresence'
import { cheapest } from '../lib/prices'
import { IconChevronDown, IconCheck, IconPlus, IconX, IconBell, IconScale, IconUndo, IconTrash } from '../components/Icon'
import ActionChip from '../components/ActionChip'

const CATEGORY_ORDER = ['Hortifruti', 'Carne', 'Laticínios', 'Mercearia', 'Padaria', 'Limpeza', 'Higiene', 'Bebidas', 'Outros']

function fmt(n) {
  return (n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export default function ActiveList({ pendingAddFromCatalog, onCatalogItemHandled }) {
  const { familyId, userDoc } = useFamily()
  const user = useAuth()
  const decimals = userDoc?.priceDecimals === 3 ? 3 : 2
  const [showCompare, setShowCompare] = useState(false)
  const [listId, setListId] = useState(null)
  const [listName, setListName] = useState('')
  const [entries, setEntries] = useState([])
  const [catalog, setCatalog] = useState({})
  const [showForm, setShowForm] = useState(false)
  const [editItem, setEditItem] = useState(null)
  const [prefillItem, setPrefillItem] = useState(null)
  const [showChecked, setShowChecked] = useState(true)
  const [showManager, setShowManager] = useState(false)
  const [finishing, setFinishing] = useState(false)
  const [mercado, setMercado] = useState('')
  const [mercadoOptions, setMercadoOptions] = useState([])
  const [mercadoFocused, setMercadoFocused] = useState(false)
  const [pricePrompt, setPricePrompt] = useState(null) // entry awaiting price before check
  const [saving, setSaving] = useState(false)
  const [pendingSync, setPendingSync] = useState(false)
  const online = useOnline()
  const writeError = useWriteErrors()
  const othersShopping = usePresence(familyId, user?.uid)
  const presenceWrittenAt = useRef(0)
  const [showNotify, setShowNotify] = useState(false)
  const [showNfce, setShowNfce] = useState(false)
  const [notice, setNotice] = useState('')
  const finishingRef = useRef(false)

  // Load last list: usa a salva neste aparelho, senão a primeira ativa, senão cria a padrão
  useEffect(() => {
    if (!familyId) return
    let cancelled = false
    const key = `lastList_${familyId}`

    async function init() {
      let saved = null
      try { saved = JSON.parse(localStorage.getItem(key)) } catch { /* ignora */ }
      const snap = await getDocs(query(collection(db, 'families', familyId, 'lists'), orderBy('createdAt', 'asc')))
      const active = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(l => l.status !== 'archived')
      let chosen = (saved && active.find(l => l.id === saved.id)) || active[0]
      if (!chosen) {
        // ID fixo: dois aparelhos abrindo ao mesmo tempo não duplicam a lista
        chosen = { id: 'default', name: 'Compras gerais' }
        await setDoc(doc(db, 'families', familyId, 'lists', 'default'), {
          name: chosen.name, status: 'active', createdAt: serverTimestamp(),
        })
      }
      if (cancelled) return
      setListId(chosen.id); setListName(chosen.name)
      try { localStorage.setItem(key, JSON.stringify({ id: chosen.id, name: chosen.name })) } catch { /* ignora */ }
    }

    init().catch(e => console.error('Erro ao carregar lista', e))
    return () => { cancelled = true }
  }, [familyId])

  // Mantém o nome atualizado se a lista for renomeada em outro aparelho
  useEffect(() => {
    if (!familyId || !listId) return
    return onSnapshot(doc(db, 'families', familyId, 'lists', listId), snap => {
      if (snap.exists()) setListName(snap.data().name)
    })
  }, [familyId, listId])

  // Subscribe entries
  useEffect(() => {
    if (!familyId || !listId) return
    return onSnapshot(collection(db, 'families', familyId, 'lists', listId, 'entries'), { includeMetadataChanges: true }, snap => {
      setEntries(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      setPendingSync(snap.metadata.hasPendingWrites)
    })
  }, [familyId, listId])

  // Load catalog for price signals
  useEffect(() => {
    if (!familyId) return
    return onSnapshot(collection(db, 'families', familyId, 'catalog'), snap => {
      const map = {}
      snap.docs.forEach(d => { map[d.id] = d.data() })
      setCatalog(map)
    })
  }, [familyId])

  // Load mercado options
  useEffect(() => {
    if (!familyId) return
    getDocs(collection(db, 'families', familyId, 'mercados')).then(snap => {
      setMercadoOptions(snap.docs.map(d => d.data().name))
    })
  }, [familyId])

  // Handle add from catalog
  useEffect(() => {
    if (!pendingAddFromCatalog) return
    setPrefillItem({
      name: pendingAddFromCatalog.name,
      category: pendingAddFromCatalog.category || 'Mercearia',
      unit: pendingAddFromCatalog.unit || 'un',
      pricePerUnit: pendingAddFromCatalog.lastPrice || 0,
      obs: '', qty: 1,
      totalPrice: pendingAddFromCatalog.lastPrice || 0,
    })
    setShowForm(true)
    onCatalogItemHandled()
  }, [pendingAddFromCatalog, onCatalogItemHandled])

  function selectList(id, name) {
    setListId(id); setListName(name)
    try { localStorage.setItem(`lastList_${familyId}`, JSON.stringify({ id, name })) } catch { /* ignora */ }
  }

  function entryRef(id) {
    return doc(db, 'families', familyId, 'lists', listId, 'entries', id)
  }

  // Marcar itens = está no mercado: avisa a família (no máximo 1 gravação a cada 2 min)
  function markShopping() {
    const now = Date.now()
    if (now - presenceWrittenAt.current < 2 * 60 * 1000) return
    const first = presenceWrittenAt.current === 0
    presenceWrittenAt.current = now
    queueWrite(setDoc(doc(db, 'families', familyId, 'presence', user.uid), {
      name: user.displayName || user.email,
      listId, listName: listName || null,
      ...(first ? { startedAt: serverTimestamp() } : {}),
      updatedAt: serverTimestamp(),
    }, { merge: true }), 'avisar a família')
    // Primeiro item marcado: avisa no celular dos outros (o servidor limita a 1 aviso a cada 30 min)
    if (first && navigator.onLine) {
      sendNotify({ familyId, type: 'shopping', listName }).catch(() => {})
    }
  }

  function clearShopping() {
    presenceWrittenAt.current = 0
    queueWrite(deleteDoc(doc(db, 'families', familyId, 'presence', user.uid)), 'atualizar presença')
  }

  const pending = entries.filter(e => !e.checked)
  const checked = entries.filter(e => e.checked)
  const totalPending = pending.reduce((s, e) => s + (e.totalPrice || 0), 0)
  const totalChecked = checked.reduce((s, e) => s + (e.totalPrice || 0), 0)
  const totalAll = entries.reduce((s, e) => s + (e.totalPrice || 0), 0)

  function groupBy(items) {
    const groups = {}
    for (const item of items) {
      const cat = item.category || 'Outros'
      if (!groups[cat]) groups[cat] = []
      groups[cat].push(item)
    }
    return CATEGORY_ORDER.filter(c => groups[c]).map(c => ({ cat: c, items: groups[c] }))
  }

  function doCheck(entry, priceOverride) {
    const updates = { checked: true, checkedBy: user.uid, checkedAt: serverTimestamp() }
    if (priceOverride > 0) {
      const qty = Number(entry.qty) || 1
      updates.pricePerUnit = priceOverride
      updates.totalPrice = Math.round(priceOverride * qty * 100) / 100
    }
    queueWrite(updateDoc(entryRef(entry.id), updates), 'marcar item')
    markShopping()
  }

  function toggleCheck(entry) {
    if (entry.checked) {
      // uncheck — no prompt needed
      queueWrite(updateDoc(entryRef(entry.id), {
        checked: false, checkedBy: user.uid, checkedAt: serverTimestamp(),
      }), 'desmarcar item')
      return
    }
    if (!Number(entry.pricePerUnit)) {
      setPricePrompt(entry)
      return
    }
    doCheck(entry, 0)
  }

  function uncheckAll() {
    if (!confirm(`Desmarcar os ${checked.length} itens do carrinho?`)) return
    queueWrite(commitInChunks(checked.map(e => b => b.update(entryRef(e.id), { checked: false }))), 'desmarcar itens')
  }

  function clearPending() {
    if (!confirm(`Remover os ${pending.length} itens pendentes?`)) return
    queueWrite(commitInChunks(pending.map(e => b => b.delete(entryRef(e.id)))), 'limpar itens')
  }

  // Não espera o servidor: offline a gravação fica na fila e a tela fecha na hora
  function handleSave(data, { inCart = false } = {}) {
    const col = collection(db, 'families', familyId, 'lists', listId, 'entries')
    if (editItem) {
      queueWrite(updateDoc(entryRef(editItem.id), data), 'salvar item')
    } else {
      // "Já está no carrinho": entra direto em "Peguei"
      const checkedFields = inCart ? { checked: true, checkedBy: user.uid, checkedAt: serverTimestamp() } : { checked: false }
      queueWrite(addDoc(col, { ...data, ...checkedFields, createdAt: serverTimestamp() }), 'adicionar item')
      if (inCart) markShopping()
    }
    // Só atualiza o último preço; o histórico é gravado ao finalizar a compra (preço pago + mercado)
    if (data.pricePerUnit > 0) {
      queueWrite(setDoc(doc(db, 'families', familyId, 'catalog', data.name.toLowerCase()), {
        name: data.name, category: data.category, unit: data.unit,
        lastPrice: data.pricePerUnit,
      }, { merge: true }), 'atualizar catálogo')
    }
    setShowForm(false); setEditItem(null); setPrefillItem(null)
  }

  function handleDelete(id) {
    queueWrite(deleteDoc(entryRef(id)), 'remover item')
  }

  function finishShopping() {
    // Evita registrar a mesma compra duas vezes com toque duplo
    if (finishingRef.current) return
    finishingRef.current = true
    setTimeout(() => { finishingRef.current = false }, 1500)
    setSaving(true)
    const mercadoName = mercado.trim() || 'Não informado'
    const today = localDate()
    const historyRef = doc(collection(db, 'families', familyId, 'history'))
    const ops = [
      b => b.set(historyRef, {
        createdAt: serverTimestamp(),
        mercado: mercadoName,
        listName,
        finishedBy: user.uid,
        total: totalChecked,
        items: checked.map(e => ({ name: e.name, qty: e.qty, unit: e.unit, totalPrice: e.totalPrice, pricePerUnit: e.pricePerUnit, category: e.category })),
      }),
    ]
    if (mercado.trim()) {
      ops.push(b => b.set(doc(db, 'families', familyId, 'mercados', mercado.trim().toLowerCase()), { name: mercado.trim() }))
    }
    // Histórico de preço com arrayUnion: duas pessoas finalizando offline não apagam o registro uma da outra.
    // Repetições antigas são filtradas na exibição (normalizePriceHistory).
    for (const e of checked) {
      if (Number(e.pricePerUnit) > 0) {
        const key = e.name.toLowerCase()
        ops.push(b => b.set(doc(db, 'families', familyId, 'catalog', key), {
          name: e.name, category: e.category, unit: e.unit,
          lastPrice: e.pricePerUnit,
          priceHistory: arrayUnion({ price: Number(e.pricePerUnit), date: today, mercado: mercadoName }),
        }, { merge: true }))
      }
    }
    for (const e of checked) {
      ops.push(b => b.delete(entryRef(e.id)))
    }
    // Enfileira tudo de uma vez: offline a compra fica salva e sobe quando a conexão voltar
    queueWrite(commitInChunks(ops), 'registrar compra')
    setFinishing(false); setMercado(''); setSaving(false)
    clearShopping()
  }

  const mercadoFiltered = mercadoOptions.filter(m => m.toLowerCase().includes(mercado.toLowerCase()))

  const othersOnList = othersShopping.filter(p => p.listId === listId)

  const finishModal = finishing && (
      <div className="fixed inset-0 bg-black/70 z-50 flex items-end">
        <div className="bg-gray-900 rounded-t-3xl w-full p-6 pb-10">
          <div className="w-10 h-1 bg-gray-700 rounded-full mx-auto mb-6" />
          <h2 className="text-white text-lg font-semibold mb-1">Finalizar compra</h2>
          <p className="text-gray-400 text-sm mb-4">{checked.length} itens · {fmt(totalChecked)}</p>
          <button onClick={() => { setFinishing(false); setShowNfce(true) }}
            className="w-full bg-gray-800 border border-green-500/40 text-green-300 font-semibold py-3 rounded-xl text-sm mb-4 flex items-center justify-center gap-2">
            📷 Ler nota fiscal
          </button>
          <p className="text-gray-600 text-xs text-center mb-3">ou registre manualmente</p>
          {othersOnList.length > 0 && (
            <p className="bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs rounded-xl px-3 py-2 mb-4">
              {othersOnList.map(p => p.name?.split(' ')[0]).join(', ')} também está marcando itens desta lista agora.
              Combinem quem finaliza, para a compra não ser registrada duas vezes.
            </p>
          )}
          <div className="relative mb-5">
            <input value={mercado} onChange={e => setMercado(e.target.value)}
              onFocus={() => setMercadoFocused(true)} onBlur={() => setTimeout(() => setMercadoFocused(false), 150)}
              placeholder="Qual mercado? (opcional)"
              className="w-full bg-gray-800 text-white px-4 py-3 rounded-xl outline-none text-sm" />
            {mercadoFocused && mercadoFiltered.length > 0 && (
              <div className="absolute top-full left-0 right-0 bg-gray-800 rounded-xl mt-1 overflow-hidden z-10 shadow-xl border border-gray-700">
                {mercadoFiltered.map(s => (
                  <button key={s} onMouseDown={() => setMercado(s)}
                    className="w-full text-left px-4 py-3 text-white text-sm border-b border-gray-700 last:border-0 hover:bg-gray-700">
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="flex gap-3">
            <button onClick={() => setFinishing(false)} className="flex-1 bg-gray-800 text-white font-medium py-3.5 rounded-xl text-sm">Cancelar</button>
            <button onClick={finishShopping} disabled={saving} className="flex-1 bg-green-500 disabled:opacity-50 text-white font-semibold py-3.5 rounded-xl text-sm">
              {saving ? 'Registrando...' : 'Registrar'}
            </button>
          </div>
        </div>
      </div>
  )

  const overlays = (
    <>
      {finishModal}
      {pricePrompt && (
        <PricePromptModal
          decimals={decimals}
          entry={pricePrompt}
          onConfirm={(price) => { doCheck(pricePrompt, price); setPricePrompt(null) }}
          onSkip={() => { doCheck(pricePrompt, 0); setPricePrompt(null) }}
          onCancel={() => setPricePrompt(null)}
        />
      )}
      {showForm && (
        <ItemForm
          initial={prefillItem || editItem}
          onDelete={editItem ? () => { handleDelete(editItem.id); setShowForm(false); setEditItem(null) } : undefined}
          onSave={handleSave}
          onCancel={() => { setShowForm(false); setEditItem(null); setPrefillItem(null) }}
        />
      )}
      {showNfce && (
        <NfceReader
          familyId={familyId}
          user={user}
          catalog={catalog}
          entries={entries.map(e => ({ ...e, listId }))}
          listName={listName}
          mercadoOptions={mercadoOptions}
          onClose={() => setShowNfce(false)}
          onSaved={({ removed, leftChecked, reconciled }) => {
            setShowNfce(false)
            clearShopping()
            setNotice(reconciled
              ? 'Compra conciliada com a nota fiscal. Valores atualizados, sem duplicar.'
              : `Compra registrada pela nota. ${removed} ${removed === 1 ? 'item saiu' : 'itens saíram'} da lista${leftChecked ? `; ${leftChecked} marcado(s) não estavam na nota e continuam na lista` : ''}.`)
            setTimeout(() => setNotice(''), 7000)
          }}
        />
      )}
      {notice && (
        <div className="fixed top-3 inset-x-3 z-[60] max-w-lg mx-auto bg-green-600/95 text-white text-sm px-4 py-2.5 rounded-xl shadow-xl" onClick={() => setNotice('')}>
          {notice}
        </div>
      )}
      {writeError && (
        <div className="fixed top-3 inset-x-3 z-[60] max-w-lg mx-auto bg-red-500/90 text-white text-sm px-4 py-2.5 rounded-xl shadow-xl">
          Não foi possível {writeError.what}. Tente de novo.
        </div>
      )}
    </>
  )

  return (
    <div className="flex flex-col min-h-svh bg-gray-900">
      {/* Header */}
      <div className="px-4 pt-12 pb-3 border-b border-gray-800">
        <button onClick={() => setShowManager(true)} aria-label="Trocar de lista"
          className="inline-flex items-center gap-2 mb-1.5 -ml-1 pl-3 pr-2.5 py-1 rounded-full bg-gray-800/70 border border-gray-700 active:bg-gray-700">
          <h1 className="text-white text-lg font-semibold">{listName || '...'}</h1>
          <span className="text-gray-400"><IconChevronDown size={16} /></span>
        </button>
        <div className="flex gap-3 text-xs text-gray-500 items-center">
          <span>{pending.length} pendentes · {fmt(totalPending)}</span>
          <span>·</span>
          <span>Total {fmt(totalAll)}</span>
          {!online
            ? <span className="ml-auto text-amber-400">● offline · salvo no aparelho</span>
            : pendingSync && <span className="ml-auto text-blue-300">sincronizando…</span>}
        </div>
      </div>
      <PresenceBanner people={othersShopping} />

      {/* Ações: ícones conhecidos sem texto, para caber tudo numa linha */}
      {(pending.length > 0 || checked.length > 0) && (
        <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-800">
          {entries.length > 0 && (
            <ActionChip icon={<IconScale size={15} />} onClick={() => setShowCompare(true)}>Comparar preços</ActionChip>
          )}
          {pending.length > 0 && (
            <ActionChip icon={<IconBell size={16} />} label="Avisar alguém" onClick={() => setShowNotify(true)} />
          )}
          <span className="flex-1" />
          {checked.length > 0 && (
            <ActionChip icon={<IconUndo size={16} />} label="Desmarcar tudo" onClick={uncheckAll} />
          )}
          {pending.length > 0 && (
            <ActionChip icon={<IconTrash size={16} />} label="Limpar pendentes" tone="danger" onClick={clearPending} />
          )}
        </div>
      )}

      {/* List */}
      <div className="flex-1 overflow-y-auto pb-28">
        {entries.length === 0 && (
          <div className="text-center text-gray-600 mt-24">
            <div className="text-4xl mb-3">🛒</div>
            <p className="text-sm">Nenhum item na lista</p>
          </div>
        )}

        {groupBy(pending).map(({ cat, items }) => (
          <div key={cat}>
            <p className="text-gray-600 text-xs uppercase tracking-wider px-4 pt-4 pb-1">{cat}</p>
            {items.map((entry, i) => {
              const catKey = entry.name.toLowerCase()
              const catalogItem = catalog[catKey]
              const lastPrice = catalogItem?.lastPrice
              const priceDiff = lastPrice && entry.pricePerUnit > 0 && Math.abs(entry.pricePerUnit - lastPrice) > 0.01
                ? entry.pricePerUnit - lastPrice : null
              return (
                <EntryRow key={entry.id} entry={entry} priceDiff={priceDiff}
                  cheaper={cheaperHint(entry, catalogItem)}
                  isLast={i === items.length - 1}
                  onCheck={() => toggleCheck(entry)}
                  onEdit={() => { setEditItem(entry); setPrefillItem(null); setShowForm(true) }}
                  onDelete={() => handleDelete(entry.id)}
                />
              )
            })}
          </div>
        ))}

        {checked.length > 0 && (
          <div>
            <button onClick={() => setShowChecked(v => !v)}
              className="flex items-center justify-between w-full px-4 pt-4 pb-1 text-gray-600">
              <span className="text-xs uppercase tracking-wider">Peguei ({checked.length}) · {fmt(totalChecked)}</span>
              <span className="text-xs">{showChecked ? '▼' : '▶'}</span>
            </button>
            {showChecked && groupBy(checked).map(({ cat, items }) => (
              <div key={cat} className="opacity-50">
                <p className="text-gray-600 text-xs uppercase tracking-wider px-4 pt-2 pb-1">{cat}</p>
                {items.map((entry, i) => (
                  <EntryRow key={entry.id} entry={entry} checked
                    isLast={i === items.length - 1}
                    onCheck={() => toggleCheck(entry)}
                    onEdit={() => { setEditItem(entry); setPrefillItem(null); setShowForm(true) }}
                    onDelete={() => handleDelete(entry.id)}
                  />
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Ações principais: adicionar e, quando há itens no carrinho, finalizar */}
      <div className="fixed bottom-16 left-0 right-0 max-w-lg mx-auto px-4 pb-2 flex gap-2">
        <button onClick={() => { setEditItem(null); setPrefillItem(null); setShowForm(true) }}
          className={`${checked.length > 0 ? 'flex-1' : 'w-full'} bg-gray-800 border border-gray-700 text-gray-200 font-medium py-3.5 rounded-2xl flex items-center justify-center gap-2 shadow-xl text-sm active:bg-gray-700`}>
          <IconPlus /> {checked.length > 0 ? 'Item' : 'Adicionar item'}
        </button>
        {checked.length > 0 && (
          <button onClick={() => setFinishing(true)}
            className="flex-[2] bg-green-500 text-white font-semibold py-3.5 rounded-2xl shadow-xl text-sm active:bg-green-600">
            Finalizar · {fmt(totalChecked)}
          </button>
        )}
      </div>

      {overlays}

      {showNotify && (
        <NotifySheet listName={listName} pendingCount={pending.length} onClose={() => setShowNotify(false)} />
      )}

      {showCompare && (
        <CompareMarkets entries={entries} catalog={catalog} onClose={() => setShowCompare(false)} />
      )}

      {showManager && (
        <ListManager activeListId={listId} onSelect={selectList} onClose={() => setShowManager(false)} />
      )}

    </div>
  )
}

// Outro mercado mais barato que o preço anotado (ou o melhor preço, se o item não tem preço)
function cheaperHint(entry, catalogItem) {
  const best = cheapest(catalogItem?.priceHistory)
  if (!best) return null
  const current = Number(entry.pricePerUnit) || 0
  if (current > 0 && best.price >= current - 0.005) return null
  return best
}

function EntryRow({ entry, onCheck, onEdit, onDelete, isLast, checked: isChecked, priceDiff, cheaper }) {
  return (
    <div className={`flex items-center gap-3 px-4 py-2.5 ${!isLast ? 'border-b border-gray-800/60' : ''}`}>
      <button onClick={onCheck}
        className={`w-5 h-5 rounded-full border flex items-center justify-center flex-shrink-0 transition-all
          ${isChecked ? 'bg-green-500 border-green-500' : 'border-gray-600'}`}>
        {isChecked && <IconCheck size={10} />}
      </button>

      <div className="flex-1 min-w-0 cursor-pointer" onClick={onEdit}>
        <span className={`text-sm ${isChecked ? 'line-through text-gray-600' : 'text-white'}`}>{entry.name}</span>
        {entry.obs && <span className="text-gray-600 text-xs ml-2">{entry.obs}</span>}
        <div className="text-gray-600 text-xs mt-0.5">
          {entry.qty} {entry.unit}
          {Number(entry.pricePerUnit) > 0 && ` · ${Number(entry.pricePerUnit).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}/${entry.unit}`}
          {priceDiff !== null && priceDiff !== undefined && (
            <span className={`ml-1 ${priceDiff > 0 ? 'text-red-400' : 'text-green-400'}`}>
              ({priceDiff > 0 ? '+' : ''}{Number(priceDiff).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })})
            </span>
          )}
        </div>
        {cheaper && (
          <div className="text-[11px] text-emerald-400/80 mt-0.5 truncate">
            {Number(cheaper.price).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} no {cheaper.mercado}
          </div>
        )}
      </div>

      <div className="flex items-center gap-3 flex-shrink-0">
        {Number(entry.totalPrice) > 0 && (
          <span className={`text-sm font-medium ${isChecked ? 'text-gray-600' : 'text-gray-300'}`}>
            {Number(entry.totalPrice).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
          </span>
        )}
        <button onClick={onDelete} className="text-gray-500 hover:text-gray-300 p-1">
          <IconX size={14} />
        </button>
      </div>
    </div>
  )
}

function PricePromptModal({ entry, decimals, onConfirm, onSkip, onCancel }) {
  const [price, setPrice] = useState(0)

  return (
    <div className="fixed inset-0 bg-black/75 z-50 flex items-end" onClick={onCancel}>
      <div className="bg-gray-900 rounded-t-3xl w-full max-w-lg mx-auto p-6 pb-10 border-t border-gray-800"
        onClick={e => e.stopPropagation()}>
        <div className="w-10 h-1 bg-gray-700 rounded-full mx-auto mb-5" />
        <p className="text-gray-400 text-xs uppercase tracking-wider mb-1">Item sem valor</p>
        <p className="text-white font-semibold text-lg mb-1">{entry.name}</p>
        <p className="text-gray-500 text-sm mb-5">
          {entry.qty} {entry.unit} · Qual o preço encontrado?
        </p>

        <div className="flex items-center bg-gray-800 rounded-xl px-4 mb-5 border border-gray-700">
          <span className="text-gray-400 text-base mr-2">R$</span>
          <MoneyInput
            autoFocus
            value={price}
            onChange={setPrice}
            decimals={decimals}
            onKeyDown={e => e.key === 'Enter' && price > 0 && onConfirm(price)}
            placeholder={(0).toFixed(decimals).replace('.', ',')}
            className="flex-1 bg-transparent text-white text-xl py-4 outline-none"
          />
        </div>

        <div className="flex gap-3">
          <button onClick={onSkip}
            className="flex-1 bg-gray-800 text-gray-400 font-medium py-3.5 rounded-xl text-sm border border-gray-700">
            Marcar sem valor
          </button>
          <button
            onClick={() => price > 0 ? onConfirm(price) : onSkip()}
            className="flex-1 bg-green-500 text-white font-semibold py-3.5 rounded-xl text-sm">
            {price > 0 ? 'Confirmar' : 'Pular'}
          </button>
        </div>
      </div>
    </div>
  )
}
