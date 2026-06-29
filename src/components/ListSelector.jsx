import { useState } from 'react'
import { useList } from '../context/ListContext'

export default function ListSelector({ onClose }) {
  const { lists, currentListId, setCurrentListId, createList } = useList()
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)

  async function handleCreate() {
    if (!newName.trim()) return
    setCreating(true)
    await createList(newName.trim())
    setNewName('')
    setCreating(false)
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-end" onClick={onClose}>
      <div className="bg-gray-900 rounded-t-3xl w-full max-w-lg mx-auto p-6 pb-10" onClick={e => e.stopPropagation()}>
        <div className="w-10 h-1 bg-gray-700 rounded-full mx-auto mb-6" />
        <h2 className="text-white text-lg font-bold mb-4">Suas listas</h2>

        <div className="mb-4 space-y-2">
          {lists.map(list => (
            <button key={list.id}
              onClick={() => { setCurrentListId(list.id); onClose() }}
              className={`w-full text-left px-4 py-3 rounded-xl flex items-center justify-between transition-colors
                ${list.id === currentListId ? 'bg-green-500/20 border border-green-500 text-green-400' : 'bg-gray-800 text-white'}`}>
              <span className="font-medium">{list.name}</span>
              {list.id === currentListId && <span className="text-xs">✓ ativa</span>}
            </button>
          ))}
        </div>

        <div className="border-t border-gray-800 pt-4">
          <p className="text-gray-400 text-sm mb-2">Nova lista</p>
          <div className="flex gap-2">
            <input
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
              placeholder="Ex: Lista do jantar"
              className="flex-1 bg-gray-800 text-white px-4 py-3 rounded-xl outline-none border-2 border-transparent focus:border-green-500"
            />
            <button onClick={handleCreate} disabled={creating || !newName.trim()}
              className="bg-green-500 disabled:opacity-40 text-white font-semibold px-4 py-3 rounded-xl">
              +
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
