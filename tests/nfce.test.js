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

// --- Conciliação com compras manuais ---
import { findSimilarPurchases } from '../src/lib/nfceMatch.js'

const nfNota = {
  store: 'IRMAOS GONCALVES COMERCIO E INDUSTRIA LTDA', total: 13.7, issuedAt: '2026-10-03T11:38:07-04:00',
  items: [{ name: 'BANANA MACA RG' }, { name: 'ESPONJA ALKLIN MULT DUPLA FAC 3 UND' }],
}

test('encontra a compra manual da mesma ida ao mercado', () => {
  const records = [
    { id: 'manual', createdAt: new Date('2026-10-03T12:10:00-04:00'), mercado: 'Irmãos Gonçalves', total: 13.7, items: [{ name: 'Banana' }, { name: 'Esponja' }] },
    { id: 'outra-semana', createdAt: new Date('2026-09-26T10:00:00-04:00'), mercado: 'Irmãos Gonçalves', total: 13.7, items: [] },
    { id: 'ja-nota', createdAt: new Date('2026-10-03T12:00:00-04:00'), mercado: 'Irmãos Gonçalves', total: 13.7, nfceKey: 'x', items: [] },
    { id: 'outro-mercado', createdAt: new Date('2026-10-03T18:00:00-04:00'), mercado: 'Atacadão', total: 250, items: [{ name: 'Carne' }] },
  ]
  const r = findSimilarPurchases(nfNota, records)
  assert.deepEqual(r.map(x => x.record.id), ['manual'])
  assert.ok(r[0].strong)
})

test('total parecido em mercado diferente ainda sugere, mas sem certeza', () => {
  const r = findSimilarPurchases(nfNota, [{ id: 'a', createdAt: new Date('2026-10-04T09:00:00-04:00'), mercado: 'Não informado', total: 14.5, items: [] }])
  assert.equal(r.length, 1)
  assert.equal(r[0].strong, false)
})

test('itens em comum em outro dia e outro mercado não sugerem', () => {
  const r = findSimilarPurchases(nfNota, [{ id: 'atac', createdAt: new Date('2026-10-02T10:00:00-04:00'), mercado: 'Atacadão', total: 158.9, items: [{ name: 'Banana' }] }])
  assert.equal(r.length, 0)
})

// --- Nota ainda não disponível / contingência ---
import { keyInfo, classifyPage, notFoundMessage } from '../api/_lib/nfce-parse.js'

test('chave de acesso: identifica contingência pelo tipo de emissão (35º dígito)', () => {
  const normal = '11261004082624003767650140002515281350930174'
  const conting = normal.slice(0, 34) + '9' + normal.slice(35)
  assert.equal(keyInfo(normal).contingency, false)
  assert.equal(keyInfo(normal).number, 251528)
  assert.equal(keyInfo(normal).cnpj, '04082624003767')
  assert.equal(keyInfo(conting).contingency, true)
  assert.equal(keyInfo('123'), null)
})

test('página sem itens: classifica o motivo e sugere tentar depois', () => {
  assert.equal(classifyPage('<p>NFC-e não encontrada na base de dados</p>'), 'not_found')
  assert.equal(classifyPage('<div>Nota fiscal ainda não autorizada</div>'), 'not_found')
  assert.equal(classifyPage('<b>NFC-e CANCELADA</b>'), 'canceled')
  assert.equal(classifyPage('<p>Chave de acesso inválida</p>'), 'invalid')
  assert.equal(classifyPage('<p>Outra coisa</p>'), null)
  // Textos reais da SEFAZ-RO
  assert.equal(classifyPage('<td colspan="2"> Documento Fiscal (NFC-e) Inexistente na Base de Dados da Sefaz. </td>'), 'not_found')
  assert.equal(classifyPage('<p>O sistema detectou um comportamento anormal, e por isso a consulta não foi efetuada. Por Favor, tente mais tarde!</p><p>Cod: CSRF_ERROR_01</p>'), 'blocked')
  assert.match(notFoundMessage('blocked', {}).error, /alguns minutos/)
  assert.equal(notFoundMessage('not_found', { contingency: true }).retryLater, true)
  assert.match(notFoundMessage('not_found', { contingency: true }).error, /contingência/)
  assert.equal(notFoundMessage(null, { contingency: false }).retryLater, true)
  assert.equal(notFoundMessage('canceled', {}).retryLater, false)
})

// --- Chave digitada ---
import { accessKeyDv, parseAccessKey, keyConsultUrls } from '../api/_lib/nfce-parse.js'

test('chave digitada: confere o dígito verificador com chaves reais', () => {
  for (const k of ['11261010581332000160651110000118871999881120', '11261079379491010499650060001266681902009260', '11261004082624003767650140002515281350930174']) {
    assert.equal(accessKeyDv(k.slice(0, 43)), Number(k[43]))
    assert.equal(parseAccessKey(k).key, k)
  }
  // Com espaços, como impressa no cupom
  assert.equal(parseAccessKey('1126 1010 5813 3200 0160 6511 1000 0118 8719 9988 1120').key, '11261010581332000160651110000118871999881120')
  // Um número trocado
  assert.match(parseAccessKey('11261010581332000160651110000118871999881121').error, /digitado errado/)
  assert.match(parseAccessKey('1126 1010').error, /44 números/)
  // Modelo 55 (NF-e de empresa) não é cupom
  const nfe = '1126101058133200016055111000011887199988112'
  assert.match(parseAccessKey(nfe + accessKeyDv(nfe)).error, /NFC-e/)
})

