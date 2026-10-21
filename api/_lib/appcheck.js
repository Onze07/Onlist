// App Check: confirma que a chamada veio do app publicado (e não de um script usando a chave).
// O app manda o token no cabeçalho X-Firebase-AppCheck. Com APPCHECK_ENFORCE=1 na Vercel,
// chamada sem token válido é recusada; sem a variável, só valida quando o token vem (fase de teste).
import { getAppCheck } from 'firebase-admin/app-check'

export const APPCHECK_ERROR = 'Não foi possível confirmar o app. Feche e abra de novo.'

export async function appCheckOk(req, enforce = process.env.APPCHECK_ENFORCE === '1') {
  const token = req.headers['x-firebase-appcheck']
  if (!token) return !enforce
  try {
    await getAppCheck().verifyToken(String(token))
    return true
  } catch {
    return !enforce
  }
}
