// Notas para ler depois (ex.: emitida em contingência e ainda não enviada à SEFAZ).
// Ficam só neste aparelho, por família.
const KEY = fid => `pendingNfce_${fid}`
const MAX = 20

export function listPendingNotes(fid) {
  try { return JSON.parse(localStorage.getItem(KEY(fid)) || '[]') } catch { return [] }
}

function save(fid, list) {
  try {
    localStorage.setItem(KEY(fid), JSON.stringify(list.slice(0, MAX)))
    window.dispatchEvent(new Event('onlist:pending-notes'))
  } catch { /* ignora */ }
}

export function addPendingNote(fid, { url, key, contingency }) {
  const list = listPendingNotes(fid).filter(n => n.key !== key && n.url !== url)
  save(fid, [{ url, key: key || null, contingency: !!contingency, savedAt: Date.now() }, ...list])
}

export function removePendingNote(fid, keyOrUrl) {
  save(fid, listPendingNotes(fid).filter(n => n.key !== keyOrUrl && n.url !== keyOrUrl))
}

// Chave da nota a partir do link do QR (para saber se é contingência antes de consultar)
export function keyFromUrl(url) {
  try { return (new URL(String(url).trim()).searchParams.get('p') || '').match(/\d{44}/)?.[0] || null } catch { return null }
}

export const isContingencyKey = key => /^\d{44}$/.test(key || '') && key[34] === '9'
