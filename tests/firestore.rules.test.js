// Roda com: npm run test:rules (sobe o emulador do Firestore)
import { readFileSync } from 'node:fs'
import { after, before, beforeEach, test } from 'node:test'
import {
  assertFails, assertSucceeds, initializeTestEnvironment,
} from '@firebase/rules-unit-testing'
import { arrayUnion, doc, getDoc, setDoc, updateDoc, writeBatch, collection, getDocs } from 'firebase/firestore'

let env

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'onlist-test',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  })
})

after(() => env.cleanup())

beforeEach(async () => {
  await env.clearFirestore()
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore()
    await setDoc(doc(db, 'families/fam1'), { code: 'ABC234', createdBy: 'alice', members: ['alice'] })
    await setDoc(doc(db, 'familyCodes/ABC234'), { familyId: 'fam1' })
    await setDoc(doc(db, 'families/fam1/lists/l1/entries/e1'), { name: 'Arroz' })
  })
})

const as = (uid) => env.authenticatedContext(uid).firestore()

test('membro lê e escreve dados da família', async () => {
  const db = as('alice')
  await assertSucceeds(getDoc(doc(db, 'families/fam1/lists/l1/entries/e1')))
  await assertSucceeds(setDoc(doc(db, 'families/fam1/catalog/arroz'), { name: 'Arroz' }))
})

test('não membro não lê nem escreve', async () => {
  const db = as('mallory')
  await assertFails(getDoc(doc(db, 'families/fam1')))
  await assertFails(getDoc(doc(db, 'families/fam1/lists/l1/entries/e1')))
  await assertFails(setDoc(doc(db, 'families/fam1/catalog/x'), { name: 'x' }))
})

test('anônimo não acessa nada', async () => {
  const db = env.unauthenticatedContext().firestore()
  await assertFails(getDoc(doc(db, 'familyCodes/ABC234')))
  await assertFails(getDoc(doc(db, 'families/fam1')))
})

test('não é possível listar códigos', async () => {
  await assertFails(getDocs(collection(as('mallory'), 'familyCodes')))
})

test('entrar com código válido funciona', async () => {
  const db = as('bob')
  const batch = writeBatch(db)
  batch.set(doc(db, 'users/bob'), { familyId: 'fam1', joinCode: 'ABC234' })
  batch.update(doc(db, 'families/fam1'), { members: arrayUnion('bob') })
  await assertSucceeds(batch.commit())
  await assertSucceeds(getDoc(doc(db, 'families/fam1/lists/l1/entries/e1')))
})

test('entrar sem saber o código falha', async () => {
  const db = as('mallory')
  const batch = writeBatch(db)
  batch.set(doc(db, 'users/mallory'), { familyId: 'fam1', joinCode: 'ZZZZZZ' })
  batch.update(doc(db, 'families/fam1'), { members: arrayUnion('mallory') })
  await assertFails(batch.commit())
})

test('entrar não pode adicionar outra pessoa', async () => {
  const db = as('mallory')
  const batch = writeBatch(db)
  batch.set(doc(db, 'users/mallory'), { familyId: 'fam1', joinCode: 'ABC234' })
  batch.update(doc(db, 'families/fam1'), { members: arrayUnion('mallory', 'eve') })
  await assertFails(batch.commit())
})

test('criar família própria com código', async () => {
  const db = as('carol')
  const batch = writeBatch(db)
  batch.set(doc(db, 'families/fam2'), { code: 'XYZ789', createdBy: 'carol', members: ['carol'] })
  batch.set(doc(db, 'familyCodes/XYZ789'), { familyId: 'fam2' })
  batch.set(doc(db, 'users/carol'), { familyId: 'fam2' })
  await assertSucceeds(batch.commit())
})

test('não pode sequestrar código existente', async () => {
  await assertFails(setDoc(doc(as('alice'), 'familyCodes/ABC234'), { familyId: 'outra' }))
})

test('não pode criar código apontando para família alheia', async () => {
  await assertFails(setDoc(doc(as('mallory'), 'familyCodes/NEW234'), { familyId: 'fam1' }))
})

test('migração: membro cria código faltante', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'families/fam3'), { code: 'OLD999', createdBy: 'dan', members: ['dan'] })
  })
  await assertSucceeds(setDoc(doc(as('dan'), 'familyCodes/OLD999'), { familyId: 'fam3' }))
})

test('membro não troca o código da família', async () => {
  await assertFails(updateDoc(doc(as('alice'), 'families/fam1'), { code: 'HACK00' }))
})

test('usuário só acessa o próprio perfil', async () => {
  await assertSucceeds(setDoc(doc(as('bob'), 'users/bob'), { email: 'b@x' }))
  await assertFails(getDoc(doc(as('bob'), 'users/alice')))
})
