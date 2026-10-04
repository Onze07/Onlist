// Leitura da NFC-e e correspondência com o catálogo
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parseNfce, isCaptchaPage, extractCaptcha, validNfceUrl, brNumber, ufOffset } from '../api/_lib/nfce-parse.js'
import { mapUnit, packSize, convertForUnit, suggestTarget, genericName, marketName } from '../src/lib/nfceMatch.js'

const html = readFileSync(new URL('./fixtures/nfce-ro.html', import.meta.url), 'utf8')

test('lê itens, mercado, data, total e chave', () => {
  const n = parseNfce(html)
  assert.equal(n.store, 'IRMAOS GONCALVES COMERCIO E INDUSTRIA LTDA')
  assert.equal(n.cnpj, '04082624003767')
  assert.equal(n.issuedAt, '2026-10-03T11:38:07-04:00')
  assert.equal(n.total, 13.7)
  assert.equal(n.key, '11261004082624003767650140002515281350930174')
  assert.equal(n.items.length, 2)
  assert.deepEqual(n.items[0], { name: 'BANANA MACA RG', code: '2805678013981', qty: 1.398, unit: 'KG', unitPrice: 6.98, total: 9.76 })
  assert.equal(n.items[1].unit, 'PACOTE')
  assert.equal(n.items[1].total, 3.94)
})

test('não guarda CPF', () => {
  assert.ok(!JSON.stringify(parseNfce(html)).includes('73'.padStart(14, '*')))
  assert.ok(!('cpf' in parseNfce(html)))
})

test('captcha', () => {
  const page = '<form id="form_nfce" action="dados_nfce.jsp" method="POST"><img src="data:image/png;base64,AAAA" /><input name="sefin_response"><input type="hidden" id="csrf_token" name="csrf_token" value="abc123"></form><p>Por favor preencha o captcha</p>'
  assert.ok(isCaptchaPage(page))
  assert.ok(!isCaptchaPage(html))
  assert.deepEqual(extractCaptcha(page), { image: 'data:image/png;base64,AAAA', csrf: 'abc123', action: 'dados_nfce.jsp' })
})

test('valida link do QR', () => {
  const ok = validNfceUrl('http://www.nfce.sefin.ro.gov.br/consultanfce/consulta.jsp?p=11261004082624003767650140002515281350930174|2|1|4|EFDE7462C45D1BB03AAF927C4ACB8D10770ACB88')
  assert.equal(ok.key, '11261004082624003767650140002515281350930174')
  assert.equal(ok.uf, '11')
  assert.equal(validNfceUrl('https://evil.com/consulta.jsp?p=11261004082624003767650140002515281350930174'), null)
  assert.equal(validNfceUrl('não é link'), null)
  assert.equal(brNumber('1.234,56'), 1234.56)
})

test('unidades da nota', () => {
  assert.equal(mapUnit('KG'), 'kg')
  assert.equal(mapUnit('PACOTE'), 'pct')
  assert.equal(mapUnit('CX'), 'cx')
  assert.equal(mapUnit('BLISTER'), 'bl')
  assert.equal(mapUnit('LT'), 'l')
  assert.equal(mapUnit('xyz'), 'un')
})

test('tamanho da embalagem e conversão', () => {
  assert.deepEqual(packSize('ARROZ T1 TIO JOAO 5KG'), { amount: 5, unit: 'kg' })
  assert.deepEqual(packSize('CAFE PILAO 500G'), { amount: 500, unit: 'g' })
  const arroz = { name: 'ARROZ T1 TIO JOAO 5KG', qty: 2, unit: 'UN', unitPrice: 25 }
  assert.deepEqual(convertForUnit(arroz, 'kg'), { qty: 10, unitPrice: 5, unit: 'kg', converted: true })
  const cafe = { name: 'CAFE PILAO 500G', qty: 1, unit: 'PCT', unitPrice: 18 }
  assert.deepEqual(convertForUnit(cafe, 'kg'), { qty: 0.5, unitPrice: 36, unit: 'kg', converted: true })
  const banana = { name: 'BANANA MACA RG', qty: 1.398, unit: 'KG', unitPrice: 6.98 }
  assert.equal(convertForUnit(banana, 'kg').converted, false)
})

test('sugere mesclar com produto genérico existente', () => {
  const catalog = [{ id: 'arroz', name: 'Arroz', unit: 'kg' }, { id: 'banana', name: 'Banana', unit: 'kg' }, { id: 'feijao', name: 'Feijão' }]
  const s = suggestTarget({ name: 'ARROZ T1 TIO JOAO 5KG', code: '789' }, catalog)
  assert.equal(s.type, 'existing')
  assert.equal(s.item.id, 'arroz')
  assert.equal(suggestTarget({ name: 'BANANA MACA RG' }, catalog).item.id, 'banana')
  const novo = suggestTarget({ name: 'ESPONJA ALKLIN MULT DUPLA FAC 3 UND' }, catalog)
  assert.equal(novo.type, 'new')
  assert.equal(novo.name, 'Esponja')
})

test('lembra a escolha pelo código do produto', () => {
  const catalog = [{ id: 'arroz', name: 'Arroz' }, { id: 'esp', name: 'Esponja de louça' }]
  const s = suggestTarget({ name: 'ESPONJA ALKLIN MULT', code: '7897750771761' }, catalog, { 7897750771761: { catalogId: 'esp' } })
  assert.equal(s.item.id, 'esp')
  assert.equal(s.reason, 'lembrado')
})

test('nome do mercado', () => {
  assert.equal(marketName('IRMAOS GONCALVES COMERCIO E INDUSTRIA LTDA', ['Irmãos Gonçalves', 'Atacadão']), 'Irmãos Gonçalves')
  assert.equal(marketName('SUPERMERCADO BOM PRECO LTDA', []), 'Bom Preco')
  assert.equal(genericName('PAO FRANCES KG'), 'Pao')
})

test('fuso do estado pela chave', () => {
  assert.equal(ufOffset('11261004082624003767650140002515281350930174'), '-04:00')
  assert.equal(ufOffset('35261004082624003767650140002515281350930174'), '-03:00')
  assert.equal(ufOffset('12261004082624003767650140002515281350930174'), '-05:00')
})
