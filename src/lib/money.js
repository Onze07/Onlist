// Máscara de dinheiro: os dígitos entram pela direita e preenchem os centavos.
// Com 2 casas: "5" → 0,05 · "59" → 0,59 · "599" → 5,99

const MAX_DIGITS = 12

export function textToValue(text, decimals = 2) {
  const digits = String(text ?? '').replace(/\D/g, '').slice(-MAX_DIGITS)
  if (!digits) return 0
  return Number(digits) / 10 ** decimals
}

export function formatMoney(value, decimals = 2) {
  if (!(Number(value) > 0)) return ''
  return Number(value).toLocaleString('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

export function roundTo(value, decimals = 2) {
  const f = 10 ** decimals
  return Math.round((Number(value) || 0) * f) / f
}
