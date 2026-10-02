import { createContext, useContext, useEffect, useState } from 'react'
import { doc, getDoc, setDoc, updateDoc, collection, writeBatch, arrayUnion } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from './AuthContext'

const FamilyContext = createContext(null)

// Sem 0/O/1/I para evitar confusão ao digitar. 32 símbolos = sem viés no módulo.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

function generateCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(6))
  return Array.from(bytes, b => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('')
}

// Migração de famílias antigas: garante que o usuário está em `members`
// e que existe o documento familyCodes/{code}. Falha em silêncio se não for membro.
async function ensureMembership(familyId, uid) {
  const familyRef = doc(db, 'families', familyId)
  const snap = await getDoc(familyRef)
  if (!snap.exists()) return
  const data = snap.data()
  if (!data.members?.includes(uid)) {
    await updateDoc(familyRef, { members: arrayUnion(uid) })
  }
  if (data.code) {
    const codeRef = doc(db, 'familyCodes', data.code)
    const codeSnap = await getDoc(codeRef)
    if (!codeSnap.exists()) await setDoc(codeRef, { familyId })
  }
}

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
    setLoading(true)
    getDoc(doc(db, 'users', user.uid))
      .then((snap) => {
        const fid = snap.exists() ? snap.data().familyId || null : null
        setFamilyId(fid)
        if (fid) ensureMembership(fid, user.uid).catch(() => {})
      })
      .catch((e) => {
        console.error('Erro ao carregar família', e)
        setFamilyId(null)
      })
      .finally(() => setLoading(false))
  }, [user])

  async function createFamily() {
    let code = null
    for (let i = 0; i < 5 && !code; i++) {
      const candidate = generateCode()
      const existing = await getDoc(doc(db, 'familyCodes', candidate))
      if (!existing.exists()) code = candidate
    }
    if (!code) throw new Error('Não foi possível gerar um código. Tente novamente.')

    const familyRef = doc(collection(db, 'families'))
    const batch = writeBatch(db)
    batch.set(familyRef, { code, createdBy: user.uid, members: [user.uid] })
    batch.set(doc(db, 'familyCodes', code), { familyId: familyRef.id })
    batch.set(doc(db, 'users', user.uid), { familyId: familyRef.id, email: user.email })
    await batch.commit()
    setFamilyId(familyRef.id)
    return code
  }

  async function joinFamily(rawCode) {
    const code = rawCode.trim().toUpperCase()
    const codeSnap = await getDoc(doc(db, 'familyCodes', code))
    if (!codeSnap.exists()) throw new Error('Código não encontrado')
    const fid = codeSnap.data().familyId

    // joinCode prova para as regras do Firestore que o usuário conhece o código
    const batch = writeBatch(db)
    batch.set(doc(db, 'users', user.uid), { familyId: fid, email: user.email, joinCode: code })
    batch.update(doc(db, 'families', fid), { members: arrayUnion(user.uid) })
    await batch.commit()
    setFamilyId(fid)
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
