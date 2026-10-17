// Ordem dos itens dentro da categoria (arrastar e soltar).
// Sem "order" gravado, vale a hora em que o item foi criado (itens novos vão para o fim).
export function sortKey(e) {
  if (typeof e?.order === 'number') return e.order
  const t = e?.createdAt?.toMillis?.() ?? (e?.createdAt instanceof Date ? e.createdAt.getTime() : null)
  return t ?? Number.MAX_SAFE_INTEGER / 2
}

export function sortEntries(list) {
  return [...list].sort((a, b) => sortKey(a) - sortKey(b))
}

// Novo "order" para soltar antes de `beforeId` (null = no fim) numa categoria já ordenada,
// sem o item arrastado. Fica entre os vizinhos, então só ele é regravado.
export function dropOrder(items, beforeId) {
  const idx = beforeId == null ? items.length : items.findIndex(e => e.id === beforeId)
  const at = idx < 0 ? items.length : idx
  const prev = items[at - 1]
  const next = items[at]
  if (!prev && !next) return Date.now()
  if (!prev) return sortKey(next) - 1000
  if (!next) return sortKey(prev) + 1000
  return (sortKey(prev) + sortKey(next)) / 2
}
