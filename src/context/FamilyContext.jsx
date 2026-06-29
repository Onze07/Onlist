import { createContext, useContext, useEffect, useState } from 'react'
import { doc, getDoc, setDoc, collection, query, where, getDocs } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from './AuthContext'

const FamilyContext = createContext(null)

export function FamilyProvider({ children }) {
  const user = useAuth()
  const [familyId, setFamilyId] = useState(undefined)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) {
      setFamilyId(null)
      setLoading(false)
      return
    }
    const userRef = doc(db, 'users', user.uid)
    getDoc(userRef).then((snap) => {
      if (snap.exists()) {
        setFamilyId(snap.data().familyId || null)
      } else {
        setFamilyId(null)
      }
      setLoading(false)
    })
  }, [user])

  async function createFamily() {
    const code = Math.random().toString(36).slice(2, 8).toUpperCase()
    const familyRef = doc(collection(db, 'families'))
    await setDoc(familyRef, { code, createdBy: user.uid, members: [user.uid] })
    await setDoc(doc(db, 'users', user.uid), { familyId: familyRef.id, email: user.email })
    setFamilyId(familyRef.id)
    return code
  }

  async function joinFamily(code) {
    const q = query(collection(db, 'families'), where('code', '==', code.toUpperCase()))
    const snap = await getDocs(q)
    if (snap.empty) throw new Error('Código não encontrado')
    const familyDoc = snap.docs[0]
    await setDoc(doc(db, 'users', user.uid), { familyId: familyDoc.id, email: user.email })
    setFamilyId(familyDoc.id)
  }

  return (
    <FamilyContext.Provider value={{ familyId, loading, createFamily, joinFamily }}>
      {children}
    </FamilyContext.Provider>
  )
}

export function useFamily() {
  return useContext(FamilyContext)
}
