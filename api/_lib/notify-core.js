// Regras do envio de avisos. Recebe um "db" mínimo (get de documentos) para poder ser testado sem Firebase.
export const TYPES = ['list', 'shopping']
const LIST_COOLDOWN_MS = 60 * 1000
const SHOPPING_COOLDOWN_MS = 30 * 60 * 1000

function firstName(name) {
  return String(name || 'Alguém').trim().split(/\s+/)[0]
}

function clean(text, max) {
  return String(text || '').replace(/\s+/g, ' ').trim().slice(0, max)
}

// db: { get(path) -> { exists, data } | null }
// Retorna { status, error } ou { status: 200, targets, tokens: [{uid, token}], payload, logPath, withoutDevice }
export async function planNotification({ db, uid, body, now = Date.now() }) {
  const { familyId, type, to, listName, count, message } = body || {}
  if (!familyId || typeof familyId !== 'string' || !TYPES.includes(type)) {
    return { status: 400, error: 'Pedido inválido' }
  }

  const family = await db.get(`families/${familyId}`)
  const members = family?.exists ? family.data.members || [] : []
  if (!members.includes(uid)) return { status: 403, error: 'Você não é membro desta família' }

  const others = members.filter(m => m !== uid)
  const targets = type === 'list'
    ? [...new Set(Array.isArray(to) ? to : [])].filter(t => others.includes(t))
    : others
  if (targets.length === 0) return { status: 400, error: 'Escolha ao menos uma pessoa da família' }

  // Limite de frequência por remetente
  const logPath = `notifyLog/${familyId}_${uid}`
  const log = await db.get(logPath)
  const last = log?.exists ? log.data[type] || 0 : 0
  const cooldown = type === 'list' ? LIST_COOLDOWN_MS : SHOPPING_COOLDOWN_MS
  if (now - last < cooldown) return { status: 429, error: 'Aviso enviado há pouco. Aguarde um instante.' }

  const sender = await db.get(`families/${familyId}/profiles/${uid}`)
  const who = firstName(sender?.exists ? sender.data.name : '')
  const list = clean(listName, 60) || 'lista de compras'
  const n = Number(count) || 0

  const payload = type === 'list'
    ? {
        title: `🛒 ${who} pediu uma compra`,
        body: clean(message, 200) || `${n > 0 ? `${n} ${n === 1 ? 'item' : 'itens'} para comprar` : 'Tem compra para fazer'} em "${list}".`,
        tag: `list-${familyId}`,
      }
    : {
        title: `🛒 ${who} está no mercado`,
        body: `Comprando "${list}". Precisa de algo? Adicione na lista agora.`,
        tag: `shopping-${familyId}-${uid}`,
      }
  payload.url = '/'

  const tokens = []
  const withoutDevice = []
  for (const t of targets) {
    const user = await db.get(`users/${t}`)
    const data = user?.exists ? user.data : {}
    if (type === 'shopping' && data.notifyShopping === false) continue
    const list = Array.isArray(data.fcmTokens) ? data.fcmTokens : []
    if (list.length === 0) withoutDevice.push(t)
    list.forEach(token => tokens.push({ uid: t, token }))
  }

  return { status: 200, targets, tokens, payload, logPath, withoutDevice }
}
