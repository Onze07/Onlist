import { useCallback, useState } from 'react'
import { useAuth } from './context/AuthContext'
import { useFamily } from './context/FamilyContext'
import Login from './pages/Login'
import FamilySetup from './pages/FamilySetup'
import ActiveList from './pages/ActiveList'
import History from './pages/History'
import Catalog from './pages/Catalog'
import Reports from './pages/Reports'
import BottomNav from './components/BottomNav'

export default function App() {
  const user = useAuth()
  const { familyId, loading } = useFamily()
  const [tab, setTab] = useState('list')
  const [pendingCatalogItem, setPendingCatalogItem] = useState(null)
  const clearPendingCatalogItem = useCallback(() => setPendingCatalogItem(null), [])

  if (user === undefined || loading) {
    return (
      <div className="flex items-center justify-center min-h-svh bg-gray-900">
        <div className="w-7 h-7 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!user) return <Login />
  if (!familyId) return <FamilySetup />

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
      <BottomNav tab={tab} setTab={setTab} />
    </div>
  )
}
