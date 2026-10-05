import { arrayUnion, writeBatch } from 'firebase/firestore'
import { db } from '../firebase'
import { trimPriceHistory } from './prices.js'

// Firestore aceita até 500 operações por batch
const BATCH_LIMIT = 450

// ops: lista de funções (batch) => void
// Todos os lotes são enfileirados na hora (funciona offline); a promessa resolve quando o servidor confirmar.
export function commitInChunks(ops) {
  const commits = []
  for (let i = 0; i < ops.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db)
    ops.slice(i, i + BATCH_LIMIT).forEach(op => op(batch))
    commits.push(batch.commit())
  }
  return Promise.all(commits)
}

// Grava sem esperar o servidor. Offline, o Firestore guarda na fila e sincroniza depois;
// esperar a promessa travaria a tela até a internet voltar.
export function queueWrite(promise, what = 'salvar') {
  Promise.resolve(promise).catch(e => {
    console.error(`Erro ao ${what}`, e)
    window.dispatchEvent(new CustomEvent('onlist:write-error', { detail: { what, message: e.message } }))
  })
}

// Valor do campo priceHistory ao registrar um preço. Normalmente arrayUnion (duas pessoas finalizando
// offline não apagam o registro uma da outra); no limite, grava a lista já cortada.
export function priceHistoryWrite(history, entry) {
  return trimPriceHistory(history, entry) ?? arrayUnion(entry)
}

// Reexporta as funções puras para manter os imports existentes
export { localDate, parsePrice, fmtDate, normalizePriceHistory } from './format.js'
