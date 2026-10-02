import { createContext, useContext, useEffect, useState } from 'react'
import {
  doc, getDoc, setDoc, collection, writeBatch, arrayUnion, arrayRemove,
  onSnapshot, serverTimestamp, updateDoc,
} from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from './AuthContext'

const FamilyContext = createContext(null)

// Sem 0/O/1/I para evitar confusão ao digitar. 32 símbolos = sem viés no módulo.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
export const DEFAULT_SEATS = 5

function generateCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(6))
  return Array.from(bytes, b => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('')
}

async function generateFreeCode() {
  for (let i = 0; i < 5; i++) {
    const candidate = generateCode()
    const existing = await getDoc(doc(db, 'familyCodes', candidate))
    if (!existing.exists()) return candidate
  }
  throw new Error('Não foi possível gerar um código. Tente novamente.')
}

function profileData(user) {
  return {
    name: user.displayName || user.email,
    email: user.email,
    photoURL: user.photoURL || null,
    lastSeenAt: serverTimestamp(),
  }
}

export function FamilyProvider({ children }) {
  const user = useAuth()
  const [familyId, setFamilyId] = useState(undefined)
  const [family, setFamily] = useState(null)
  const [profiles, setProfiles] = useState({})
  const [userLoading, setUserLoading] = useState(true)

  // users/{uid} -> familyId
  useEffect(() => {
    if (!user) {
      setFamilyId(null)
      setUserLoading(false)
      return
    }
    setUserLoading(true)
    getDoc(doc(db, 'users', user.uid))
      .then(snap => setFamilyId(snap.exists() ? snap.data().familyId || null : null))
      .catch(e => {
        console.error('Erro ao carregar usuário', e)
        setFamilyId(null)
      })
      .finally(() => setUserLoading(false))
  }, [user])

  // Família em tempo real. Se o usuário for removido, a leitura falha e ele volta para a tela de configuração.
  useEffect(() => {
    if (!user || !familyId) {
      setFamily(null)
      return
    }
    setFamily(undefined)
    const unsub = onSnapshot(doc(db, 'families', familyId), snap => {
      if (snap.exists() && snap.data().members?.includes(user.uid)) {
        setFamily({ id: snap.id, ...snap.data() })
      } else {
        setFamily(null)
        setFamilyId(null)
      }
    }, () => {
      setFamily(null)
      setFamilyId(null)
      setDoc(doc(db, 'users', user.uid), { familyId: null }, { merge: true }).catch(() => {})
    })
    // Mantém nome/foto atualizados para os outros membros
    setDoc(doc(db, 'families', familyId, 'profiles', user.uid), profileData(user), { merge: true }).catch(() => {})
    return unsub
  }, [user, familyId])

  useEffect(() => {
    if (!family?.id) {
      setProfiles({})
      return
    }
    return onSnapshot(collection(db, 'families', family.id, 'profiles'), snap => {
      const map = {}
      snap.docs.forEach(d => { map[d.id] = d.data() })
      setProfiles(map)
    }, () => {})
  }, [family?.id])

  const loading = userLoading || (familyId && family === undefined)
  const isOwner = !!family && family.createdBy === user?.uid
  const isAdmin = isOwner || (!!family && (family.admins || []).includes(user?.uid))
  const seats = family?.plan?.seats ?? DEFAULT_SEATS

  async function createFamily(name) {
    const code = await generateFreeCode()
    const familyRef = doc(collection(db, 'families'))
    const batch = writeBatch(db)
    batch.set(familyRef, {
      name: name?.trim() || 'Minha família',
      code, createdBy: user.uid, members: [user.uid], admins: [],
      createdAt: serverTimestamp(),
    })
    batch.set(doc(db, 'familyCodes', code), { familyId: familyRef.id })
    batch.set(doc(db, 'users', user.uid), { familyId: familyRef.id, email: user.email })
    batch.set(doc(db, 'families', familyRef.id, 'profiles', user.uid), { ...profileData(user), joinedAt: serverTimestamp() })
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
    batch.set(doc(db, 'families', fid, 'profiles', user.uid), { ...profileData(user), joinedAt: serverTimestamp() })
    try {
      await batch.commit()
    } catch (e) {
      if (e.code === 'permission-denied') {
        throw new Error('Não foi possível entrar. O plano desta família pode estar com todas as vagas ocupadas.')
      }
      throw e
    }
    setFamilyId(fid)
  }

  async function renameFamily(name) {
    if (!name.trim()) return
    await updateDoc(doc(db, 'families', family.id), { name: name.trim() })
  }

  async function regenerateCode() {
    const code = await generateFreeCode()
    const batch = writeBatch(db)
    batch.set(doc(db, 'familyCodes', code), { familyId: family.id })
    batch.update(doc(db, 'families', family.id), { code })
    if (family.code) batch.delete(doc(db, 'familyCodes', family.code))
    await batch.commit()
    return code
  }

  async function removeMember(uid) {
    const batch = writeBatch(db)
    batch.update(doc(db, 'families', family.id), { members: arrayRemove(uid), admins: arrayRemove(uid) })
    batch.delete(doc(db, 'families', family.id, 'profiles', uid))
    await batch.commit()
  }

  async function setAdmin(uid, value) {
    await updateDoc(doc(db, 'families', family.id), { admins: value ? arrayUnion(uid) : arrayRemove(uid) })
  }

  async function leaveFamily() {
    const fid = family.id
    const batch = writeBatch(db)
    batch.delete(doc(db, 'families', fid, 'profiles', user.uid))
    batch.update(doc(db, 'families', fid), { members: arrayRemove(user.uid), admins: arrayRemove(user.uid) })
    batch.set(doc(db, 'users', user.uid), { familyId: null }, { merge: true })
    await batch.commit()
    try { localStorage.removeItem(`lastList_${fid}`) } catch { /* ignora */ }
    setFamilyId(null)
  }

  return (
    <FamilyContext.Provider value={{
      familyId: family ? familyId : null, family, profiles, loading, isOwner, isAdmin, seats,
      createFamily, joinFamily, renameFamily, regenerateCode, removeMember, setAdmin, leaveFamily,
    }}>
      {children}
    </FamilyContext.Provider>
  )
}

export function useFamily() {
  return useContext(FamilyContext)
}
