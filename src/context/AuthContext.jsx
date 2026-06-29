import { createContext, useContext, useEffect, useState } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { auth } from '../firebase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined)

  useEffect(() => {
    return onAuthStateChanged(auth, setUser)
  }, [])

  return <AuthContext.Provider value={user}>{children}</AuthContext.Provider>
}

export function useAuth() {
  return useContext(AuthContext)
}
