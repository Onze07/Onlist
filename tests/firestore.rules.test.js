// Roda com: npm run test:rules (sobe o emulador do Firestore)
import { readFileSync } from 'node:fs'
import { after, before, beforeEach, test } from 'node:test'
import {
  assertFails, assertSucceeds, initializeTestEnvironment,
} from '@firebase/rules-unit-testing'
import { arrayRemove, arrayUnion, deleteDoc, doc, getDoc, setDoc, updateDoc, writeBatch, collection, getDocs } from 'firebase/firestore'

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
    await setDoc(doc(db, 'families/fam1'), { code: 'ABC234', createdBy: 'alice', members: ['alice', 'adam', 'mia'], admins: ['adam'] })
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
  batch.set(doc(db, 'families/fam2'), { code: 'XYZ789', createdBy: 'carol', members: ['carol'], admins: [] })
  batch.set(doc(db, 'families/fam2/profiles/carol'), { name: 'Carol' })
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

// --- Gestão de acesso ---

const join = (uid, code = 'ABC234') => {
  const db = as(uid)
  const batch = writeBatch(db)
  batch.set(doc(db, `users/${uid}`), { familyId: 'fam1', joinCode: code })
  batch.update(doc(db, 'families/fam1'), { members: arrayUnion(uid) })
  return batch.commit()
}

test('criar família com plano é bloqueado', async () => {
  await assertFails(setDoc(doc(as('carol'), 'families/fam9'), {
    code: 'PLN234', createdBy: 'carol', members: ['carol'], plan: { seats: 99 },
  }))
})

test('limite de vagas: entrar falha quando o plano está cheio', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await updateDoc(doc(ctx.firestore(), 'families/fam1'), { plan: { seats: 3 } })
  })
  await assertFails(join('bob'))
})

test('limite de vagas padrão (sem plano) é 20', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const members = Array.from({ length: 19 }, (_, i) => `m${i}`)
    await updateDoc(doc(ctx.firestore(), 'families/fam1'), { members: ['alice', ...members.slice(1)] })
  })
  await assertSucceeds(join('bob'))
  await assertFails(join('carl'))
})

test('dono passa a posse para um membro e vira admin', async () => {
  await assertSucceeds(updateDoc(doc(as('alice'), 'families/fam1'), { createdBy: 'mia', admins: ['adam', 'alice'] }))
  // agora alice (admin) pode sair da família
  await assertSucceeds(updateDoc(doc(as('alice'), 'families/fam1'), { members: ['adam', 'mia'], admins: ['adam'] }))
})

test('admin liga marcas; membro comum não', async () => {
  await assertSucceeds(updateDoc(doc(as('adam'), 'families/fam1'), { brandsEnabled: true }))
  await assertFails(updateDoc(doc(as('mia'), 'families/fam1'), { brandsEnabled: false }))
})

test('admin não passa a posse', async () => {
  await assertFails(updateDoc(doc(as('adam'), 'families/fam1'), { createdBy: 'adam' }))
})

test('posse só vai para quem é membro', async () => {
  await assertFails(updateDoc(doc(as('alice'), 'families/fam1'), { createdBy: 'mallory' }))
})

test('passar a posse não pode remover o novo dono', async () => {
  await assertFails(updateDoc(doc(as('alice'), 'families/fam1'), { createdBy: 'mia', members: ['alice', 'adam'] }))
})

test('ninguém altera o plano pelo app', async () => {
  await assertFails(updateDoc(doc(as('alice'), 'families/fam1'), { plan: { seats: 50 } }))
})

test('dono remove membro', async () => {
  await assertSucceeds(updateDoc(doc(as('alice'), 'families/fam1'), { members: arrayRemove('mia') }))
})

test('admin remove membro comum', async () => {
  await assertSucceeds(updateDoc(doc(as('adam'), 'families/fam1'), { members: arrayRemove('mia') }))
})

test('admin não remove o dono', async () => {
  await assertFails(updateDoc(doc(as('adam'), 'families/fam1'), { members: arrayRemove('alice') }))
})

test('membro comum não remove ninguém', async () => {
  await assertFails(updateDoc(doc(as('mia'), 'families/fam1'), { members: arrayRemove('adam') }))
})

test('só o dono promove admin', async () => {
  await assertFails(updateDoc(doc(as('adam'), 'families/fam1'), { admins: arrayUnion('mia') }))
  await assertSucceeds(updateDoc(doc(as('alice'), 'families/fam1'), { admins: arrayUnion('mia') }))
})

test('admin não remove outro admin', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await updateDoc(doc(ctx.firestore(), 'families/fam1'), { admins: ['adam', 'mia'] })
  })
  await assertFails(updateDoc(doc(as('adam'), 'families/fam1'), { members: arrayRemove('mia'), admins: arrayRemove('mia') }))
})

test('admin não adiciona membro direto', async () => {
  await assertFails(updateDoc(doc(as('adam'), 'families/fam1'), { members: arrayUnion('eve') }))
})

test('membro sai da família', async () => {
  await assertSucceeds(updateDoc(doc(as('mia'), 'families/fam1'), { members: arrayRemove('mia'), admins: arrayRemove('mia') }))
  await assertFails(getDoc(doc(as('mia'), 'families/fam1/lists/l1/entries/e1')))
})

test('dono não sai da família', async () => {
  await assertFails(updateDoc(doc(as('alice'), 'families/fam1'), { members: arrayRemove('alice') }))
})

test('admin gera novo código', async () => {
  const db = as('adam')
  const batch = writeBatch(db)
  batch.set(doc(db, 'familyCodes/NEW567'), { familyId: 'fam1' })
  batch.update(doc(db, 'families/fam1'), { code: 'NEW567' })
  batch.delete(doc(db, 'familyCodes/ABC234'))
  await assertSucceeds(batch.commit())
  await assertFails(join('bob', 'ABC234'))
})

