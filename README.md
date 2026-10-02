# Onlist

Lista de compras compartilhada da família. PWA em React + Vite, com Firebase (Auth Google + Firestore).

## Rodar local

```bash
cp .env.example .env.local   # preencher com as chaves do app web no Firebase Console
npm install
npm run dev
```

## Scripts

| Comando | O que faz |
|---|---|
| `npm run dev` | servidor local |
| `npm run build` | build de produção em `dist/` |
| `npm run lint` | oxlint |
| `npm run test:rules` | testa `firestore.rules` no emulador (precisa de Java) |

## Deploy

São dois deploys independentes:

### 1. Front-end — Vercel (automático)

- Projeto `onlist` na Vercel, ligado a este repositório.
- Push em qualquer branch → deploy de **preview**.
- Merge em `main` → deploy de **produção**.
- Variáveis `VITE_FIREBASE_*` ficam em Vercel → Settings → Environment Variables.
- Login Google em URL nova: adicionar o domínio em Firebase Console → Authentication → Settings → Authorized domains.

### 2. Regras do Firestore — Firebase CLI (manual)

```bash
npx firebase-tools@15 login
npx firebase-tools@15 use --add          # escolher o projeto Firebase (gera .firebaserc)
npm run test:rules              # opcional, valida antes
npx firebase-tools@15 deploy --only firestore:rules
```

## Estrutura do Firestore

```
users/{uid}                  familyId, email, joinCode
familyCodes/{code}           familyId          (convite; leitura só por ID)
families/{fid}               name, code, createdBy (dono), members[], admins[], plan
  profiles/{uid}             nome, e-mail, foto de cada membro
  lists/{listId}             name, status, createdAt
    entries/{entryId}        itens da lista
  catalog/{nome}             último preço + histórico
  history/{id}               compras finalizadas
  mercados/{nome}
```

Acesso a `families/{fid}/**` só para quem está em `members` (ver `firestore.rules`).

### Papéis

| Ação | Dono | Admin | Membro |
|---|:-:|:-:|:-:|
| Usar listas, catálogo, histórico | ✓ | ✓ | ✓ |
| Renomear família, gerar novo código | ✓ | ✓ | |
| Remover membro comum | ✓ | ✓ | |
| Promover/remover admin, remover admin da família | ✓ | | |
| Sair da família | | ✓ | ✓ |

`plan` (`{ name, seats }`) só pode ser gravado pelo servidor (Admin SDK). Sem plano, o limite é 5 pessoas.
