import { getAdditionalUserInfo, signInWithPopup, updateProfile } from 'firebase/auth'
import { auth, googleProvider } from '../firebase'

function OnlistLogo({ size = 80 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#F9D14C"/>
          <stop offset="100%" stopColor="#48BF91"/>
        </linearGradient>
      </defs>
      <rect width="512" height="512" rx="110" ry="110" fill="url(#bgGrad)"/>
      <circle cx="256" cy="256" r="148" fill="#F9D14C"/>
      <circle cx="256" cy="256" r="148" fill="none" stroke="#3aad7a" strokeWidth="28"/>
      <polyline points="158,258 228,328 360,180"
        fill="none" stroke="white" strokeWidth="54"
        strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

export default function Login() {
  async function handleLogin() {
    try {
      const result = await signInWithPopup(auth, googleProvider)
      // Foto e nome atuais do Google (o Firebase guarda os do primeiro login)
      const profile = getAdditionalUserInfo(result)?.profile
      if (profile?.picture && profile.picture !== result.user.photoURL) {
        await updateProfile(result.user, { photoURL: profile.picture }).catch(() => {})
      }
    } catch (e) {
      alert('Erro ao entrar: ' + e.message)
    }
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-svh bg-gray-900 px-6">
      <OnlistLogo size={88} />
      <h1 className="text-3xl font-bold text-white mt-5 mb-1 tracking-tight">onlist</h1>
      <p className="text-gray-400 text-sm mb-12 text-center">
        Lista de compras compartilhada da família
      </p>
      <button
        onClick={handleLogin}
        className="flex items-center gap-3 bg-white text-gray-800 font-medium px-6 py-3.5 rounded-xl w-full max-w-xs justify-center shadow-lg active:scale-95 transition-transform"
      >
        <img src="https://www.google.com/favicon.ico" alt="" className="w-5 h-5" />
        Entrar com Google
      </button>
      <p className="text-gray-500 text-xs text-center mt-6 max-w-xs leading-relaxed">
        Ao entrar, você concorda com os <a href="#/termos" className="text-gray-300 underline">Termos de Uso</a> e
        a <a href="#/privacidade" className="text-gray-300 underline">Política de Privacidade</a>.
      </p>
    </div>
  )
}
