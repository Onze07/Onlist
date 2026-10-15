import { createContext, useContext, useEffect, useRef, useState } from 'react'
import {
  doc, getDoc, setDoc, collection, writeBatch, arrayUnion, arrayRemove,
  onSnapshot, serverTimestamp, updateDoc,
} from 'firebase/firestore'
import { reauthenticateWithPopup, signOut } from 'firebase/auth'
import { auth, db, googleProvider } from '../firebase'
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

// O app não consulta códigos (impede testar códigos em massa). Se o sorteado já existir,
// a gravação é recusada pelas regras e outro código é tentado.
async function withFreeCode(write) {
  for (let i = 0; i < 5; i++) {
    const code = generateCode()
    try {
      await write(code)
      return code
    } catch (e) {
      if (e.code !== 'permission-denied') throw e
    }
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

  // Troca de família que parou no meio (queda do servidor): o servidor termina sozinho
  const resumedRef = useRef(false)
  useEffect(() => {
    if (!userDoc?.movePending || resumedRef.current) return
    resumedRef.current = true
    apiPost('/api/family', { action: 'resume' }).catch(() => { resumedRef.current = false })
  }, [userDoc?.movePending])

  const loading = userLoading || userDoc === undefined || (familyId && family === undefined)
  const isOwner = !!family && family.createdBy === user?.uid
  const isAdmin = isOwner || (!!family && (family.admins || []).includes(user?.uid))
  const seats = family?.plan?.seats ?? DEFAULT_SEATS

  async function createFamily(name) {
    const familyRef = doc(collection(db, 'families'))
    const code = await withFreeCode(code => {
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
      return batch.commit()
    })
    setFamilyId(familyRef.id)
    return code
  }

  // Entrar com código: pelo servidor, que limita as tentativas erradas
  async function joinFamily(rawCode) {
    const code = rawCode.trim().toUpperCase()
    const result = await apiPost('/api/family', { action: 'switch', code, mode: 'fresh' })
    setFamilyId(result.familyId)
  }

  async function renameFamily(name) {
    if (!name.trim()) return
    await updateDoc(doc(db, 'families', family.id), { name: name.trim() })
  }

  async function regenerateCode() {
    return withFreeCode(code => {
      const batch = writeBatch(db)
      batch.set(doc(db, 'familyCodes', code), { familyId: family.id })
      batch.update(doc(db, 'families', family.id), { code })
      if (family.code) batch.delete(doc(db, 'familyCodes', family.code))
      return batch.commit()
    })
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
  // Exclusão pelo servidor: apaga tudo de uma vez, mesmo se o app fechar no meio
  async function deleteAccount() {
    if (family && isOwner && family.members.length > 1) {
      throw new Error('Você é o dono da família. Passe a posse ou remova os outros membros antes de excluir sua conta.')
    }
    await reauthenticateWithPopup(user, googleProvider)
    deletingRef.current = true
    try {
      const fid = family?.id
      await apiPost('/api/family', { action: 'deleteAccount' }, { freshToken: true })
      if (fid) { try { localStorage.removeItem(`lastList_${fid}`) } catch { /* ignora */ } }
      await signOut(auth).catch(() => {})
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
