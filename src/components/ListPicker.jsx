import { useEffect, useState } from 'react'
import { collection, onSnapshot, addDoc, serverTimestamp, query, orderBy } from 'firebase/firestore'
import { db } from '../firebase'
import { useFamily } from '../context/FamilyContext'

export default function ListPicker({ activeListId, onSelect, onClose }) {
  const { familyId } = useFamily()
  const [lists, setLists] = useState([])
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    if (!familyId) return
    const q = query(collection(db, 'families', familyId, 'lists'), orderBy('createdAt', 'desc'))
    return onSnapshot(q, snap => {
      setLists(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    })
  }, [familyId])

  async function createList() {
    if (!newName.trim()) return
    const ref = await addDoc(collection(db, 'families', familyId, 'lists'), {
      name: newName.trim(),
      createdAt: serverTimestamp(),
    })
    setNewName('')
    setCreating(false)
    onSelect(ref.id, newName.trim())
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-end" onClick={onClose}>
      <div className="bg-gray-900 rounded-t-3xl w-full max-w-lg mx-auto p-6 pb-10" onClick={e => e.stopPropagation()}>
        <div className="w-10 h-1 bg-gray-700 rounded-full mx-auto mb-6" />
        <h2 className="text-white font-bold text-lg mb-4">Suas listas</h2>

        {lists.map(list => (
          <button key={list.id} onClick={() => { onSelect(list.id, list.name); onClose() }}
            className={`w-full text-left px-4 py-3 rounded-xl mb-2 flex items-center justify-between
              ${list.id === activeListId ? 'bg-green-500/20 border border-green-500/40' : 'bg-gray-800'}`}>
            <span className="text-white font-medium">{list.name}</span>
            {list.id === activeListId && <span className="text-green-400 text-xs">ativa</span>}
          </button>
        ))}

        {creating ? (
          <div className="flex gap-2 mt-3">
            <input autoFocus value={newName} onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && createList()}
              placeholder="Nome da lista"
              className="flex-1 bg-gray-800 text-white px-4 py-3 rounded-xl outline-none" />
            <button onClick={createList} className="bg-green-500 text-white px-4 rounded-xl font-semibold">OK</button>
          </div>
        ) : (
          <button onClick={() => setCreating(true)}
            className="w-full mt-3 bg-gray-800 border border-dashed border-gray-600 text-gray-400 py-3 rounded-xl text-sm">
            + Nova lista
          </button>
        )}
      </div>
    </div>
  )
}
