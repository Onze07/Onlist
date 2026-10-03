import { arrayRemove, arrayUnion, doc, serverTimestamp, setDoc } from 'firebase/firestore'
import { auth, db } from '../firebase'
import { isIOS, isStandalone } from './install'

const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY
const TOKEN_KEY = 'pushToken'

// O Firebase Messaging só é carregado quando necessário
async function messaging() {
  const { getMessaging, isSupported } = await import('firebase/messaging')
  if (!(await isSupported())) return null
  const { getApp } = await import('firebase/app')
  return getMessaging(getApp())
}

export function pushStatus() {
  if (!('Notification' in window) || !('serviceWorker' in navigator)) {
    return isIOS() && !isStandalone() ? 'ios-install' : 'unsupported'
  }
  if (isIOS() && !isStandalone()) return 'ios-install'
  if (!VAPID_KEY) return 'unconfigured'
  if (Notification.permission === 'denied') return 'denied'
  let saved = null
  try { saved = localStorage.getItem(TOKEN_KEY) } catch { /* ignora */ }
  return Notification.permission === 'granted' && saved ? 'enabled' : 'off'
}

// Pede permissão, registra este aparelho e marca no perfil da família que recebe avisos
export async function enablePush(user, familyId) {
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new Error('Permissão negada. Libere as notificações nas configurações do aparelho.')
  const m = await messaging()
  if (!m) throw new Error('Este navegador não aceita notificações.')
  const { getToken } = await import('firebase/messaging')
  const registration = await navigator.serviceWorker.ready
  const token = await getToken(m, { vapidKey: VAPID_KEY, serviceWorkerRegistration: registration })
  if (!token) throw new Error('Não foi possível ativar as notificações.')
  await setDoc(doc(db, 'users', user.uid), { fcmTokens: arrayUnion(token), fcmUpdatedAt: serverTimestamp() }, { merge: true })
  if (familyId) await setDoc(doc(db, 'families', familyId, 'profiles', user.uid), { pushEnabled: true }, { merge: true })
  try { localStorage.setItem(TOKEN_KEY, token) } catch { /* ignora */ }
  return token
}

export async function disablePush(user, familyId) {
  let token = null
  try { token = localStorage.getItem(TOKEN_KEY) } catch { /* ignora */ }
  try {
    const m = await messaging()
    if (m) {
      const { deleteToken } = await import('firebase/messaging')
      await deleteToken(m)
    }
  } catch { /* ignora */ }
  if (token) await setDoc(doc(db, 'users', user.uid), { fcmTokens: arrayRemove(token) }, { merge: true })
  if (familyId) await setDoc(doc(db, 'families', familyId, 'profiles', user.uid), { pushEnabled: false }, { merge: true })
  try { localStorage.removeItem(TOKEN_KEY) } catch { /* ignora */ }
}

// Chama /api/notify com o login do usuário
export async function sendNotify(payload) {
  const idToken = await auth.currentUser?.getIdToken()
  if (!idToken) throw new Error('Faça login novamente')
  const res = await fetch('/api/notify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
    body: JSON.stringify(payload),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || 'Não foi possível enviar o aviso')
  return data
}
