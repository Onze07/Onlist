// Regras do /api/notify (sem Firebase: banco falso em memória)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { planNotification } from '../api/_lib/notify-core.js'

function fakeDb(docs) {
  return { async get(path) { return docs[path] ? { exists: true, data: docs[path] } : { exists: false, data: {} } } }
}

const base = {
  'families/f1': { members: ['ana', 'bob', 'cid'] },
  'families/f1/profiles/ana': { name: 'Ana Souza' },
  'users/bob': { fcmTokens: ['tb1', 'tb2'] },
  'users/cid': { fcmTokens: ['tc1'], notifyShopping: false },
}

test('avisar pessoa escolhida: só membros, com texto padrão', async () => {
  const r = await planNotification({ db: fakeDb(base), uid: 'ana', body: { familyId: 'f1', type: 'list', to: ['bob', 'intruso', 'ana'], listName: 'Compras gerais', count: 8 } })
  assert.equal(r.status, 200)
  assert.deepEqual(r.targets, ['bob'])
  assert.deepEqual(r.tokens.map(t => t.token), ['tb1', 'tb2'])
  assert.equal(r.payload.title, '🛒 Ana pediu uma compra')
  assert.match(r.payload.body, /8 itens para comprar em "Compras gerais"/)
})

test('mensagem personalizada', async () => {
  const r = await planNotification({ db: fakeDb(base), uid: 'ana', body: { familyId: 'f1', type: 'list', to: ['bob'], message: '  Passa no mercado na volta  ' } })
  assert.equal(r.payload.body, 'Passa no mercado na volta')
})

test('não membro é recusado', async () => {
  const r = await planNotification({ db: fakeDb(base), uid: 'mallory', body: { familyId: 'f1', type: 'list', to: ['bob'] } })
  assert.equal(r.status, 403)
})

test('pedido inválido', async () => {
  assert.equal((await planNotification({ db: fakeDb(base), uid: 'ana', body: { familyId: 'f1', type: 'spam' } })).status, 400)
  assert.equal((await planNotification({ db: fakeDb(base), uid: 'ana', body: { familyId: 'f1', type: 'list', to: [] } })).status, 400)
})

test('"está no mercado" vai para todos, respeitando quem desativou', async () => {
  const r = await planNotification({ db: fakeDb(base), uid: 'ana', body: { familyId: 'f1', type: 'shopping', listName: 'Compras gerais' } })
  assert.equal(r.status, 200)
  assert.deepEqual(r.targets, ['bob', 'cid'])
  assert.deepEqual(r.tokens.map(t => t.uid), ['bob', 'bob'])
  assert.equal(r.payload.title, '🛒 Ana está no mercado')
})

test('quem não ativou avisos aparece em withoutDevice', async () => {
  const docs = { ...base, 'families/f1': { members: ['ana', 'bob', 'dan'] } }
  const r = await planNotification({ db: fakeDb(docs), uid: 'ana', body: { familyId: 'f1', type: 'list', to: ['bob', 'dan'] } })
  assert.deepEqual(r.withoutDevice, ['dan'])
})

test('limite de frequência', async () => {
  const now = 1_000_000_000
  const docs = { ...base, 'notifyLog/f1_ana': { list: now - 30_000, shopping: now - 10 * 60_000 } }
  assert.equal((await planNotification({ db: fakeDb(docs), uid: 'ana', now, body: { familyId: 'f1', type: 'list', to: ['bob'] } })).status, 429)
  assert.equal((await planNotification({ db: fakeDb(docs), uid: 'ana', now, body: { familyId: 'f1', type: 'shopping' } })).status, 429)
  assert.equal((await planNotification({ db: fakeDb(docs), uid: 'ana', now: now + 60_000, body: { familyId: 'f1', type: 'list', to: ['bob'] } })).status, 200)
})
