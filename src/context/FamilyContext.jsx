import { createContext, useContext, useEffect, useRef, useState } from 'react'
import {
  doc, getDoc, getDocs, setDoc, collection, writeBatch, arrayUnion, arrayRemove,
  onSnapshot, serverTimestamp, updateDoc, deleteDoc,
} from 'firebase/firestore'
import { deleteUser, reauthenticateWithPopup } from 'firebase/auth'
import { db, googleProvider } from '../firebase'
import { commitInChunks } from '../lib/firestore'
import { useAuth } from './AuthContext'
import { userPhoto } from '../lib/user'
import { apiPost } from '../lib/api'
import { pushStatus } from '../lib/push'

const FamilyContext = createContext(null)

// Sem 0/O/1/I para evitar confusão ao digitar. 32 símbolos = sem viés no módulo.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
// Sem cobrança por enquanto: limite alto só contra abuso de código vazado. Igual às regras e ao /api/family.
export const DEFAULT_SEATS = 20

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
    photoURL: userPhoto(user),
    lastSeenAt: serverTimestamp(),
    // Ao entrar numa família nova, os outros já veem que este aparelho recebe avisos
    ...(pushStatus() === 'enabled' ? { pushEnabled: true } : {}),
  }
}

export function FamilyProvider({ children }) {
  const user = useAuth()
  const [familyId, setFamilyId] = useState(undefined)
  const [family, setFamily] = useState(null)
  const [profiles, setProfiles] = useState({})
  const [userLoading, setUserLoading] = useState(true)
  const [userDoc, setUserDoc] = useState(undefined)
  const [notice, setNotice] = useState('')
  const deletingRef = useRef(false)
  // Durante a troca de família, a família antiga some/nega leitura: isso não pode zerar o familyId novo
  const switchingRef = useRef(null)

  // Aceite dos termos, boas-vindas etc. (users/{uid}) em tempo real
  useEffect(() => {
    if (!user) {
      setUserDoc(null)
      return
    }
    setUserDoc(undefined)
    return onSnapshot(doc(db, 'users', user.uid),
      snap => setUserDoc(snap.exists() ? snap.data() : {}),
      () => setUserDoc({}))
  }, [user])

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
    const stale = () => switchingRef.current && switchingRef.current !== familyId
    const unsub = onSnapshot(doc(db, 'families', familyId), snap => {
      if (stale()) return
      if (snap.exists() && snap.data().members?.includes(user.uid)) {
        if (switchingRef.current === familyId) switchingRef.current = null
        setFamily({ id: snap.id, ...snap.data() })
      } else {
        setFamily(null)
        setFamilyId(null)
      }
    }, () => {
      if (stale()) return
      setFamily(null)
      setFamilyId(null)
      if (!deletingRef.current) {
        setDoc(doc(db, 'users', user.uid), { familyId: null }, { merge: true }).catch(() => {})
      }
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

  const loading = userLoading || userDoc === undefined || (familyId && family === undefined)
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
    // merge: não apagar aceite dos termos, aparelhos de aviso etc.
    batch.set(doc(db, 'users', user.uid), { familyId: familyRef.id, email: user.email }, { merge: true })
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
    batch.set(doc(db, 'users', user.uid), { familyId: fid, email: user.email, joinCode: code }, { merge: true })
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
    batch.delete(doc(db, 'families', family.id, 'presence', uid))
    await batch.commit()
  }

  // Preferências da família (ex.: brandsEnabled). Só admin, pelas regras.
  async function updateFamilySettings(fields) {
    await updateDoc(doc(db, 'families', family.id), fields)
  }

  async function setAdmin(uid, value) {
    await updateDoc(doc(db, 'families', family.id), { admins: value ? arrayUnion(uid) : arrayRemove(uid) })
  }

  async function leaveFamily() {
    const fid = family.id
    const batch = writeBatch(db)
    batch.delete(doc(db, 'families', fid, 'profiles', user.uid))
    batch.delete(doc(db, 'families', fid, 'presence', user.uid))
    batch.update(doc(db, 'families', fid), { members: arrayRemove(user.uid), admins: arrayRemove(user.uid) })
    batch.set(doc(db, 'users', user.uid), { familyId: null }, { merge: true })
    await batch.commit()
    try { localStorage.removeItem(`lastList_${fid}`) } catch { /* ignora */ }
    setFamilyId(null)
  }

  // Entrar em outra família já tendo uma. mode: 'merge' (levar meus dados) | 'fresh' (começar do zero)
  async function switchFamily(rawCode, mode) {
    const oldFid = family?.id
    const code = rawCode.trim().toUpperCase()
    switchingRef.current = 'pending'
    try {
      const result = await apiPost('/api/family', { action: 'switch', code, mode })
      switchingRef.current = result.familyId
      if (oldFid) try { localStorage.removeItem(`lastList_${oldFid}`) } catch { /* ignora */ }
      setFamilyId(result.familyId)
      return result
    } catch (e) {
      switchingRef.current = null
      throw e
    }
  }

  // Passa a família para outro membro. O dono atual vira admin e pode sair depois.
  async function transferOwnership(uid) {
    const admins = [...(family.admins || []).filter(a => a !== uid), user.uid]
    await updateDoc(doc(db, 'families', family.id), { createdBy: uid, admins })
  }

  async function updateUserDoc(data) {
    await setDoc(doc(db, 'users', user.uid), data, { merge: true })
  }

  // Exclusão de conta (LGPD). Confirma a identidade antes de apagar qualquer coisa.
  async function deleteAccount() {
    if (family && isOwner && family.members.length > 1) {
      throw new Error('Você é o dono da família. Remova os outros membros antes de excluir sua conta.')
    }
    await reauthenticateWithPopup(user, googleProvider)
    deletingRef.current = true
    try {
      if (family) {
        const fid = family.id
        if (isOwner) {
          const ops = []
          const lists = await getDocs(collection(db, 'families', fid, 'lists'))
          for (const list of lists.docs) {
            const entries = await getDocs(collection(list.ref, 'entries'))
            entries.docs.forEach(d => ops.push(b => b.delete(d.ref)))
            ops.push(b => b.delete(list.ref))
          }
          for (const sub of ['catalog', 'history', 'mercados', 'profiles', 'presence']) {
            const snap = await getDocs(collection(db, 'families', fid, sub))
            snap.docs.forEach(d => ops.push(b => b.delete(d.ref)))
          }
          await commitInChunks(ops)
          const batch = writeBatch(db)
          if (family.code) batch.delete(doc(db, 'familyCodes', family.code))
          batch.delete(doc(db, 'families', fid))
          await batch.commit()
        } else {
          const batch = writeBatch(db)
          batch.delete(doc(db, 'families', fid, 'profiles', user.uid))
          batch.delete(doc(db, 'families', fid, 'presence', user.uid))
          batch.update(doc(db, 'families', fid), { members: arrayRemove(user.uid), admins: arrayRemove(user.uid) })
          await batch.commit()
        }
        try { localStorage.removeItem(`lastList_${fid}`) } catch { /* ignora */ }
      }

      await deleteDoc(doc(db, 'users', user.uid))
      await deleteUser(user)
    } finally {
      deletingRef.current = false
    }
  }

  return (
    <FamilyContext.Provider value={{
      familyId: family ? familyId : null, family, profiles, loading, isOwner, isAdmin, seats,
      userDoc, updateUserDoc, deleteAccount, notice, setNotice,
      createFamily, joinFamily, switchFamily, transferOwnership, updateFamilySettings, renameFamily, regenerateCode, removeMember, setAdmin, leaveFamily,
    }}>
      {children}
    </FamilyContext.Provider>
  )
}

export function useFamily() {
  return useContext(FamilyContext)
}