test('consulta pela chave: endereços só para RO', () => {
  const urls = keyConsultUrls('11261010581332000160651110000118871999881120')
  assert.equal(urls.length, 2)
  assert.ok(urls.every(u => u.includes('nfce.sefin.ro.gov.br') && u.includes('11261010581332000160651110000118871999881120')))
  assert.deepEqual(keyConsultUrls('35261010581332000160651110000118871999881120'), [])
})

test('data de emissão em outros formatos', () => {
  const p = html => parseNfce(`<div>${html}</div>`).issuedAt
  assert.equal(p('<li>Emissão: 03/10/2026 11:38:07 - Via Consumidor</li>'), '2026-10-03T11:38:07-03:00')
  assert.equal(p('Número 11887 Série 111 Emissão 10/10/26 18:06:00'), '2026-10-10T18:06:00-03:00')
  assert.equal(p('Data de Emissão: 05/09/2026 às 09:15'), '2026-09-05T09:15:00-03:00')
  assert.equal(p('Emissão: 05/09/2026'), '2026-09-05T12:00:00-03:00')
})

// --- Segurança: servidor só acessa portais .gov.br ---
test('consulta: só endereços oficiais .gov.br (inclusive os que voltam do app)', async () => {
  process.env.FIREBASE_SERVICE_ACCOUNT ||= ''
  const { isGovUrl } = await import('../api/nfce.js')
  assert.equal(isGovUrl('http://www.nfce.sefin.ro.gov.br/consultanfce/dados_nfce.jsp'), true)
  assert.equal(isGovUrl('https://evil.com/?x=.gov.br'), false)
  assert.equal(isGovUrl('http://sefin.ro.gov.br.evil.com/'), false)
  assert.equal(isGovUrl('http://169.254.169.254/latest/meta-data'), false)
  assert.equal(isGovUrl('file:///etc/passwd'), false)
  assert.equal(isGovUrl('http://user:pass@nfce.sefin.ro.gov.br/'), false)
  assert.equal(isGovUrl(undefined), false)
  assert.equal(isGovUrl('https://nfce.sefin.ro.gov.br:8443/'), false) // porta explícita
})

test('sessão do captcha: assinada, presa ao usuário e com validade', async () => {
  const { sealSession, openSession } = await import('../api/nfce.js')
  const key = Buffer.alloc(32, 7)
  const t0 = Date.parse('2026-10-14T12:00:00Z')
  const s = sealSession({ csrf: 'x', action: 'https://nfce.sefin.ro.gov.br/a' }, 'ana', t0, key)
  assert.equal(openSession(s, 'ana', t0 + 60_000, key).csrf, 'x')
  assert.equal(openSession(s, 'leo', t0 + 60_000, key), null)            // outro usuário
  assert.equal(openSession(s, 'ana', t0 + 16 * 60_000, key), null)       // vencida
  assert.equal(openSession(s, 'ana', t0, Buffer.alloc(32, 8)), null)     // outra chave
  const [payload, sig] = s.split('.')
  const forged = Buffer.from(JSON.stringify({ action: 'http://169.254.169.254/', uid: 'ana', exp: t0 + 1e9 })).toString('base64url')
  assert.equal(openSession(`${forged}.${sig}`, 'ana', t0, key), null)    // conteúdo trocado
  assert.equal(openSession(payload, 'ana', t0, key), null)               // sem assinatura
  assert.equal(openSession(undefined, 'ana', t0, key), null)
})

test('falha de rede com a SEFAZ vira "fora do ar" (guardar para depois)', async () => {
  const { isNetworkError } = await import('../api/nfce.js')
  const connect = Object.assign(new TypeError('fetch failed'), { cause: { code: 'UND_ERR_CONNECT_TIMEOUT' } })
  assert.equal(isNetworkError(connect), true)
  assert.equal(isNetworkError(Object.assign(new Error('x'), { name: 'TimeoutError' })), true)
  assert.equal(isNetworkError(Object.assign(new Error('x'), { code: 'ECONNREFUSED' })), true)
  assert.equal(isNetworkError(new Error('Endereço fora do portal da SEFAZ')), false)
  assert.equal(isNetworkError(null), false)
})

