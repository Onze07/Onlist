// Dicas que aparecem uma vez, na hora do uso (sem tutorial). Ficam marcadas no cadastro
// (users/{uid}.tipsSeen) para não repetir em outro aparelho; o localStorage evita repetir
// enquanto a gravação não volta do servidor.
import { deleteField } from 'firebase/firestore'
import { useFamily } from '../context/FamilyContext'

const LOCAL = 'tipsSeen'

function localSeen() {
  try { return JSON.parse(localStorage.getItem(LOCAL)) || {} } catch { return {} }
}

export function useTips() {
  const { userDoc, updateUserDoc } = useFamily()
  const seen = id => !!(userDoc?.tipsSeen?.[id] || localSeen()[id])
  function mark(id) {
    if (seen(id)) return
    try { localStorage.setItem(LOCAL, JSON.stringify({ ...localSeen(), [id]: true })) } catch { /* ignora */ }
    updateUserDoc({ tipsSeen: { [id]: true } }).catch(() => {})
  }
  // Devolve o texto da dica só na primeira vez (e já marca). Para juntar a um aviso existente.
  function take(id, text) {
    if (seen(id)) return ''
    mark(id)
    return text
  }
  function reset() {
    try { localStorage.removeItem(LOCAL) } catch { /* ignora */ }
    return updateUserDoc({ tipsSeen: deleteField() })
  }
  return { seen, mark, take, reset }
}
