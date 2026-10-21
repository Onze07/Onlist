import { initializeApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider } from 'firebase/auth'
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore'
import { initializeAppCheck, ReCaptchaEnterpriseProvider, getToken } from 'firebase/app-check'
import { firebaseConfig } from './firebaseConfig'

const app = initializeApp(firebaseConfig)

// App Check: prova para o Firebase e para o nosso servidor que a chamada vem deste app.
// Só liga com a chave do reCAPTCHA Enterprise (VITE_RECAPTCHA_SITE_KEY na Vercel).
const siteKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY
export const appCheck = siteKey
  ? initializeAppCheck(app, { provider: new ReCaptchaEnterpriseProvider(siteKey), isTokenAutoRefreshEnabled: true })
  : null

// Cabeçalho para o /api (vazio sem App Check ou se o token falhar: o servidor decide)
export async function appCheckHeader() {
  if (!appCheck) return {}
  try {
    const { token } = await getToken(appCheck)
    return token ? { 'X-Firebase-AppCheck': token } : {}
  } catch { return {} }
}
export const auth = getAuth(app)
// Cache local persistente: o app funciona sem internet e sincroniza quando a conexão volta
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
})
export const googleProvider = new GoogleAuthProvider()
