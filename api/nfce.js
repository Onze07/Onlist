// POST /api/nfce — lê uma NFC-e no portal da SEFAZ (RO e outros estados com o layout nacional)
//   { action: 'start', url }                 -> { session, captcha }  (imagem do captcha da SEFAZ)
//   { action: 'submit', session, answer }    -> { nota } | { captcha, session, error }
// O usuário digita o captcha no app; nada é resolvido automaticamente.
import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import { initializeApp, cert, getApps } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'
import { logError, sanitize } from './_lib/errlog.js'
import { RateLimitError, hit } from './_lib/ratelimit.js'
import { parseNfce, isCaptchaPage, extractCaptcha, validNfceUrl, keyInfo, classifyPage, notFoundMessage, parseAccessKey, keyConsultUrls } from './_lib/nfce-parse.js'
import { APPCHECK_ERROR, appCheckOk } from './_lib/appcheck.js'

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148'

function app() {
  if (getApps().length) return getApps()[0]
  return initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) })
}

function mergeCookies(jar, res) {
  const list = res.headers.getSetCookie?.() || []
  for (const c of list) {
    const [pair] = c.split(';')
    const i = pair.indexOf('=')
    if (i > 0) jar[pair.slice(0, i).trim()] = pair.slice(i + 1).trim()
  }
  return jar
}

function cookieHeader(jar) {
  return Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ')
}

// Só portais oficiais: cada endereço (inclusive redirecionamentos e o da sessão do captcha,
// que volta do app) precisa ser http(s) em .gov.br. Impede usar o servidor para acessar outros sites.
export function isGovUrl(raw) {
  try {
    const u = new URL(String(raw))
    return (u.protocol === 'https:' || u.protocol === 'http:') && /\.gov\.br$/i.test(u.hostname) && !u.username && !u.password && !u.port
  } catch { return false }
}

// Falha de rede ao falar com a SEFAZ (portal fora do ar, lento ou recusando conexão)
const NET_CODES = new Set(['UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_SOCKET', 'ECONNREFUSED', 'ECONNRESET', 'ENOTFOUND', 'EAI_AGAIN', 'ETIMEDOUT', 'EHOSTUNREACH', 'ENETUNREACH'])
export function isNetworkError(e) {
  if (!e) return false
  if (e.name === 'TimeoutError' || e.name === 'AbortError') return true
  return NET_CODES.has(e.code) || NET_CODES.has(e.cause?.code) || (e.name === 'TypeError' && /fetch failed/i.test(e.message))
}

// fetch com cookies e redirecionamentos manuais (a SEFAZ redireciona http -> https e define a sessão)
// Endereço http: tenta direto o https (é para lá que a SEFAZ redireciona); se o https não conectar, usa o http.
async function request(url, opts = {}) {
  if (/^http:\/\//i.test(url)) {
    try {
      return await requestOnce(url.replace(/^http:/i, 'https:'), { ...opts, jar: { ...(opts.jar || {}) }, timeoutMs: 9000 })
    } catch (e) {
      if (!isNetworkError(e)) throw e
    }
  }
  return requestOnce(url, opts)
}

async function requestOnce(url, { method = 'GET', body, jar = {}, referer, timeoutMs = 20000 } = {}) {
  let current = url
  for (let i = 0; i < 6; i++) {
    if (!isGovUrl(current)) throw new Error('Endereço fora do portal da SEFAZ')
    const res = await fetch(current, {
      method,
      body,
      redirect: 'manual',
      headers: {
        'User-Agent': UA,
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'pt-BR,pt;q=0.9',
        ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
        ...(referer ? { Referer: referer } : {}),
        ...(Object.keys(jar).length ? { Cookie: cookieHeader(jar) } : {}),
      },
      signal: AbortSignal.timeout(timeoutMs),
    })
    mergeCookies(jar, res)
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      current = new URL(res.headers.get('location'), current).toString()
      method = 'GET'
      body = undefined
      continue
    }
    const buf = await res.arrayBuffer()
    const type = res.headers.get('content-type') || ''
    const charset = (type.match(/charset=([\w-]+)/i) || [])[1] || 'windows-1252'
    let html
    try { html = new TextDecoder(charset).decode(buf) } catch { html = new TextDecoder('windows-1252').decode(buf) }
    return { status: res.status, html, url: current, jar }
  }
  throw new Error('Muitos redirecionamentos')
}

// Sessão do captcha vai e volta pelo app: assinada (HMAC), presa ao usuário e com validade curta.
// Assim ninguém monta uma sessão à mão nem reaproveita a de outra pessoa.
const SESSION_TTL_MS = 15 * 60 * 1000
const sessionKey = (secret = process.env.FIREBASE_SERVICE_ACCOUNT || '') =>
  createHash('sha256').update(`onlist-nfce-session|${secret}`).digest()

