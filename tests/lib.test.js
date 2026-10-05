// Roda com: npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { textToValue, formatMoney, roundTo } from '../src/lib/money.js'
import { latestByMarket, cheapest, trend, compareList, marketKey } from '../src/lib/prices.js'
import { rangeFor, previousRange, inRange } from '../src/lib/period.js'

// --- Dinheiro ---

test('máscara: dígitos preenchem os centavos (2 casas)', () => {
  assert.equal(textToValue('5', 2), 0.05)
  assert.equal(textToValue('59', 2), 0.59)
  assert.equal(textToValue('599', 2), 5.99)
  assert.equal(textToValue('1.234,56', 2), 1234.56)
})

test('máscara: 3 casas', () => {
  assert.equal(textToValue('5990', 3), 5.99)
  assert.equal(textToValue('12345', 3), 12.345)
})

test('máscara: apagar e colar', () => {
  // Exibe "5,99"; apagar o último caractere deixa "5,9" -> 0,59
  assert.equal(textToValue('5,9', 2), 0.59)
  assert.equal(textToValue('', 2), 0)
  assert.equal(textToValue('R$ 5,99', 2), 5.99)
})

test('formatação pt-BR', () => {
  assert.equal(formatMoney(5.99, 2), '5,99')
  assert.equal(formatMoney(5.99, 3), '5,990')
  assert.equal(formatMoney(1234.5, 2), '1.234,50')
  assert.equal(formatMoney(0, 2), '')
  assert.equal(roundTo(2.345, 2), 2.35)
})

// --- Preços ---

const arroz = [
  { price: 20, date: '2026-06-29', mercado: 'Irmãos Gonçalves' },
  { price: 19.55, date: '2026-07-01', mercado: 'irmãos  gonçalves ' },
  { price: 21.9, date: '2026-07-05', mercado: 'Atacadão' },
  { price: 18, date: '2026-07-06', mercado: 'Não informado' },
  { price: 17, date: '2026-07-07' },
]

test('último preço por mercado, unificando nomes e ignorando "Não informado"', () => {
  const r = latestByMarket(arroz)
  assert.equal(r.length, 2)
  assert.equal(marketKey(r[0].mercado), 'irmãos gonçalves')
  assert.equal(r[0].price, 19.55)
  assert.equal(r[1].mercado, 'Atacadão')
  assert.equal(cheapest(arroz).price, 19.55)
})

test('tendência entre as duas últimas compras', () => {
  const t = trend(arroz)
  // "Não informado" conta como compra para tendência; só não entra na comparação entre mercados
  assert.equal(t.prev.price, 21.9)
  assert.equal(t.last.price, 18)
  assert.ok(t.diff < 0)
  assert.equal(trend([arroz[0]]), null)
})

test('comparar lista entre mercados', () => {
  const catalog = {
    arroz: { priceHistory: [
      { price: 20, date: '2026-07-01', mercado: 'A' },
      { price: 22, date: '2026-07-01', mercado: 'B' },
    ] },
    banana: { priceHistory: [{ price: 6, date: '2026-07-01', mercado: 'A' }] },
  }
  const entries = [{ name: 'Arroz', qty: 2 }, { name: 'Banana', qty: 1.5 }, { name: 'Sabão', qty: 1 }]
  const r = compareList(entries, catalog)
  assert.equal(r[0].mercado, 'A')
  assert.equal(r[0].total, 49)
  assert.equal(r[0].coveredCount, 2)
  assert.deepEqual(r[0].missing, ['Sabão'])
  assert.equal(r[1].mercado, 'B')
  assert.equal(r[1].total, 44)
  assert.deepEqual(r[1].missing, ['Banana', 'Sabão'])
})

// --- Período ---

test('este mês e mês passado, com virada de ano', () => {
  const now = new Date(2026, 0, 15)
  const m = rangeFor('month', now)
  assert.equal(m.start.getTime(), new Date(2026, 0, 1).getTime())
  assert.equal(m.end.getTime(), new Date(2026, 1, 1).getTime())
  const lm = rangeFor('lastMonth', now)
  assert.equal(lm.start.getTime(), new Date(2025, 11, 1).getTime())
  assert.equal(lm.end.getTime(), new Date(2026, 0, 1).getTime())
})

test('período anterior equivalente', () => {
  const r3 = rangeFor('3m', new Date(2026, 1, 10))
  const p = previousRange(r3)
  assert.equal(p.start.getTime(), new Date(2025, 8, 1).getTime())
  assert.equal(p.end.getTime(), new Date(2025, 11, 1).getTime())
  const c = rangeFor('custom', new Date(), { from: '2026-03-10', to: '2026-03-19' })
  const pc = previousRange(c)
  assert.equal(pc.start.getTime(), new Date(2026, 2, 0).getTime())
  assert.equal(pc.end.getTime(), new Date(2026, 2, 10).getTime())
})

test('filtro por período', () => {
  const r = rangeFor('month', new Date(2026, 9, 3))
  assert.ok(inRange(new Date(2026, 9, 31, 23, 59), r))
  assert.ok(!inRange(new Date(2026, 10, 1), r))
  assert.ok(inRange({ toDate: () => new Date(2026, 9, 1) }, r))
  assert.ok(!inRange(null, r))
})

// --- Limite do histórico de preço ---
import { trimPriceHistory, PRICE_HISTORY_MAX } from '../src/lib/prices.js'

test('histórico de preço: abaixo do limite usa arrayUnion (null), no limite corta os antigos', () => {
  const entry = { price: 9, date: '2026-12-31', mercado: 'IG' }
  assert.equal(trimPriceHistory([], entry), null)
  const full = Array.from({ length: PRICE_HISTORY_MAX }, (_, i) => ({ price: 1, date: `2026-01-${String(i % 28 + 1).padStart(2, '0')}`, mercado: `M${i}` }))
  const r = trimPriceHistory(full, entry)
  assert.equal(r.length, PRICE_HISTORY_MAX)
  assert.deepEqual(r[r.length - 1], entry)
})

// --- Calculadora "qual compensa" ---
import { compareUnitPrices } from '../src/lib/unitPrice.js'

test('calculadora: compara por kg mesmo com gramas e quilos', () => {
  const r = compareUnitPrices([{ price: 5, qty: 500, unit: 'g' }, { price: 9, qty: 1, unit: 'kg' }])
  assert.equal(r.rows[0].per, 10)
  assert.equal(r.rows[1].per, 9)
  assert.equal(r.rows[1].best, true)
  assert.ok(Math.abs(r.rows[0].extraPct - 1 / 9) < 1e-9)
  assert.equal(r.mixed, false)
})

test('calculadora: medidas diferentes não elegem vencedor; linha vazia é ignorada', () => {
  const r = compareUnitPrices([{ price: 5, qty: 1, unit: 'kg' }, { price: 4, qty: 1, unit: 'l' }])
  assert.equal(r.mixed, true)
  assert.equal(r.rows.some(x => x.best), false)
  const r2 = compareUnitPrices([{ price: 5, qty: 2, unit: 'un' }, { price: 0, qty: 1, unit: 'un' }])
  assert.equal(r2.rows[0].best, false) // só uma opção preenchida
  assert.equal(r2.rows[1].per, null)
})
