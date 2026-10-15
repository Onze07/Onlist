// Roda com: npm run test:rules (precisa do emulador do Firestore)
import { after, before, beforeEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { initializeApp, deleteApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { switchFamily, joinWithCode, mergePriceHistory, mergeCatalogItem, resumeMove, deleteAccount, mergeFamilyData } from '../api/_lib/family-core.js'
import { hit, RateLimitError } from '../api/_lib/ratelimit.js'

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
  await fs.recursiveDelete(fs.collection('rateLimits'))
  await fs.recursiveDelete(fs.collection('moves'))

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

test('código errado: 5 tentativas livres, depois bloqueio que dobra; acertar zera', async () => {
  await fs.doc('users/zed').set({})
  const try_ = (code, now) => joinWithCode({ fs, uid: 'zed', profile: { name: 'Zed' }, code, mode: 'fresh', now })
  const t0 = Date.parse('2026-10-14T12:00:00Z')
  for (let i = 0; i < 4; i++) await assert.rejects(try_('ZZZ999', t0), { status: 404 })
  await assert.rejects(try_('ZZZ999', t0), { status: 429 })             // 5º erro: bloqueia 1 min
  await assert.rejects(try_('ELI234', t0 + 30_000), { status: 429 })     // bloqueado até com o código certo
  await assert.rejects(try_('ZZZ999', t0 + 61_000), { status: 429 })     // 6º erro: bloqueia 2 min
  const blocked = (await fs.doc('rateLimits/join_zed').get()).data()
  assert.equal(blocked.fails, 6)
  assert.equal(blocked.blockedUntil.toMillis(), t0 + 61_000 + 120_000)
  const ok = await try_('ELI234', t0 + 61_000 + 121_000)
  assert.equal(ok.familyId, 'el')
  assert.equal((await fs.doc('rateLimits/join_zed').get()).exists, false)
})

test('limite por janela: passa do limite, espera a janela virar', async () => {
  const opts = { limit: 3, windowSec: 60, message: 'Calma.' }
  const t0 = Date.parse('2026-10-14T12:00:00Z')
  for (let i = 0; i < 3; i++) await hit(fs, 'nfce_ana', opts, t0 + i)
  await assert.rejects(hit(fs, 'nfce_ana', opts, t0 + 10_000), e => e instanceof RateLimitError && /Calma\. Tente de novo em 50 segundos/.test(e.message))
  await hit(fs, 'nfce_ana', opts, t0 + 61_000)
  await hit(fs, 'nfce_eli', opts, t0 + 10_000) // cada usuário tem o seu limite
})

test('troca interrompida: resumeMove termina sem duplicar e "já está" não trava', async () => {
  // Simula a queda logo depois de entrar: usuário já na nova, família antiga ainda existe
  await fs.doc('families/el').update({ members: ['eli', 'leo', 'ana'] })
  await fs.doc('users/ana').set({ familyId: 'el', movePending: true }, { merge: true })
  await fs.doc('moves/ana').set({ from: 'ana', to: 'el', owner: true, mode: 'merge' })
  // Metade da cópia já tinha rodado
  await mergeFamilyData(fs, 'ana', 'el', 'Ana Souza')

  const r = await switchFamily({ fs, uid: 'ana', profile, code: 'ELI234', mode: 'merge' })
  assert.equal(r.familyId, 'el')
  assert.equal((await fs.doc('families/ana').get()).exists, false)
  assert.equal((await fs.doc('moves/ana').get()).exists, false)
  assert.equal((await fs.doc('users/ana').get()).data().movePending, undefined)
  assert.equal((await fs.collection('families/el/lists').get()).size, 1) // não duplicou a lista
  assert.equal((await fs.doc('families/el/catalog/arroz').get()).data().priceHistory.length, 2)
  // Sem troca pendente, resume não faz nada
  assert.deepEqual(await resumeMove({ fs, uid: 'ana', profile }), { familyId: null, merged: null })
})

test('troca normal não deixa pendência', async () => {
  await switchFamily({ fs, uid: 'ana', profile, code: 'ELI234', mode: 'fresh' })
  assert.equal((await fs.doc('moves/ana').get()).exists, false)
  assert.equal((await fs.doc('users/ana').get()).data().movePending, undefined)
})

const fakeAuth = () => { const deleted = []; return { deleted, deleteUser: async uid => { deleted.push(uid) } } }

test('excluir conta: dono sozinho apaga a família inteira', async () => {
  await fs.doc('users/ana/private/x').set({ a: 1 })
  const auth = fakeAuth()
  const r = await deleteAccount({ fs, auth, uid: 'ana' })
  assert.equal(r.familyId, 'ana')
  assert.equal((await fs.doc('families/ana').get()).exists, false)
  assert.equal((await fs.collection('families/ana/catalog').get()).size, 0)
  assert.equal((await fs.doc('familyCodes/ANA234').get()).exists, false)
  assert.equal((await fs.doc('users/ana').get()).exists, false)
  assert.equal((await fs.doc('users/ana/private/x').get()).exists, false)
  assert.deepEqual(auth.deleted, ['ana'])
})

test('excluir conta: membro só sai; dono com membros é recusado', async () => {
  await fs.doc('users/leo').set({ familyId: 'el' })
  await fs.doc('families/el/profiles/leo').set({ name: 'Leo' })
  await deleteAccount({ fs, auth: fakeAuth(), uid: 'leo' })
  assert.deepEqual((await fs.doc('families/el').get()).data().members, ['eli'])
  assert.equal((await fs.doc('families/el/profiles/leo').get()).exists, false)

  await fs.doc('families/el').update({ members: ['eli', 'zed'] })
  const auth = fakeAuth()
  await assert.rejects(deleteAccount({ fs, auth, uid: 'eli' }), { status: 409 })
  assert.ok((await fs.doc('users/eli').get()).exists)
  assert.deepEqual(auth.deleted, [])
})
