import { createContext, useContext, useEffect, useState } from 'react'
import { collection, onSnapshot, addDoc, serverTimestamp, orderBy, query } from 'firebase/firestore'
import { db } from '../firebase'
import { useFamily } from './FamilyContext'

const ListContext = createContext(null)

export function ListProvider({ children }) {
  const { familyId } = useFamily()
  const [lists, setLists] = useState([])
  const [currentListId, setCurrentListId] = useState(null)

  useEffect(() => {
    if (!familyId) return
    const q = query(collection(db, 'families', familyId, 'lists'), orderBy('createdAt', 'asc'))
    return onSnapshot(q, snap => {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      setLists(docs)
      setCurrentListId(prev => {
        if (prev && docs.find(d => d.id === prev)) return prev
        return docs[0]?.id || null
      })
    })
  }, [familyId])

  async function createList(name) {
    const ref = await addDoc(collection(db, 'families', familyId, 'lists'), {
      name,
      createdAt: serverTimestamp(),
    })
    setCurrentListId(ref.id)
    return ref.id
  }

  const currentList = lists.find(l => l.id === currentListId) || null

  return (
    <ListContext.Provider value={{ lists, currentList, currentListId, setCurrentListId, createList }}>
      {children}
    </ListContext.Provider>
  )
}

export function useList() {
  return useContext(ListContext)
}