export function sealSession(obj, uid, now = Date.now(), key = sessionKey()) {
  const payload = Buffer.from(JSON.stringify({ ...obj, uid, exp: now + SESSION_TTL_MS })).toString('base64url')
  const sig = createHmac('sha256', key).update(payload).digest('base64url')
  return `${payload}.${sig}`
}

// Devolve a sessão ou null (assinatura errada, outro usuário, vencida)
export function openSession(str, uid, now = Date.now(), key = sessionKey()) {
  const [payload, sig] = String(str || '').split('.')
  if (!payload || !sig) return null
  const want = createHmac('sha256', key).update(payload).digest()
  const got = Buffer.from(sig, 'base64url')
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null
  try {
    const s = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    if (s.uid !== uid || !(s.exp > now)) return null
    return s
  } catch { return null }
}

function captchaResponse(page, jar, url, byKey, ctx) {
  const c = extractCaptcha(page.html)
  if (!c.image || !c.csrf) return null
  return { captcha: c.image, session: sealSession({ jar, csrf: c.csrf, action: new URL(c.action, page.url).toString(), referer: page.url, url, byKey: !!byKey }, ctx?.uid) }
}

const KEY_ONLY_REFUSED = 'A SEFAZ não aceitou a consulta só pela chave. Use o QR code ou copie o link "Visualizar NFC-e" no app Nota Legal e cole aqui.'

// Consulta digitando/colando a chave de acesso (QR danificado, chave copiada de outro app)
async function startByKey(res, rawKey, ctx) {
  const parsed = parseAccessKey(rawKey)
  if (parsed.error) return res.status(400).json({ error: parsed.error })
  const urls = keyConsultUrls(parsed.key)
  if (!urls.length) return res.status(400).json({ error: 'Por enquanto, a consulta pela chave funciona só para notas de Rondônia. Use o QR code.' })
  const contingency = !!keyInfo(parsed.key)?.contingency
  for (const url of urls) {
    const page = await request(url)
    if (page.status >= 400) continue
    if (isCaptchaPage(page.html)) {
      const out = captchaResponse(page, page.jar, url, true, ctx)
      if (out) return res.status(200).json({ ...out, key: parsed.key, contingency })
      continue
    }
    const nota = parseNfce(page.html)
    if (nota.items.length) {
      if (!nota.issuedAt) await logLayout(page.html, ctx, 'Data de emissão não encontrada na nota')
      return res.status(200).json({ nota: { ...nota, key: nota.key || parsed.key } })
    }
    if (classifyPage(page.html)) return noItems(res, page.html, parsed.key, ctx)
    await logLayout(page.html, ctx, 'Consulta pela chave: página não reconhecida')
  }
  return res.status(422).json({ error: KEY_ONLY_REFUSED, reason: 'key_refused', key: parsed.key })
}

// Log sem dados pessoais (para ajustar o leitor se a SEFAZ mudar o layout).
// Vai para o console da Vercel e para o painel (/admin → Erros), que guarda por 30 dias.
function logLayout(html, ctx, message = 'Página da SEFAZ não reconhecida') {
  const body = html.slice(html.search(/<body/i) >= 0 ? html.search(/<body/i) : 0)
  const clean = sanitize(body.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/\s+/g, ' '), 6000)
  // O texto da página fica só no painel (mascarado, 30 dias); o log da Vercel recebe só o aviso
  console.log('nfce-layout', message, clean.length)
  return logError(ctx?.fs, { source: 'nfce', kind: 'layout', message, detail: clean, uid: ctx?.uid, email: ctx?.email, path: '/api/nfce' })
}

