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

// --- Itens da nota sem acompanhar preço ---
import { historyCsv } from '../src/lib/csv.js'

test('planilha: itens sem acompanhar preço entram para somar o total pago', () => {
  const csv = historyCsv([{
    createdAt: { toDate: () => new Date(2026, 9, 10) }, mercado: 'Tradição', listName: 'Nota fiscal', total: 43.94,
    items: [{ name: 'Panettone', qty: 1, unit: 'un', pricePerUnit: 15.99, totalPrice: 15.99, category: 'Padaria' }],
    otherItems: [{ name: 'GRANULADO CAMPILA', qty: 2, unit: 'un', totalPrice: 13.98 }],
  }])
  const lines = csv.replace('﻿', '').split('\r\n')
  assert.equal(lines.length, 3)
  assert.ok(lines[2].includes('GRANULADO CAMPILA;Sem acompanhamento;2;un;6,99;13,98'))
})

// --- Categorias ---
import { CATEGORIES, suggestCategory, orderCategories } from '../src/lib/categories.js'

test('categorias: sugestão pelo nome do produto (nomes reais de nota)', () => {
  const cases = {
    'DIPIRONA 500MG': 'Farmácia', 'OLEO MOTOR 5W30': 'Automotivo', 'OLEO DE SOJA SOYA 900ML': 'Mercearia',
    'BATATA PALITO CONGELADA': 'Congelados', 'BATATA INGLESA KG': 'Hortifruti', 'FRALDA PAMPERS M': 'Bebê',
    'RACAO GOLDEN 15KG': 'Pet', 'FILME PVC ROLO WYDA 15': 'Casa e Utilidades', 'ASSADEIRA OVAL OPALINE 1L': 'Casa e Utilidades',
    'ESPONJA ALKLIN MULT DUPLA FAC 3 UND': 'Limpeza', 'BANANA MACA RG': 'Hortifruti', 'MACARRAO ESPAGUETE': 'Mercearia',
    'Pão francês': 'Padaria', 'LEITE INTEGRAL': 'Laticínios', 'REFRIGERANTE COCA COLA 2L': 'Bebidas',
  }
  for (const [name, cat] of Object.entries(cases)) assert.equal(suggestCategory(name), cat, name)
  assert.equal(suggestCategory('BERMUDA JEANS'), null)
  assert.ok(Object.values(cases).every(c => CATEGORIES.includes(c)))
})

test('categorias: ordem do mercado e categoria antiga não some', () => {
  assert.deepEqual(orderCategories(['Outros', 'Farmácia', 'Hortifruti', 'Frios']), ['Hortifruti', 'Farmácia', 'Frios', 'Outros'])
})

test('id da compra: mesmo carrinho = mesmo id, qualquer ordem', async () => {
  const { purchaseId } = await import('../src/lib/purchaseId.js')
  assert.equal(purchaseId('l1', ['b', 'a']), purchaseId('l1', ['a', 'b']))
  assert.notEqual(purchaseId('l1', ['a', 'b']), purchaseId('l1', ['a', 'c']))
  assert.notEqual(purchaseId('l1', ['a']), purchaseId('l2', ['a']))
  assert.match(purchaseId('l1', ['a']), /^c_[0-9a-z]+$/)
})

test('preço fora da curva e remoção do preço de uma compra', async () => {
  const { trend, withoutPurchase, lastPriceOf } = await import('../src/lib/prices.js')
  const leite = [
    { price: 6.37, date: '2026-10-05', mercado: 'Irmãos Gonçalves' },
    { price: 34.39, date: '2026-10-12', mercado: 'Irmãos Gonçalves' },
  ]
  assert.equal(trend(leite).outlier, true)
  assert.equal(trend([{ price: 17.49, date: '2026-09-01', mercado: 'A' }, { price: 8, date: '2026-09-26', mercado: 'A' }]).outlier, false)

  const r = withoutPurchase(leite, { price: 34.39, mercado: ' irmãos  gonçalves ', date: '2026-10-12' })
  assert.equal(r.removed.length, 1)
  assert.equal(r.history.length, 1)
  assert.equal(lastPriceOf(r.history), 6.37)
  // Compra finalizada perto da meia-noite: aceita 1 dia de diferença
  assert.equal(withoutPurchase(leite, { price: 34.39, mercado: 'Irmãos Gonçalves', date: '2026-10-13' }).removed.length, 1)
  // Outro mercado ou outro preço: não mexe
  assert.equal(withoutPurchase(leite, { price: 34.39, mercado: 'IG', date: '2026-10-12' }).removed.length, 0)
  assert.equal(withoutPurchase(leite, { price: 30, mercado: 'Irmãos Gonçalves', date: '2026-10-12' }).removed.length, 0)
  assert.equal(lastPriceOf([]), null)
})

test('preços de uma compra: acha no catálogo pela data, mercado e preço', async () => {
  const { pricesOfPurchase } = await import('../src/lib/prices.js')
  const catalog = {
    leite: { priceHistory: [
      { price: 6.37, date: '2026-10-05', mercado: 'IG' },
      { price: 34.39, date: '2026-10-12', mercado: 'IG' },
    ] },
    arroz: { priceHistory: [{ price: 6, date: '2026-10-01', mercado: 'IG' }] },
  }
  const record = {
    mercado: 'IG',
    createdAt: { toDate: () => new Date('2026-10-12T15:00:00') },
    items: [
      { name: 'Leite', pricePerUnit: 34.39 },
      { name: 'Arroz', pricePerUnit: 6 },     // preço de outra data: não mexe
      { name: 'Pão', pricePerUnit: 1 },       // fora do catálogo
      { name: 'Sal', pricePerUnit: 0 },
    ],
  }
  const out = pricesOfPurchase(record, catalog)
  assert.equal(out.length, 1)
  assert.equal(out[0].key, 'leite')
  assert.equal(out[0].removed[0].price, 34.39)
  assert.equal(out[0].lastPrice, 6.37)
})

test('ordem ao arrastar: entre vizinhos, início e fim', async () => {
  const { dropOrder, sortEntries, sortKey } = await import('../src/lib/reorder.js')
  const items = sortEntries([
    { id: 'b', order: 2000 },
    { id: 'a', createdAt: { toMillis: () => 1000 } },
    { id: 'c', order: 3000 },
  ])
  assert.deepEqual(items.map(e => e.id), ['a', 'b', 'c'])
  assert.equal(dropOrder(items, 'b'), 1500)          // entre a e b
  assert.equal(dropOrder(items, 'a'), 0)             // antes do primeiro
  assert.equal(dropOrder(items, null), 4000)         // no fim
  assert.equal(dropOrder([], null) > 0, true)        // categoria vazia
  assert.equal(sortKey({ order: 5 }), 5)
})
