import { useCallback, useEffect, useState } from 'react'
import { useAuth } from './context/AuthContext'
import { useFamily } from './context/FamilyContext'
import Login from './pages/Login'
import FamilySetup from './pages/FamilySetup'
import ActiveList from './pages/ActiveList'
import History from './pages/History'
import Catalog from './pages/Catalog'
import Reports from './pages/Reports'
import Account from './pages/Account'
import BottomNav from './components/BottomNav'
import Legal from './pages/Legal'
import LegalConsent from './components/LegalConsent'
import Welcome from './components/Welcome'
import InstallBanner from './components/InstallBanner'
import { LEGAL_VERSION } from './lib/legal'
import SwitchFamilySheet from './components/SwitchFamilySheet'
import { clearPendingInvite, getPendingInvite } from './lib/invite'

function useHash() {
  const [hash, setHash] = useState(window.location.hash)
  useEffect(() => {
    const fn = () => setHash(window.location.hash)
    window.addEventListener('hashchange', fn)
    return () => window.removeEventListener('hashchange', fn)
  }, [])
  return hash
}

export default function App() {
  const user = useAuth()
  const { familyId, family, loading, userDoc, notice, setNotice } = useFamily()
  const hash = useHash()
  const [tab, setTab] = useState('list')
  const [pendingCatalogItem, setPendingCatalogItem] = useState(null)
  const clearPendingCatalogItem = useCallback(() => setPendingCatalogItem(null), [])
  const [invite, setInvite] = useState(() => getPendingInvite())

  // Some sozinho depois de alguns segundos
  useEffect(() => {
    if (!notice) return
    const t = setTimeout(() => setNotice(''), 6000)
    return () => clearTimeout(t)
  }, [notice, setNotice])

  // Abriu o link de convite da própria família: nada a fazer
  useEffect(() => {
    if (invite && family?.code === invite) {
      clearPendingInvite()
      setInvite('')
    }
  }, [invite, family?.code])

  // Páginas legais abrem com ou sem login
  if (hash === '#/privacidade' || hash === '#/termos') return <Legal doc={hash.slice(2)} />

  if (user === undefined || loading) {
    return (
      <div className="flex items-center justify-center min-h-svh bg-gray-900">
        <div className="w-7 h-7 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!user) return <Login />
  if (userDoc?.legalVersion !== LEGAL_VERSION) return <LegalConsent updated={!!userDoc?.legalVersion} />
  if (!familyId) return <FamilySetup />
  if (!userDoc?.onboardedAt) return <Welcome />

  function handleAddToList(item) {
    setPendingCatalogItem(item)
    setTab('list')
  }

  return (
    <div className="relative">
      <div style={{ display: tab === 'list' ? 'block' : 'none' }}>
        <ActiveList
          pendingAddFromCatalog={pendingCatalogItem}
          onCatalogItemHandled={clearPendingCatalogItem}
        />
      </div>
      {tab === 'catalog' && <Catalog onAddToList={handleAddToList} />}
      {tab === 'history' && <History />}
      {tab === 'reports' && <Reports />}
      {tab === 'account' && <Account />}
      <BottomNav tab={tab} setTab={setTab} />
      <InstallBanner />
      {/* Link de convite de outra família aberto por quem já tem uma */}
      {invite && family && family.code !== invite && (
        <SwitchFamilySheet initialCode={invite} onClose={() => setInvite('')} />
      )}
      {notice && (
        <div className="fixed left-4 right-4 z-[60] bg-gray-800 border border-green-500/40 text-green-200 text-sm rounded-xl px-4 py-3 shadow-xl"
          style={{ top: 'max(16px, env(safe-area-inset-top))' }} role="status" onClick={() => setNotice('')}>
          {notice}
        </div>
      )}
    </div>
  )
}