const COPIED_PAGE = `O Programa Nota Legal foi reformulado. Para fazer suas doações e concorrer a prêmios baixe o nosso app.
SECRETARIA DE ESTADO DE FINANÇAS DE RONDÔNIA
DOCUMENTO AUXILIAR DA NOTA FISCAL DE CONSUMIDOR ELETRÔNICA
IRMAOS GONCALVES COMERCIO E INDUSTRIA LTDA
CNPJ: 04.082.624/0037-67
AV. MARECHAL RONDON C/RUA 21 DE ABRIL, 1993, , APIDIA, PIMENTA BUENO, RO
Filtrar itens...
PAO BISNAGUINHA IG KGR (Código: 00002387)
Qtde.:0,312\tUN: KG\tVl. Unit.: 28,493589\tVl. Total
8,89
BATATA MONALISA KGR (Código: 00006613)
Qtde.:1,186 UN: KG Vl. Unit.: 5,978077
Vl. Total
7,09
BEB LACT ITALAKINHO CHOCOLAT 200 ML (Código: 00209335)
Qtde.:1 UN: UNIDVl. Unit.: 1,24 Vl. Total 1,24
Qtd. total de itens: 3
Valor total R$: 17,22
Valor a pagar R$: 17,22
Número: 123456 Série: 2 Emissão: 21/10/2026 18:30:12 - Via Consumidor
Chave de acesso:
1126 1004 0826 2400 3767 6500 2000 1234 5610 0000 0000`

test('texto copiado da página da nota: itens, mercado, total, data e chave', async () => {
  const { parseNfceText } = await import('../api/_lib/nfce-parse.js')
  const n = parseNfceText(COPIED_PAGE)
  assert.equal(n.items.length, 3)
  assert.deepEqual(n.items[0], { name: 'PAO BISNAGUINHA IG KGR', code: '00002387', qty: 0.312, unit: 'KG', unitPrice: 28.493589, total: 8.89 })
  assert.equal(n.items[1].name, 'BATATA MONALISA KGR')
  assert.equal(n.items[1].total, 7.09)
  assert.equal(n.items[2].unit, 'UNID')
  assert.equal(n.items[2].qty, 1)
  assert.equal(n.store, 'IRMAOS GONCALVES COMERCIO E INDUSTRIA LTDA')
  assert.equal(n.cnpj, '04082624003767')
  assert.equal(n.total, 17.22)
  assert.equal(n.issuedAt, '2026-10-21T18:30:12-04:00')
  assert.equal(n.key, '11261004082624003767650020001234561000000000')
})

test('texto copiado numa linha só e texto sem nota', async () => {
  const { parseNfceText } = await import('../api/_lib/nfce-parse.js')
  const n = parseNfceText(COPIED_PAGE.replace(/\s+/g, ' '))
  assert.equal(n.items.length, 3)
  assert.equal(n.items[0].name, 'PAO BISNAGUINHA IG KGR')
  assert.equal(n.items[2].name, 'BEB LACT ITALAKINHO CHOCOLAT 200 ML')
  assert.equal(parseNfceText('lista de compras: arroz, feijão').items.length, 0)
})

test('endereço para abrir a nota no navegador', async () => {
  const { portalUrlFor } = await import('../api/_lib/nfce-parse.js')
  const key = '11261004082624003767650020001234561000000000'
  assert.match(portalUrlFor(key), /^http:\/\/www\.nfce\.sefin\.ro\.gov\.br\/consultanfce\/consulta\.jsp\?p=11261004/)
  assert.equal(portalUrlFor('http://www.nfce.sefin.ro.gov.br/consultanfce/consulta.jsp?p=' + key + '|2|1|1|ABC'), 'http://www.nfce.sefin.ro.gov.br/consultanfce/consulta.jsp?p=' + key + '|2|1|1|ABC')
  assert.equal(portalUrlFor('https://evil.com/?p=' + key), null)
  assert.equal(portalUrlFor('123'), null)
})

test('texto copiado da página inteira: data e chave de acesso com espaços', async () => {
  const { parseNfceText } = await import('../api/_lib/nfce-parse.js')
  const n = parseNfceText(`IRMAOS GONCALVES COMERCIO E INDUSTRIA LTDA
CNPJ: 04.082.624/0037-67
AV. MARECHAL RONDON C/RUA 21 DE ABRIL, 1993, , APIDIA, PIMENTA BUENO, RO

PAO BISNAGUINHA IG KGR(Código: 00002387)
Qtde.:0,312  UN: KG  Vl. Unit.: 28,493589 	Vl. Total
8,89
MIST JAPONESA DAUCY CONG 300 GR(Código: 11298267)
Qtde.:2  UN: UNID  Vl. Unit.: 6,21 	Vl. Total
12,42
Qtd. total de itens:2
Valor a pagar R$:21,31
Forma de pagamento:Valor pago R$:
Cartão de Crédito21,31
Informação dos Tributos Totais Incidentes (Lei Federal 12.741/2012) R$
59,17
EMISSÃO NORMAL

Número: 364897 Série: 7 Emissão: 21/10/2026 18:27:44 - Via Consumidor

Protocolo de Autorização: 211260233263366 21/10/2026 18:27:47

Ambiente de Produção - Versão XML: 4.00 - Versão XSLT: 2.02
Consulte pela Chave de Acesso em

Chave de acesso:
1126 1004 0826 2400 3767 6500 7000 3648 9714 4940 3017`)
  assert.equal(n.items.length, 2)
  assert.equal(n.total, 21.31)
  assert.equal(n.issuedAt, '2026-10-21T18:27:44-04:00')
  assert.equal(n.key, '11261004082624003767650070003648971449403017')
})
