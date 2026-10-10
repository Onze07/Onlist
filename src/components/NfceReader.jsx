import { useCallback, useEffect, useMemo, useState } from 'react'
import { collection, doc, getDoc, getDocs, query, serverTimestamp, Timestamp, where } from 'firebase/firestore'
import { db } from '../firebase'
import { apiPost } from '../lib/api'
import { commitInChunks, priceHistoryWrite, queueWrite } from '../lib/firestore'
import { convertForUnit, findSimilarPurchases, mapUnit, marketName, packSize, suggestTarget, UNITS, UNIT_LABELS } from '../lib/nfceMatch'
import QrScanner from './QrScanner'
import { addPendingNote, isContingencyKey, keyFromUrl, listPendingNotes, removePendingNote } from '../lib/pendingNotes'

const CATEGORIES = ['Hortifruti', 'Carne', 'Laticínios', 'Mercearia', 'Padaria', 'Limpeza', 'Higiene', 'Bebidas', 'Outros']

function fmt(n) {
  return (n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function qtyText(n) {
  return String(Math.round(n * 1000) / 1000).replace('.', ',')
}

// Leitura da NFC-e: QR code -> captcha da SEFAZ -> conferência -> registra a compra
export default function NfceReader({ familyId, user, catalog: catalogProp, entries = [], listName, mercadoOptions: marketsProp, reconcileWith = null, onClose, onSaved }) {
  const [duplicate, setDuplicate] = useState(null)
  const [similar, setSimilar] = useState([])
  const [reconcileId, setReconcileId] = useState(reconcileWith?.id || null)
  const [loadedCatalog, setLoadedCatalog] = useState(null)
  const [loadedMarkets, setLoadedMarkets] = useState([])
  const catalog = useMemo(() => catalogProp || loadedCatalog || {}, [catalogProp, loadedCatalog])
  const mercadoOptions = marketsProp || loadedMarkets
  const [step, setStep] = useState('scan')
  const [link, setLink] = useState('')
  const [error, setError] = useState('')
  const [captcha, setCaptcha] = useState(null)
  const [session, setSession] = useState(null)
  const [answer, setAnswer] = useState('')
  const [nota, setNota] = useState(null)
  const [rows, setRows] = useState([])
  const [mercado, setMercado] = useState('')
  const [mappings, setMappings] = useState({})
  const [lastUrl, setLastUrl] = useState('')
  // Nota que a SEFAZ ainda não mostra (ex.: contingência): oferecer "ler depois"
  const [retry, setRetry] = useState(null)
  const [pending, setPending] = useState(() => listPendingNotes(familyId))

  useEffect(() => {
    const fn = () => setPending(listPendingNotes(familyId))
    window.addEventListener('onlist:pending-notes', fn)
    return () => window.removeEventListener('onlist:pending-notes', fn)
  }, [familyId])

  function handleReadError(e, url) {
    setError(e.message)
    setRetry(e.data?.retryLater ? { url, key: e.data.key || keyFromUrl(url), contingency: !!e.data.contingency } : null)
  }

  const catalogItems = useMemo(() => Object.entries(catalog)
    .map(([id, d]) => ({ id, ...d }))
    .sort((a, b) => (a.name || '').localeCompare(b.name || '')), [catalog])

  useEffect(() => {
    if (catalogProp || !familyId) return
    getDocs(collection(db, 'families', familyId, 'catalog'))
      .then(snap => setLoadedCatalog(Object.fromEntries(snap.docs.map(d => [d.id, d.data()]))))
      .catch(() => setLoadedCatalog({}))
    getDocs(collection(db, 'families', familyId, 'mercados'))
      .then(snap => setLoadedMarkets(snap.docs.map(d => d.data().name)))
      .catch(() => {})
  }, [catalogProp, familyId])

  // Escolhas salvas em notas anteriores (código do produto -> item do catálogo)
  useEffect(() => {
    if (!familyId) return
    getDocs(collection(db, 'families', familyId, 'nfceMap'))
      .then(snap => setMappings(Object.fromEntries(snap.docs.map(d => [d.id, d.data()]))))
      .catch(() => {})
  }, [familyId])

  const start = useCallback(async (url) => {
    setError('')
    setRetry(null)
    setLastUrl(url)
    setStep('loading')
    try {
      const r = await apiPost('/api/nfce', { action: 'start', url })
      if (r.nota) return showReview(r.nota)
      setCaptcha(r.captcha); setSession(r.session); setAnswer('')
      setStep('captcha')
    } catch (e) {
      handleReadError(e, url)
      setStep('scan')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalogItems, mappings])

  async function submitCaptcha() {
    if (!answer.trim()) return
    setError('')
    setStep('loading')
    try {
      const r = await apiPost('/api/nfce', { action: 'submit', session, answer })
      if (r.nota) return showReview(r.nota)
      setCaptcha(r.captcha); setSession(r.session); setAnswer('')
      setError(r.error || 'Tente de novo')
      setStep('captcha')
    } catch (e) {
      handleReadError(e, lastUrl)
      // Sem itens na SEFAZ: volta para o início, onde dá para guardar a nota
      setStep(e.data?.retryLater || e.status === 422 ? 'scan' : 'captcha')
    }
  }

  // Mesma nota já registrada? Compra manual parecida (para conciliar)?
  async function checkExisting(n) {
    const historyCol = collection(db, 'families', familyId, 'history')
    if (n.key) {
      const same = await getDoc(doc(historyCol, n.key)).catch(() => null)
      if (same?.exists()) return { duplicate: { id: same.id, ...same.data() } }
    }
    const issued = n.issuedAt ? new Date(n.issuedAt) : new Date()
    const from = new Date(issued.getFullYear(), issued.getMonth(), issued.getDate() - 1)
    const to = new Date(issued.getFullYear(), issued.getMonth(), issued.getDate() + 2)
    const snap = await getDocs(query(historyCol, where('createdAt', '>=', Timestamp.fromDate(from)), where('createdAt', '<', Timestamp.fromDate(to)))).catch(() => null)
    const records = snap ? snap.docs.map(d => ({ id: d.id, ...d.data() })) : []
    return { similar: findSimilarPurchases(n, records) }
  }

  async function showReview(n) {
    removePendingNote(familyId, n.key || lastUrl)
    const found = await checkExisting(n)
    if (found.duplicate) {
      setDuplicate(found.duplicate)
      setStep('duplicate')
      return
    }
    setSimilar(found.similar || [])
    if (!reconcileWith && found.similar?.[0]?.strong) setReconcileId(found.similar[0].record.id)
    setNota(n)
    setMercado(marketName(n.store, mercadoOptions))
    setRows(n.items.map(item => {
      const s = suggestTarget(item, catalogItems, mappings)
      const size = packSize(item.name)
      return {
        nf: item,
        include: true,
        target: s.type === 'existing'
          ? { type: 'existing', id: s.item.id, reason: s.reason }
          : { type: 'new', name: s.name, category: 'Mercearia', unit: size ? size.unit : mapUnit(item.unit) },
        alternatives: s.alternatives || [],
      }
    }))
    setStep('review')
  }

  function updateRow(i, patch) {
    setRows(rs => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
  }

  function resolved(r) {
    if (r.target.type === 'existing') {
      const item = catalog[r.target.id] || {}
      const conv = convertForUnit(r.nf, item.unit || mapUnit(r.nf.unit))
      return { key: r.target.id, name: item.name || r.target.id, category: item.category || 'Outros', ...conv }
    }
    const name = (r.target.name || '').trim() || 'Item'
    const conv = convertForUnit(r.nf, r.target.unit)
    return { key: name.toLowerCase(), name, category: r.target.category, ...conv }
  }

  const listNames = new Set(entries.map(e => String(e.name).toLowerCase()))

  async function save() {
    setStep('saving')
    try {
      const key = nota.key
      const original = reconcileId ? (reconcileWith?.id === reconcileId ? reconcileWith : similar.find(c => c.record.id === reconcileId)?.record) : null
      const chosen = rows.filter(r => r.include).map(r => ({ r, x: resolved(r) }))
      const date = nota.issuedAt ? nota.issuedAt.slice(0, 10) : new Date().toISOString().slice(0, 10)
      const mercadoName = mercado.trim() || 'Não informado'
      const historyRef = key ? doc(db, 'families', familyId, 'history', key) : doc(collection(db, 'families', familyId, 'history'))
      const ops = []
      // Conciliação: a compra manual é substituída pela versão da nota (mesmo registro, sem duplicar)
      if (original && original.id !== historyRef.id) {
        ops.push(b => b.delete(doc(db, 'families', familyId, 'history', original.id)))
      }
      ops.push(
        b => b.set(historyRef, {
          createdAt: nota.issuedAt ? Timestamp.fromDate(new Date(nota.issuedAt)) : serverTimestamp(),
          mercado: mercadoName,
          listName: original?.listName || listName || 'Nota fiscal',
          finishedBy: original?.finishedBy || user.uid,
          ...(original ? { reconciledFrom: original.id, reconciledAt: serverTimestamp() } : {}),
          total: nota.total,
          source: 'nfce',
          nfceKey: key || null,
          cnpj: nota.cnpj || null,
          items: chosen.map(({ r, x }) => ({
            name: x.name, qty: x.qty, unit: x.unit, totalPrice: r.nf.total, pricePerUnit: x.unitPrice, category: x.category,
          })),
        }),
      )
      if (mercado.trim()) {
        ops.push(b => b.set(doc(db, 'families', familyId, 'mercados', mercadoName.toLowerCase()), { name: mercadoName }))
      }
      for (const { r, x } of chosen) {
        ops.push(b => b.set(doc(db, 'families', familyId, 'catalog', x.key), {
          name: x.name, category: x.category, unit: x.unit,
          lastPrice: x.unitPrice,
          priceHistory: priceHistoryWrite(catalog[x.key]?.priceHistory, { price: x.unitPrice, date, mercado: mercadoName }),
        }, { merge: true }))
        if (r.nf.code) {
          ops.push(b => b.set(doc(db, 'families', familyId, 'nfceMap', r.nf.code), { catalogId: x.key, nfName: r.nf.name }))
        }
      }
      // Itens da lista que vieram na nota saem da lista (na conciliação, a compra já tinha sido finalizada)
      const bought = new Set(chosen.map(({ x }) => x.key))
      const removed = original ? [] : entries.filter(e => bought.has(String(e.name).toLowerCase()))
      removed.forEach(e => ops.push(b => b.delete(doc(db, 'families', familyId, 'lists', e.listId, 'entries', e.id))))
      queueWrite(commitInChunks(ops), 'registrar a nota')
      const leftChecked = original ? 0 : entries.filter(e => e.checked && !bought.has(String(e.name).toLowerCase())).length
      onSaved?.({ removed: removed.length, leftChecked, reconciled: !!original })
    } catch (e) {
      alert('Erro ao registrar: ' + e.message)
      setStep('review')
    }
  }

  const includedTotal = rows.filter(r => r.include).reduce((s, r) => s + r.nf.total, 0)

  return (
    <div className="fixed inset-0 z-50 bg-gray-900 flex flex-col">
      <div className="flex items-center justify-between px-4 pb-3 border-b border-gray-800" style={{ paddingTop: 'max(14px, env(safe-area-inset-top))' }}>
        <button onClick={onClose} className="text-gray-400 text-sm">Cancelar</button>
        <h2 className="text-white font-semibold">Nota fiscal</h2>
        <span className="w-16" />
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {error && !retry && <p className="text-red-300 text-sm bg-red-500/10 rounded-xl px-3 py-2 mb-3">{error}</p>}
        {error && retry && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl px-3 py-3 mb-3">
            <p className="text-amber-200 text-sm font-medium mb-1">{retry.contingency ? '⏳ Nota em contingência' : '⏳ Nota ainda não disponível'}</p>
            <p className="text-amber-100/80 text-sm">{error}</p>
            <div className="flex gap-2 mt-3">
              <button onClick={() => { addPendingNote(familyId, retry); setRetry(null); setError('') }}
                className="flex-1 bg-amber-500 text-gray-900 font-semibold text-sm py-2.5 rounded-lg">Guardar para ler depois</button>
              <button onClick={() => start(retry.url)}
                className="px-4 bg-gray-800 border border-gray-700 text-gray-200 text-sm py-2.5 rounded-lg">Tentar agora</button>
            </div>
          </div>
        )}

        {step === 'scan' && (
          <div className="flex flex-col gap-4">
            {pending.length > 0 && (
              <div className="bg-gray-800/60 border border-gray-700 rounded-xl">
                <p className="text-gray-400 text-xs px-3 pt-2.5 pb-1">Notas guardadas para ler depois</p>
                {pending.map(n => (
                  <div key={n.key || n.url} className="flex items-center gap-2 px-3 py-2 border-t border-gray-700/60">
                    <span className="flex-1 min-w-0 text-sm text-gray-200 truncate">
                      Nº {n.key ? Number(n.key.slice(25, 34)) : '—'}
                      <span className="text-gray-500 text-xs"> · guardada {new Date(n.savedAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}{n.contingency ? ' · contingência' : ''}</span>
                    </span>
                    <button onClick={() => start(n.url)} className="text-sm font-medium text-green-300 border border-green-500/40 bg-green-500/10 px-3 py-1 rounded-full">Ler</button>
                    <button onClick={() => confirm('Remover esta nota da lista?') && removePendingNote(familyId, n.key || n.url)}
                      className="text-gray-500 text-sm px-1" aria-label="Remover nota guardada">✕</button>
                  </div>
                ))}
              </div>
            )}
            <QrScanner onResult={start} />
            <div>
              <p className="text-gray-500 text-xs mb-1.5">Ou cole o link do QR code</p>
              <div className="flex gap-2">
                <input value={link} onChange={e => setLink(e.target.value)} placeholder="http://www.nfce.sefin.ro.gov.br/..."
                  className="flex-1 min-w-0 bg-gray-800 text-white text-base px-3 py-2.5 rounded-xl outline-none border border-transparent focus:border-green-500" />
                <button onClick={() => start(link)} disabled={!link.trim()}
                  className="bg-green-500 disabled:opacity-40 text-white font-semibold px-4 rounded-xl">Ler</button>
              </div>
            </div>
          </div>
        )}

        {(step === 'loading' || step === 'saving') && (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <div className="w-7 h-7 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-gray-400 text-sm">{step === 'saving' ? 'Registrando...' : 'Consultando a SEFAZ...'}</p>
          </div>
        )}

        {step === 'captcha' && (
          <div className="flex flex-col items-center gap-4 pt-4">
            {isContingencyKey(keyFromUrl(lastUrl)) && (
              <p className="text-amber-200/90 text-xs text-center bg-amber-500/10 border border-amber-500/30 rounded-xl px-3 py-2 max-w-xs">
                Esta nota foi emitida em contingência (caixa sem internet). Se a SEFAZ ainda não tiver os itens, dá para guardar e ler mais tarde.
              </p>
            )}
            <p className="text-gray-300 text-sm text-center">A SEFAZ pede uma verificação. Digite o texto da imagem:</p>
            {captcha && <img src={captcha} alt="Captcha da SEFAZ" className="bg-white rounded-xl p-2 w-64" />}
            <input autoFocus value={answer} onChange={e => setAnswer(e.target.value)} onKeyDown={e => e.key === 'Enter' && submitCaptcha()}
              autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder="Texto da imagem"
              className="w-64 bg-gray-800 text-white text-lg text-center tracking-widest px-3 py-3 rounded-xl outline-none border border-transparent focus:border-green-500" />
            <div className="flex gap-2 w-64">
              <button onClick={() => start(lastUrl)} className="flex-1 bg-gray-800 text-gray-300 text-sm py-3 rounded-xl" title="Outra imagem">Outra imagem</button>
              <button onClick={submitCaptcha} disabled={!answer.trim()} className="flex-1 bg-green-500 disabled:opacity-40 text-white font-semibold py-3 rounded-xl">Continuar</button>
            </div>
          </div>
        )}

        {step === 'duplicate' && duplicate && (
          <div className="flex flex-col items-center text-center pt-12 gap-3">
            <div className="text-5xl">🧾</div>
            <h3 className="text-white text-lg font-semibold">Esta nota já está registrada</h3>
            <p className="text-gray-400 text-sm">
              {duplicate.mercado} · {duplicate.createdAt?.toDate?.().toLocaleDateString('pt-BR')} · {fmt(duplicate.total)}
            </p>
            <p className="text-gray-500 text-xs max-w-xs">A mesma nota não pode ser lançada duas vezes. Para corrigir, apague o registro em Registros e leia a nota de novo.</p>
            <button onClick={onClose} className="mt-4 bg-gray-800 text-white font-semibold px-8 py-3 rounded-xl">Fechar</button>
          </div>
        )}

        {step === 'review' && nota && (
          <div>
            {(reconcileWith || similar.length > 0) && (
              <div className={`rounded-2xl p-3 mb-3 border ${reconcileId ? 'border-amber-500/40 bg-amber-500/10' : 'border-gray-700 bg-gray-800/40'}`}>
                <p className="text-amber-200 text-sm font-medium mb-2">
                  {reconcileWith ? 'Conciliar com esta compra' : 'Parece que esta compra já foi registrada'}
                </p>
                {[...(reconcileWith ? [{ record: reconcileWith }] : []), ...similar.filter(c => c.record.id !== reconcileWith?.id)].map(({ record: rec }) => (
                  <label key={rec.id} className="flex items-center gap-2 py-1 text-sm">
                    <input type="radio" name="reconcile" checked={reconcileId === rec.id} onChange={() => setReconcileId(rec.id)} className="accent-amber-400" />
                    <span className="flex-1 text-gray-200">
                      {rec.createdAt?.toDate?.().toLocaleDateString('pt-BR') || ''} · {rec.mercado} · {rec.items?.length || 0} itens
                    </span>
                    <span className="text-gray-300">{fmt(rec.total)}</span>
                  </label>
                ))}
                <label className="flex items-center gap-2 py-1 text-sm">
                  <input type="radio" name="reconcile" checked={!reconcileId} onChange={() => setReconcileId(null)} className="accent-amber-400" />
                  <span className="text-gray-300">É outra compra, registrar separada</span>
                </label>
                {reconcileId && (
                  <p className="text-amber-200/70 text-xs mt-1">Ao confirmar, a compra escolhida passa a ter os itens e valores exatos da nota. Nada é duplicado.</p>
                )}
              </div>
            )}
            <div className="bg-gray-800/60 rounded-2xl p-3 mb-4">
              <p className="text-gray-500 text-xs mb-1">Mercado</p>
              <input value={mercado} onChange={e => setMercado(e.target.value)}
                className="w-full bg-gray-900 text-white text-base px-3 py-2 rounded-lg outline-none border border-gray-700 mb-2" />
              <div className="flex justify-between text-xs text-gray-400">
                <span>{nota.issuedAt ? new Date(nota.issuedAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : ''}</span>
                <span>{rows.length} itens · <b className="text-white">{fmt(nota.total)}</b></span>
              </div>
            </div>

            <p className="text-gray-500 text-xs mb-2">Confira onde cada item entra. Mesclar mantém um produto só (ex.: todas as marcas de arroz em "Arroz").</p>

            {rows.map((r, i) => {
              const x = resolved(r)
              const inList = listNames.has(x.key)
              return (
                <div key={i} className={`border border-gray-800 rounded-2xl p-3 mb-2 ${r.include ? '' : 'opacity-40'}`}>
                  <div className="flex items-start gap-2">
                    <input type="checkbox" checked={r.include} onChange={e => updateRow(i, { include: e.target.checked })}
                      className="mt-1 w-4 h-4 accent-green-500 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-gray-400 text-xs truncate">{r.nf.name}</p>
                      <p className="text-gray-500 text-xs">{qtyText(r.nf.qty)} {r.nf.unit.toLowerCase()} × {fmt(r.nf.unitPrice)} = <span className="text-gray-300">{fmt(r.nf.total)}</span></p>
                    </div>
                  </div>

                  <div className="mt-2 pl-6">
                    <select value={r.target.type === 'existing' ? r.target.id : '__new__'}
                      onChange={e => {
                        const v = e.target.value
                        if (v === '__new__') {
                          const size = packSize(r.nf.name)
                          updateRow(i, { target: { type: 'new', name: r.target.name || r.nf.name.split(' ')[0], category: 'Mercearia', unit: size ? size.unit : mapUnit(r.nf.unit) } })
                        } else updateRow(i, { target: { type: 'existing', id: v } })
                      }}
                      className="w-full bg-gray-800 text-white text-base px-3 py-2 rounded-lg outline-none border border-gray-700">
                      <option value="__new__">＋ Novo produto</option>
                      {r.alternatives.length > 0 && (
                        <optgroup label="Parecidos">
                          {r.alternatives.map(a => <option key={'alt-' + a.id} value={a.id}>{a.name}</option>)}
                        </optgroup>
                      )}
                      <optgroup label="Catálogo">
                        {catalogItems.map(c => <option key={c.id} value={c.id}>{c.name}{c.unit ? ` (${c.unit})` : ''}</option>)}
                      </optgroup>
                    </select>

                    {r.target.type === 'new' && (
                      <div className="flex gap-2 mt-2">
                        <input value={r.target.name} onChange={e => updateRow(i, { target: { ...r.target, name: e.target.value } })}
                          placeholder="Nome do produto"
                          className="flex-1 min-w-0 bg-gray-900 text-white text-base px-3 py-2 rounded-lg outline-none border border-gray-700" />
                        <select value={r.target.unit} onChange={e => updateRow(i, { target: { ...r.target, unit: e.target.value } })}
                          className="w-36 bg-gray-900 text-white text-base px-2 py-2 rounded-lg outline-none border border-gray-700">
                          {UNITS.map(u => <option key={u} value={u}>{u} · {UNIT_LABELS[u]}</option>)}
                        </select>
                      </div>
                    )}
                    {r.target.type === 'new' && (
                      <select value={r.target.category} onChange={e => updateRow(i, { target: { ...r.target, category: e.target.value } })}
                        className="w-full mt-2 bg-gray-900 text-white text-base px-3 py-2 rounded-lg outline-none border border-gray-700">
                        {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                      </select>
                    )}

                    <div className="flex flex-wrap gap-x-3 mt-1.5 text-[11px]">
                      {r.target.reason === 'lembrado' && <span className="text-blue-300">lembrado da última nota</span>}
                      {x.converted && <span className="text-emerald-300">{qtyText(x.qty)} {x.unit} · {fmt(x.unitPrice)}/{x.unit}</span>}
                      {inList && <span className="text-green-400">✓ estava na lista</span>}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {step === 'review' && (
        <div className="border-t border-gray-800 px-4 pt-3" style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>
          <button onClick={save} disabled={!rows.some(r => r.include)}
            className="w-full bg-green-500 disabled:opacity-40 text-white font-bold py-3.5 rounded-2xl">
            {reconcileId ? 'Conciliar compra' : 'Registrar compra'} · {fmt(includedTotal)}
          </button>
        </div>
      )}
    </div>
  )
}
