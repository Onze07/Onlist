// Calculadora "qual compensa": preço por kg, litro ou unidade
export const CALC_UNITS = [
  { id: 'un', label: 'un', base: 'un', factor: 1 },
  { id: 'kg', label: 'kg', base: 'kg', factor: 1 },
  { id: 'g', label: 'g', base: 'kg', factor: 0.001 },
  { id: 'l', label: 'L', base: 'l', factor: 1 },
  { id: 'ml', label: 'ml', base: 'l', factor: 0.001 },
]

const BASE_LABEL = { un: 'un', kg: 'kg', l: 'L' }

// rows: [{ price, qty, unit }] -> { rows: [{ per, base, baseLabel, best, extraPct }], mixed }
// per = preço por kg/L/un; extraPct = quanto essa opção sai mais cara que a melhor (0,18 = 18%)
export function compareUnitPrices(rows) {
  const calc = rows.map(r => {
    const u = CALC_UNITS.find(x => x.id === r.unit) || CALC_UNITS[0]
    const amount = (Number(r.qty) || 0) * u.factor
    const price = Number(r.price) || 0
    const per = price > 0 && amount > 0 ? price / amount : null
    return { ...r, per, base: u.base, baseLabel: BASE_LABEL[u.base] }
  })
  const valid = calc.filter(r => r.per !== null)
  const mixed = new Set(valid.map(r => r.base)).size > 1
  const bestPer = valid.length >= 2 && !mixed ? Math.min(...valid.map(r => r.per)) : null
  return {
    mixed,
    rows: calc.map(r => ({
      ...r,
      best: bestPer !== null && r.per !== null && Math.abs(r.per - bestPer) < 1e-9,
      extraPct: bestPer !== null && r.per !== null ? r.per / bestPer - 1 : null,
    })),
  }
}
