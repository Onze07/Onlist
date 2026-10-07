import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth'
import '../index.css'
import { adminAuth, adminProvider, adminApi } from './firebase'
import AdminPanel from './AdminPanel'

function Center({ children }) {
  return <div className="min-h-svh bg-gray-950 flex items-center justify-center px-6">{children}</div>
}

function AdminRoot() {
  const [user, setUser] = useState(undefined)
  const [allowed, setAllowed] = useState(undefined)
  const [error, setError] = useState('')

  useEffect(() => onAuthStateChanged(adminAuth, u => {
    setUser(u)
    setAllowed(undefined)
    if (u) adminApi('whoami').then(r => setAllowed(!!r.admin)).catch(e => { setError(e.message); setAllowed(false) })
  }), [])

  async function login() {
    setError('')
    try { await signInWithPopup(adminAuth, adminProvider) } catch (e) {
      if (e.code !== 'auth/popup-closed-by-user') setError(e.message)
    }
  }

  if (user === undefined || (user && allowed === undefined)) {
    return <Center><div className="w-7 h-7 border-2 border-green-500 border-t-transparent rounded-full animate-spin" /></Center>
  }

  if (!user || !allowed) {
    return (
      <Center>
        <div className="w-full max-w-sm bg-gray-900 border border-gray-800 rounded-3xl p-8 text-center">
          <img src="/favicon.svg" alt="" className="w-12 h-12 mx-auto mb-4" />
          <h1 className="text-white text-xl font-semibold">Painel Onlist</h1>
          <p className="text-gray-500 text-sm mt-1 mb-6">Área administrativa</p>
          {user && !allowed && (
            <p className="text-amber-300 text-sm bg-amber-500/10 border border-amber-500/30 rounded-xl px-3 py-2 mb-4">
              {user.email} não tem acesso ao painel.
            </p>
          )}
          {error && <p className="text-red-300 text-sm mb-4">{error}</p>}
          {user ? (
            <button onClick={() => signOut(adminAuth)} className="w-full bg-gray-800 border border-gray-700 text-white font-medium py-3 rounded-xl">
              Entrar com outra conta
            </button>
          ) : (
            <button onClick={login} className="w-full bg-white text-gray-900 font-semibold py-3 rounded-xl">
              Entrar com Google
            </button>
          )}
        </div>
      </Center>
    )
  }

  return <AdminPanel user={user} onSignOut={() => signOut(adminAuth)} />
}

createRoot(document.getElementById('root')).render(<StrictMode><AdminRoot /></StrictMode>)
