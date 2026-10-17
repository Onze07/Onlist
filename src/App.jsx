import { useEffect, useState } from 'react'
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
import SupportReply from './components/SupportReply'
import { clearPendingInvite, getPendingInvite } from './lib/invite'
import { toast } from './lib/feedback'

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
  const { familyId, family, loading, userDoc, updateUserDoc, notice, setNotice } = useFamily()
  const hash = useHash()
  const [tab, setTab] = useState('list')
  const [invite, setInvite] = useState(() => getPendingInvite())

  // Avisos da família (troca de família, posse etc.) viram toast
  useEffect(() => {
    if (!notice) return
    toast(notice, { tone: 'ok', duration: 6000 })
    setNotice('')
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

  return (
    <div className="relative">
      <div className="status-bar-bg" aria-hidden="true" />
      <div style={{ display: tab === 'list' ? 'block' : 'none' }}>
        <ActiveList />
      </div>
      {tab === 'catalog' && <Catalog />}
      {tab === 'history' && <History />}
      {tab === 'reports' && <Reports />}
      {tab === 'account' && <Account />}
      <BottomNav tab={tab} setTab={setTab} />
      <InstallBanner />
      {/* Link de convite de outra família aberto por quem já tem uma */}
      {invite && family && family.code !== invite && (
        <SwitchFamilySheet initialCode={invite} onClose={() => setInvite('')} />
      )}
      {userDoc?.supportReply && userDoc.supportReply.seen === false && (
        <SupportReply data={userDoc.supportReply}
          onClose={() => updateUserDoc({ supportReply: { seen: true } }).catch(() => {})} />
      )}
    </div>
  )
}
