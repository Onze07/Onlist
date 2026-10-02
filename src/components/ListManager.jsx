import { useEffect, useState } from 'react'
import { collection, onSnapshot, addDoc, updateDoc, getDocs, doc, serverTimestamp, query, orderBy } from 'firebase/firestore'
import { db } from '../firebase'
import { commitInChunks } from '../lib/firestore'
import { useFamily } from '../context/FamilyContext'
import { IconEdit, IconTrash, IconArchive, IconUnarchive, IconX } from './Icon'

export default function ListManager({ activeListId, onSelect, onClose }) {
  const { familyId } = useFamily()
  const [lists, setLists] = useState([])
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [editingName, setEditingName] = useState('')
  const [showArchived, setShowArchived] = useState(false)

  useEffect(() => {
    if (!familyId) return
    const q = query(collection(db, 'families', familyId, 'lists'), orderBy('createdAt', 'desc'))
    return onSnapshot(q, snap => {
      setLists(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    })
  }, [familyId])

  const active = lists.filter(l => l.status !== 'archived')
  const archived = lists.filter(l => l.status === 'archived')

  async function createList() {
    if (!newName.trim()) return
    const ref = await addDoc(collection(db, 'families', familyId, 'lists'), {
      name: newName.trim(),
      status: 'active',
      createdAt: serverTimestamp(),
    })
    setNewName('')
    setCreating(false)
    onSelect(ref.id, newName.trim())
    onClose()
  }

  async function renameList(id, name) {
    if (!name.trim()) return
    await updateDoc(doc(db, 'families', familyId, 'lists', id), { name: name.trim() })
    if (id === activeListId) onSelect(id, name.trim())
    setEditingId(null)
  }

  // Evita deixar a tela principal apontando para uma lista arquivada/excluída
  function nextActiveList(id) {
    const next = active.find(l => l.id !== id)
    if (id === activeListId && !next) {
      alert('Crie outra lista antes. Esta é a única lista ativa.')
      return undefined
    }
    return next || null
  }

  async function archiveList(id) {
    const next = nextActiveList(id)
    if (next === undefined) return
    await updateDoc(doc(db, 'families', familyId, 'lists', id), { status: 'archived' })
    if (id === activeListId) onSelect(next.id, next.name)
  }

  async function unarchiveList(id) {
    await updateDoc(doc(db, 'families', familyId, 'lists', id), { status: 'active' })
  }

  async function deleteList(id, name) {
    const next = nextActiveList(id)
    if (next === undefined) return
    if (!confirm(`Excluir a lista "${name}" permanentemente?`)) return
    try {
      // Firestore não apaga subcoleções sozinho: remove os itens antes da lista
      const listRef = doc(db, 'families', familyId, 'lists', id)
      const entries = await getDocs(collection(listRef, 'entries'))
      await commitInChunks([
        ...entries.docs.map(d => b => b.delete(d.ref)),
        b => b.delete(listRef),
      ])
      if (id === activeListId) onSelect(next.id, next.name)
    } catch (e) {
      alert('Erro ao excluir: ' + e.message)
    }
  }

  // Função de render (não componente): evita remontar o input a cada tecla
  function renderRow(list, isArchived) {
    const isActive = list.id === activeListId

    if (editingId === list.id) {
      return (
        <div key={list.id} className="flex items-center gap-2 py-2 border-b border-gray-800">
          <input autoFocus value={editingName} onChange={e => setEditingName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') renameList(list.id, editingName); if (e.key === 'Escape') setEditingId(null) }}
            className="flex-1 bg-gray-800 text-white px-3 py-1.5 rounded-lg outline-none text-sm" />
          <button onClick={() => renameList(list.id, editingName)} className="text-green-400 text-sm font-semibold px-2">OK</button>
          <button onClick={() => setEditingId(null)} className="text-gray-500 px-1"><IconX /></button>
        </div>
      )
    }

    return (
      <div key={list.id} className={`flex items-center gap-3 py-3 border-b border-gray-800 ${isArchived ? 'opacity-50' : ''}`}>
        <button className="flex-1 text-left" onClick={() => { if (!isArchived) { onSelect(list.id, list.name); onClose() } }}>
          <span className={`text-sm ${isActive ? 'text-green-400 font-semibold' : 'text-white'}`}>{list.name}</span>
          {isActive && <span className="text-green-400/60 text-xs ml-2">· ativa</span>}
          {isArchived && <span className="text-gray-500 text-xs ml-2">· arquivada</span>}
        </button>
        <div className="flex items-center gap-4">
          {!isArchived && (
            <button onClick={() => { setEditingId(list.id); setEditingName(list.name) }} className="text-gray-400 hover:text-gray-200">
              <IconEdit size={17} />
            </button>
          )}
          {!isArchived ? (
            <button onClick={() => archiveList(list.id)} className="text-gray-400 hover:text-gray-200">
              <IconArchive size={17} />
            </button>
          ) : (
            <button onClick={() => unarchiveList(list.id)} className="text-gray-400 hover:text-gray-200">
              <IconUnarchive size={17} />
            </button>
          )}
          <button onClick={() => deleteList(list.id, list.name)} className="text-gray-500 hover:text-red-400">
            <IconTrash size={17} />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-end" onClick={onClose}>
      <div className="bg-gray-900 rounded-t-3xl w-full max-w-lg mx-auto p-6 pb-10 max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="w-10 h-1 bg-gray-700 rounded-full mx-auto mb-6" />

        <div className="flex items-center justify-between mb-4">
          <h2 className="text-white font-semibold text-base">Listas ativas</h2>
          <button onClick={() => setCreating(true)} className="text-green-400 text-sm flex items-center gap-1">+ nova</button>
        </div>

        {creating && (
          <div className="flex gap-2 mb-3">
            <input autoFocus value={newName} onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && createList()}
              placeholder="Nome da lista"
              className="flex-1 bg-gray-800 text-white px-3 py-2 rounded-lg outline-none text-sm" />
            <button onClick={createList} className="bg-green-500 text-white px-4 rounded-lg text-sm font-semibold">Criar</button>
            <button onClick={() => setCreating(false)} className="text-gray-500 px-2"><IconX /></button>
          </div>
        )}

        {active.map(list => renderRow(list, false))}

        {archived.length > 0 && (
          <div className="mt-4">
            <button onClick={() => setShowArchived(v => !v)}
              className="text-gray-500 text-xs uppercase tracking-wider flex items-center gap-1 mb-2">
              {showArchived ? '▼' : '▶'} Arquivadas ({archived.length})
            </button>
            {showArchived && archived.map(list => renderRow(list, true))}
          </div>
        )}
      </div>
    </div>
  )
}
