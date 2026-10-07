// Roda com: npm run test:rules (emuladores do Firestore e do Auth)
import { after, before, beforeEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { initializeApp, deleteApp } from 'firebase-admin/app'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'
import { getAuth } from 'firebase-admin/auth'
import { overview, familyDetail, setPlan, listFeedback, setFeedbackStatus, cleanPlan, isAdminEmail } from '../api/_lib/admin-core.js'

let app, fs, auth
const NOW = Date.parse('2026-10-07T12:00:00Z')
const daysAgo = d => Timestamp.fromMillis(NOW - d * 86400000)

before(() => {
  app = initializeApp({ projectId: 'onlist-admin-test' }, 'admin-test')
  fs = getFirestore(app)
  auth = getAuth(app)
})
after(() => deleteApp(app))

beforeEach(async () => {
  await fs.recursiveDelete(fs.collection('families'))
  await fs.recursiveDelete(fs.collection('feedback'))
  const { users } = await auth.listUsers(1000)
  if (users.length) await auth.deleteUsers(users.map(u => u.uid))
  for (const [uid, email] of [['eli', 'eli@x.com'], ['ana', 'ana@x.com'], ['bob', 'bob@x.com'], ['zé', 'ze@x.com']]) {
    await auth.createUser({ uid, email, displayName: uid })
  }
  await fs.doc('families/f1').set({ name: 'Oliveira', code: 'ABC234', createdBy: 'eli', members: ['eli', 'ana'], admins: [], createdAt: daysAgo(40) })
  await fs.doc('families/f1/profiles/eli').set({ name: 'Élinton', email: 'eli@x.com', lastSeenAt: daysAgo(1), pushEnabled: true })
  await fs.doc('families/f1/profiles/ana').set({ name: 'Ana', email: 'ana@x.com', lastSeenAt: daysAgo(3) })
  await fs.doc('families/f1/history/h1').set({ createdAt: daysAgo(2), total: 100, mercado: 'IG', items: [{ name: 'Arroz' }], source: 'nfce' })
  await fs.doc('families/f1/history/h2').set({ createdAt: daysAgo(45), total: 50, mercado: 'IG', items: [] })
  await fs.doc('families/f2').set({ name: 'Bob', code: 'BOB234', createdBy: 'bob', members: ['bob'], admins: [], createdAt: daysAgo(60),
    plan: { tier: 'premium', name: 'Premium', status: 'active', interval: 'annual', seats: 4, price: 79.2 } })
  await fs.doc('families/f3').set({ name: 'Beta', code: 'BET234', createdBy: 'zé2', members: [], admins: [], createdAt: daysAgo(5),
    plan: { tier: 'founder', name: 'Fundador', status: 'active', interval: 'lifetime', seats: 20, price: 0 } })
  await fs.doc('families/f2/profiles/bob').set({ name: 'Bob', email: 'bob@x.com', lastSeenAt: daysAgo(50) })
  await fs.doc('feedback/a').set({ email: 'ana@x.com', message: 'Gostei', type: 'ideia', createdAt: daysAgo(1) })
})

test('visão geral: usuários, famílias, ativas, compras, pagantes e receita', async () => {
  const r = await overview({ fs, auth, now: NOW })
  assert.equal(r.kpis.users, 4)
  assert.equal(r.kpis.usersNoFamily, 1)
  assert.equal(r.usersNoFamily[0].email, 'ze@x.com')
  assert.equal(r.kpis.families, 3)
  assert.equal(r.kpis.familiesWithPurchase, 1)
  assert.equal(r.kpis.familiesBuying30, 1)
  assert.equal(r.kpis.familiesBuying30, 1)
  assert.equal(r.kpis.active7, 1)
  assert.equal(r.kpis.active30, 1)
  assert.equal(r.kpis.purchases30, 1)
  assert.equal(r.kpis.paying, 1) // Fundador (R$ 0) não conta
  assert.equal(r.kpis.founders, 1)
  assert.equal(r.kpis.premium, 1)
  assert.equal(r.kpis.feedbackOpen, 1)
  assert.equal(r.kpis.mrr, 6.6)
  assert.equal(r.kpis.feedback, 1)
  const f1 = r.families.find(f => f.id === 'f1')
  assert.equal(f1.owner.email, 'eli@x.com')
  assert.equal(f1.purchases, 2)
  assert.equal(r.families[0].id, 'f1') // mais recente primeiro
})

test('detalhe da família: membros, papéis e números, sem itens das compras', async () => {
  const d = await familyDetail({ fs, auth, familyId: 'f1' })
  assert.deepEqual(d.counts, { lists: 0, catalog: 0, purchases: 2, nfce: 1 })
  assert.equal(d.members.find(m => m.uid === 'eli').role, 'Dono')
  assert.equal(d.members.find(m => m.uid === 'eli').pushEnabled, true)
  assert.equal(d.recent[0].items, 1)
  assert.equal(d.recent[0].source, 'nfce')
  assert.equal('items' in d.recent[0] && Array.isArray(d.recent[0].items), false)
  await assert.rejects(familyDetail({ fs, auth, familyId: 'nao' }), { status: 404 })
})

test('definir e remover plano', async () => {
  await setPlan({ fs, familyId: 'f1', adminEmail: 'eli@x.com', plan: { name: 'Fundador', status: 'active', interval: 'annual', seats: 4, price: 49, validUntil: '2027-10-07', notes: 'Pix' } })
  const plan = (await fs.doc('families/f1').get()).data().plan
  assert.equal(plan.name, 'Fundador')
  assert.equal(plan.updatedBy, 'eli@x.com')
  assert.ok(plan.validUntil.toDate() > new Date('2027-10-07T00:00:00Z'))
  await setPlan({ fs, familyId: 'f1', plan: null })
  assert.equal((await fs.doc('families/f1').get()).data().plan, undefined)
})

test('feedback: lista e atendimento (novo -> resolvido)', async () => {
  let f = await listFeedback({ fs })
  assert.equal(f[0].message, 'Gostei')
  assert.equal(f[0].status, 'new')
  await setFeedbackStatus({ fs, id: 'a', status: 'done', note: 'Respondido no WhatsApp', adminEmail: 'eli@x.com' })
  f = await listFeedback({ fs })
  assert.equal(f[0].status, 'done')
  assert.equal(f[0].adminNote, 'Respondido no WhatsApp')
  assert.equal(f[0].handledBy, 'eli@x.com')
  await assert.rejects(setFeedbackStatus({ fs, id: 'a', status: 'x' }), { status: 400 })
  assert.equal((await overview({ fs, auth, now: NOW })).kpis.feedbackOpen, 0)
})

test('validação do plano', () => {
  const ok = { name: 'Premium', status: 'active', interval: 'monthly', seats: 4, price: 7.9 }
  assert.equal(cleanPlan(ok).price, 7.9)
  assert.equal(cleanPlan(null), null)
  assert.throws(() => cleanPlan({ ...ok, status: 'x' }), { status: 400 })
  assert.throws(() => cleanPlan({ ...ok, seats: 0 }), { status: 400 })
  assert.throws(() => cleanPlan({ ...ok, seats: 2.5 }), { status: 400 })
  assert.throws(() => cleanPlan({ ...ok, name: '' }), { status: 400 })
  assert.throws(() => cleanPlan({ ...ok, validUntil: 'abc' }), { status: 400 })
  assert.throws(() => cleanPlan({ ...ok, tier: 'gold' }), { status: 400 })
  assert.equal(cleanPlan({ ...ok, tier: 'founder' }).tier, 'founder')
  assert.equal(cleanPlan(ok).tier, 'custom')
})

test('só e-mails da lista de admins entram', () => {
  const env = ' Assessoria@onze07.com , outro@x.com'
  assert.equal(isAdminEmail({ email: 'assessoria@onze07.com', email_verified: true }, env), true)
  assert.equal(isAdminEmail({ email: 'ana@x.com', email_verified: true }, env), false)
  assert.equal(isAdminEmail({ email: 'outro@x.com', email_verified: false }, env), false)
  assert.equal(isAdminEmail({ email: 'assessoria@onze07.com' }, ''), false)
})