test('membro comum não troca código', async () => {
  const db = as('mia')
  const batch = writeBatch(db)
  batch.set(doc(db, 'familyCodes/NEW567'), { familyId: 'fam1' })
  batch.update(doc(db, 'families/fam1'), { code: 'NEW567' })
  await assertFails(batch.commit())
})

test('não apaga código em uso', async () => {
  await assertFails(deleteDoc(doc(as('alice'), 'familyCodes/ABC234')))
})

test('perfil: cada um edita o seu, família lê todos', async () => {
  await assertSucceeds(setDoc(doc(as('mia'), 'families/fam1/profiles/mia'), { name: 'Mia' }))
  await assertFails(setDoc(doc(as('mia'), 'families/fam1/profiles/adam'), { name: 'Hack' }))
  await assertSucceeds(getDoc(doc(as('adam'), 'families/fam1/profiles/mia')))
  await assertFails(getDoc(doc(as('mallory'), 'families/fam1/profiles/mia')))
})

test('admin apaga perfil de quem removeu', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'families/fam1/profiles/mia'), { name: 'Mia' })
  })
  const db = as('adam')
  const batch = writeBatch(db)
  batch.update(doc(db, 'families/fam1'), { members: arrayRemove('mia'), admins: arrayRemove('mia') })
  batch.delete(doc(db, 'families/fam1/profiles/mia'))
  await assertSucceeds(batch.commit())
})

test('entrar já gravando o perfil', async () => {
  const db = as('bob')
  const batch = writeBatch(db)
  batch.set(doc(db, 'users/bob'), { familyId: 'fam1', joinCode: 'ABC234' })
  batch.update(doc(db, 'families/fam1'), { members: arrayUnion('bob') })
  batch.set(doc(db, 'families/fam1/profiles/bob'), { name: 'Bob' })
  await assertSucceeds(batch.commit())
})

test('família legada sem admins: dono gerencia normalmente', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'families/old'), { code: 'OQI1IV', createdBy: 'dan', members: ['dan', 'eva'] })
  })
  await assertSucceeds(updateDoc(doc(as('dan'), 'families/old'), { members: arrayRemove('eva'), admins: arrayRemove('eva') }))
})

// --- Exclusão de conta e feedback ---

test('dono sozinho exclui a família e o código', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'families/solo'), { code: 'SOLO23', createdBy: 'sol', members: ['sol'] })
    await setDoc(doc(ctx.firestore(), 'familyCodes/SOLO23'), { familyId: 'solo' })
  })
  const db = as('sol')
  const batch = writeBatch(db)
  batch.delete(doc(db, 'familyCodes/SOLO23'))
  batch.delete(doc(db, 'families/solo'))
  await assertSucceeds(batch.commit())
})

test('dono não exclui família com outros membros', async () => {
  await assertFails(deleteDoc(doc(as('alice'), 'families/fam1')))
})

test('admin não exclui a família', async () => {
  await assertFails(deleteDoc(doc(as('adam'), 'families/fam1')))
})

test('usuário apaga o próprio perfil de usuário', async () => {
  await setDoc(doc(as('bob'), 'users/bob'), { familyId: null })
  await assertSucceeds(deleteDoc(doc(as('bob'), 'users/bob')))
})

test('feedback: envia o próprio, não lê nem forja', async () => {
  await assertSucceeds(setDoc(doc(as('bob'), 'feedback/f1'), { uid: 'bob', message: 'Ótimo app' }))
  await assertFails(setDoc(doc(as('bob'), 'feedback/f2'), { uid: 'alice', message: 'forjado' }))
  await assertFails(setDoc(doc(as('bob'), 'feedback/f3'), { uid: 'bob', message: '' }))
  await assertFails(getDoc(doc(as('bob'), 'feedback/f1')))
  await assertFails(setDoc(doc(env.unauthenticatedContext().firestore(), 'feedback/f4'), { uid: 'x', message: 'oi' }))
})

// --- Presença (modo mercado) ---

test('presença: membro grava e apaga a própria', async () => {
  const db = as('mia')
  await assertSucceeds(setDoc(doc(db, 'families/fam1/presence/mia'), { name: 'Mia', mercado: 'X' }))
  await assertSucceeds(getDoc(doc(as('adam'), 'families/fam1/presence/mia')))
  await assertSucceeds(deleteDoc(doc(db, 'families/fam1/presence/mia')))
})

test('presença: não grava a de outra pessoa', async () => {
  await assertFails(setDoc(doc(as('mia'), 'families/fam1/presence/adam'), { name: 'Falso' }))
})

test('presença: não membro não lê nem grava', async () => {
  await assertFails(getDoc(doc(as('mallory'), 'families/fam1/presence/mia')))
  await assertFails(setDoc(doc(as('mallory'), 'families/fam1/presence/mallory'), { name: 'M' }))
})

test('presença: admin apaga a de quem removeu', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'families/fam1/presence/mia'), { name: 'Mia' })
  })
  const db = as('adam')
  const batch = writeBatch(db)
  batch.update(doc(db, 'families/fam1'), { members: arrayRemove('mia'), admins: arrayRemove('mia') })
  batch.delete(doc(db, 'families/fam1/presence/mia'))
  batch.delete(doc(db, 'families/fam1/profiles/mia'))
  await assertSucceeds(batch.commit())
})

test('presença: membro comum não apaga a de outro', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'families/fam1/presence/adam'), { name: 'Adam' })
  })
  await assertFails(deleteDoc(doc(as('mia'), 'families/fam1/presence/adam')))
})
