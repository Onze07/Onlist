// Roda com: npm run test:rules (precisa do emulador do Firestore)
import { after, before, beforeEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { initializeApp, deleteApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { switchFamily, mergePriceHistory, mergeCatalogItem } from '../api/_lib/family-core.js'

let app, fs

before(() => {
  app = initializeApp({ projectId: 'onlist-family-test' }, 'family-test')
  fs = getFirestore(app)
})

after(() => deleteApp(app))

beforeEach(async () => {
  await fs.recursiveDelete(fs.collection('families'))
  await fs.recursiveDelete(fs.collection('familyCodes'))
  await fs.recursiveDelete(fs.collection('users'))

  // Família do Élinton (destino), com Leo como membro
  await fs.doc('families/el').set({ code: 'ELI234', createdBy: 'eli', members: ['eli', 'leo'], admins: [] })
  await fs.doc('familyCodes/ELI234').set({ familyId: 'el' })
  await fs.doc('users/eli').set({ familyId: 'el' })
  await fs.doc('families/el/catalog/arroz').set({
    name: 'Arroz', category: 'Mercearia', unit: 'kg', lastPrice: 6,
    priceHistory: [{ price: 6, date: '2026-09-01', mercado: 'Atacadão' }],
  })
  await fs.doc('families/el/history/NF1').set({ total: 100, mercado: 'Atacadão' })

  // Família da Ana (origem), só ela
  await fs.doc('families/ana').set({ code: 'ANA234', createdBy: 'ana', members: ['ana'], admins: [] })
  await fs.doc('familyCodes/ANA234').set({ familyId: 'ana' })
  await fs.doc('users/ana').set({ familyId: 'ana', legalVersion: 3 })
  await fs.doc('families/ana/catalog/arroz').set({
    name: 'Arroz', priceHistory: [{ price: 5.5, date: '2026-09-10', mercado: 'IG' }],
  })
  await fs.doc('families/ana/catalog/feijao').set({ name: 'Feijão', priceHistory: [] })
  await fs.doc('families/ana/history/NF1').set({ total: 100, mercado: 'Atacadão' }) // mesma nota
  await fs.doc('families/ana/history/h2').set({ total: 50, mercado: 'IG' })
  await fs.doc('families/ana/mercados/ig').set({ name: 'IG' })
  await fs.doc('families/ana/lists/l1').set({ name: 'Semana' })
  await fs.doc('families/ana/lists/l1/entries/e1').set({ name: 'Leite' })
  await fs.doc('families/ana/lists/vazia').set({ name: 'Vazia' })
  await fs.doc('families/ana/profiles/ana').set({ name: 'Ana Souza' })
})

const profile = { name: 'Ana Souza', email: 'ana@x.com', photoURL: null }

test('levar meus dados: mescla catálogo, não duplica nota e apaga a família antiga', async () => {
  const r = await switchFamily({ fs, uid: 'ana', profile, code: 'eli234', mode: 'merge' })
  assert.equal(r.familyId, 'el')
  assert.deepEqual(r.merged, { catalog: 2, history: 1, lists: 1 })

  const fam = (await fs.doc('families/el').get()).data()
  assert.deepEqual(fam.members.sort(), ['ana', 'eli', 'leo'])
  const user = (await fs.doc('users/ana').get()).data()
  assert.equal(user.familyId, 'el')
  assert.equal(user.legalVersion, 3) // não apaga o resto do cadastro
  assert.equal(user.joinCode, undefined)

  const arroz = (await fs.doc('families/el/catalog/arroz').get()).data()
  assert.equal(arroz.category, 'Mercearia')
  assert.equal(arroz.priceHistory.length, 2)
  assert.equal(arroz.lastPrice, 5.5) // preço mais recente
  assert.ok((await fs.doc('families/el/catalog/feijao').get()).exists)

  assert.equal((await fs.collection('families/el/history').get()).size, 2)
  const lists = await fs.collection('families/el/lists').get()
  assert.equal(lists.size, 1)
  assert.equal(lists.docs[0].data().name, 'Semana (de Ana)')
  assert.equal((await lists.docs[0].ref.collection('entries').get()).size, 1)
  assert.ok((await fs.doc('families/el/mercados/ig').get()).exists)
  assert.ok((await fs.doc('families/el/profiles/ana').get()).exists)

  assert.equal((await fs.doc('families/ana').get()).exists, false)
  assert.equal((await fs.collection('families/ana/catalog').get()).size, 0)
  assert.equal((await fs.doc('familyCodes/ANA234').get()).exists, false)
})

test('começar do zero: entra e apaga a família antiga sem copiar', async () => {
  const r = await switchFamily({ fs, uid: 'ana', profile, code: 'ELI234', mode: 'fresh' })
  assert.equal(r.merged, null)
  assert.equal((await fs.doc('families/el/catalog/feijao').get()).exists, false)
  assert.equal((await fs.doc('families/ana').get()).exists, false)
})

test('membro comum só sai da família antiga', async () => {
  await fs.doc('users/leo').set({ familyId: 'el' })
  await fs.doc('families/el/profiles/leo').set({ name: 'Leo' })
  await switchFamily({ fs, uid: 'leo', profile: { name: 'Leo' }, code: 'ANA234', mode: 'merge' })
  const el = (await fs.doc('families/el').get()).data()
  assert.deepEqual(el.members, ['eli'])
  assert.equal((await fs.doc('families/el/profiles/leo').get()).exists, false)
  assert.equal((await fs.doc('families/el/catalog/arroz').get()).exists, true) // dados ficam
  assert.deepEqual((await fs.doc('families/ana').get()).data().members.sort(), ['ana', 'leo'])
})

test('dono com outros membros precisa passar a posse antes', async () => {
  await assert.rejects(switchFamily({ fs, uid: 'eli', profile, code: 'ANA234', mode: 'merge' }), { status: 409 })
  assert.equal((await fs.doc('users/eli').get()).data().familyId, 'el')
})

test('código inválido, inexistente ou da própria família', async () => {
  await assert.rejects(switchFamily({ fs, uid: 'ana', profile, code: 'x', mode: 'merge' }), { status: 400 })
  await assert.rejects(switchFamily({ fs, uid: 'ana', profile, code: 'ZZZ999', mode: 'merge' }), { status: 404 })
  await assert.rejects(switchFamily({ fs, uid: 'ana', profile, code: 'ANA234', mode: 'merge' }), { status: 400 })
})

test('família cheia recusa a entrada', async () => {
  await fs.doc('families/el').update({ plan: { seats: 2 } })
  await assert.rejects(switchFamily({ fs, uid: 'ana', profile, code: 'ELI234', mode: 'merge' }), { status: 403 })
  assert.ok((await fs.doc('families/ana').get()).exists) // nada foi apagado
})

test('quem não tem família também entra pelo servidor', async () => {
  await fs.doc('users/novo').set({ legalVersion: 3 })
  const r = await switchFamily({ fs, uid: 'novo', profile: { name: 'Novo' }, code: 'ELI234', mode: 'fresh' })
  assert.equal(r.familyId, 'el')
})

test('mesclar históricos: sem repetição e só os mais recentes', () => {
  const a = [{ price: 5, date: '2026-01-01', mercado: 'IG' }]
  const b = [{ price: 5, date: '2026-01-01', mercado: ' ig ' }, { price: 6, date: '2026-02-01', mercado: 'IG' }]
  assert.equal(mergePriceHistory(a, b).length, 2)
  const many = Array.from({ length: 80 }, (_, i) => ({ price: i + 1, date: `2026-01-${String(i % 28 + 1).padStart(2, '0')}`, mercado: `M${i}` }))
  assert.equal(mergePriceHistory(many, []).length, 60)
  const m = mergeCatalogItem({ name: 'Arroz', unit: '' }, { name: 'arroz', unit: 'kg', category: 'X' })
  assert.equal(m.name, 'Arroz')
  assert.equal(m.unit, 'kg')
})
