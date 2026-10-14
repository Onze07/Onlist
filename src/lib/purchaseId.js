// Id do registro de compra a partir da lista e dos itens do carrinho (FNV-1a, 2 x 32 bits).
// Mesmo carrinho = mesmo id: finalizar duas vezes regrava o registro em vez de duplicar.
export function purchaseId(listId, entryIds) {
  const text = `${listId}|${[...entryIds].sort().join(',')}`
  let a = 0x811c9dc5, b = 0x01000193 ^ text.length
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i)
    a = Math.imul(a ^ c, 0x01000193) >>> 0
    b = Math.imul(b ^ c, 0x5bd1e995) >>> 0
  }
  return `c_${a.toString(36)}${b.toString(36)}`
}