// Página sem itens: explica o motivo (ex.: nota em contingência ainda não enviada) e diz se vale tentar depois
async function noItems(res, html, key, ctx) {
  const reason = classifyPage(html)
  if (!reason) await logLayout(html, ctx, 'Nota sem itens e motivo desconhecido')
  const info = keyInfo(key)
  const msg = notFoundMessage(reason, info)
  return res.status(422).json({ ...msg, reason: reason || 'unknown', contingency: !!info?.contingency, key: key || null })
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST' })
  if (!process.env.FIREBASE_SERVICE_ACCOUNT) return res.status(500).json({ error: 'Servidor não configurado' })

  let ctx = null
  try {
    app()
    const idToken = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '')
    let token
    try { token = await getAuth().verifyIdToken(idToken) } catch { return res.status(401).json({ error: 'Faça login novamente' }) }
    ctx = { fs: getFirestore(), uid: token.uid, email: token.email }
    // Protege o servidor de ser bloqueado pela SEFAZ por excesso de consultas
    await hit(ctx.fs, `nfce_${token.uid}`, { limit: 60, windowSec: 3600, message: 'Muitas consultas de nota seguidas.' })

    // Chamada de fora do app (sem App Check válido) é recusada quando APPCHECK_ENFORCE=1
    if (!(await appCheckOk(req))) return res.status(401).json({ error: APPCHECK_ERROR })

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})

    // Guarda a chave para o caso de a SEFAZ estar fora do ar (o app oferece "ler depois")
    ctx.key = body.key ? parseAccessKey(body.key).key || null : (validNfceUrl(body.url) || {}).key || null
    if (body.action === 'start' && body.key) return await startByKey(res, body.key, ctx)

    if (body.action === 'start') {
      const valid = validNfceUrl(body.url)
      if (!valid) return res.status(400).json({ error: 'Link inválido. Leia o QR code da nota fiscal.' })
      const page = await request(valid.url)
      if (page.status >= 400) return res.status(502).json({ error: `O portal da SEFAZ não respondeu (${page.status}). Tente de novo.` })
      if (!isCaptchaPage(page.html)) {
        const nota = parseNfce(page.html)
        if (nota.items.length) {
          if (!nota.issuedAt) await logLayout(page.html, ctx, 'Data de emissão não encontrada na nota')
          return res.status(200).json({ nota: { ...nota, key: nota.key || valid.key } })
        }
        return await noItems(res, page.html, valid.key, ctx)
      }
      const out = captchaResponse(page, page.jar, valid.url, false, ctx)
      if (!out) { await logLayout(page.html, ctx, 'Captcha da SEFAZ não encontrado'); return res.status(422).json({ error: 'Formato da página da SEFAZ mudou.' }) }
      return res.status(200).json({ ...out, key: valid.key, contingency: !!keyInfo(valid.key)?.contingency })
    }

    if (body.action === 'submit') {
      const s = openSession(body.session, ctx.uid)
      if (!s) return res.status(400).json({ error: 'A consulta expirou. Leia a nota de novo.' })
      // Segunda trava: todos os endereços da sessão precisam ser do portal oficial
      if (!isGovUrl(s?.action) || !isGovUrl(s?.url) || (s.referer && !isGovUrl(s.referer))) {
        return res.status(400).json({ error: 'Sessão inválida. Leia a nota de novo.' })
      }
      const answer = String(body.answer || '').trim()
      if (!answer) return res.status(400).json({ error: 'Digite o texto da imagem' })
      const form = new URLSearchParams({ sefin_response: answer, csrf_token: s.csrf })
      const page = await request(s.action, { method: 'POST', body: form.toString(), jar: s.jar, referer: s.referer })
      if (isCaptchaPage(page.html)) {
        const out = captchaResponse(page, page.jar, s.url, s.byKey, ctx)
        return res.status(200).json({ ...(out || {}), error: 'Texto incorreto. Tente de novo.' })
      }
      const nota = parseNfce(page.html)
      const urlKey = (validNfceUrl(s.url) || {}).key || null
      if (!nota.items.length) {
        // Só pela chave: página sem motivo conhecido provavelmente é a SEFAZ exigindo o código do QR
        if (s.byKey && !classifyPage(page.html)) {
          await logLayout(page.html, ctx, 'Consulta pela chave recusada após o captcha')
          return res.status(422).json({ error: KEY_ONLY_REFUSED, reason: 'key_refused', key: urlKey })
        }
        return await noItems(res, page.html, nota.key || urlKey, ctx)
      }
      const key = nota.key || urlKey
      if (!nota.issuedAt) await logLayout(page.html, ctx, 'Data de emissão não encontrada na nota')
      return res.status(200).json({ nota: { ...nota, key } })
    }

    return res.status(400).json({ error: 'Pedido inválido' })
  } catch (e) {
    if (e instanceof RateLimitError) return res.status(429).json({ error: e.message, retryAfter: e.retryAfter })
    console.error('nfce', e)
    // Portal da SEFAZ fora do ar/lento: não é erro do app; oferece guardar a nota e ler depois
    const offline = isNetworkError(e)
    await logError(ctx?.fs, {
      source: 'nfce', kind: offline ? 'sefaz_offline' : 'exception',
      message: offline ? `Portal da SEFAZ sem resposta (${e.cause?.code || e.name})` : `Falha na consulta: ${e.message}`,
      detail: e.stack, uid: ctx?.uid, email: ctx?.email, path: '/api/nfce',
    })
    if (offline) {
      return res.status(503).json({
        error: 'O portal da SEFAZ não está respondendo agora. Guarde a nota para ler depois ou tente de novo em alguns minutos.',
        retryLater: true, reason: 'offline', key: ctx?.key || null,
      })
    }
    return res.status(502).json({ error: 'Não foi possível consultar a nota agora.' })
  }
}
