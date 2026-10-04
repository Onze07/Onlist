// POST /api/nfce — lê uma NFC-e no portal da SEFAZ (RO e outros estados com o layout nacional)
//   { action: 'start', url }                 -> { session, captcha }  (imagem do captcha da SEFAZ)
//   { action: 'submit', session, answer }    -> { nota } | { captcha, session, error }
// O usuário digita o captcha no app; nada é resolvido automaticamente.
import { initializeApp, cert, getApps } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { parseNfce, isCaptchaPage, extractCaptcha, validNfceUrl } from './_lib/nfce-parse.js'

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

// fetch com cookies e redirecionamentos manuais (a SEFAZ redireciona http -> https e define a sessão)
async function request(url, { method = 'GET', body, jar = {}, referer } = {}) {
  let current = url
  for (let i = 0; i < 6; i++) {
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
      signal: AbortSignal.timeout(20000),
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

const encode = obj => Buffer.from(JSON.stringify(obj)).toString('base64url')
const decode = str => JSON.parse(Buffer.from(String(str), 'base64url').toString('utf8'))

function captchaResponse(page, jar, url) {
  const c = extractCaptcha(page.html)
  if (!c.image || !c.csrf) return null
  return { captcha: c.image, session: encode({ jar, csrf: c.csrf, action: new URL(c.action, page.url).toString(), referer: page.url, url }) }
}

// Log sem dados pessoais (para ajustar o leitor se a SEFAZ mudar o layout)
function logLayout(html) {
  const safe = html.replace(/\d{3}\.?\d{3}\.?\d{3}-?\d{2}/g, '[cpf]').replace(/base64,[A-Za-z0-9+/=]+/g, 'base64,[img]')
  const body = safe.slice(safe.search(/<body/i) >= 0 ? safe.search(/<body/i) : 0)
  console.log('nfce-layout', body.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/\s+/g, ' ').slice(0, 6000))
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST' })
  if (!process.env.FIREBASE_SERVICE_ACCOUNT) return res.status(500).json({ error: 'Servidor não configurado' })

  try {
    app()
    const idToken = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '')
    try { await getAuth().verifyIdToken(idToken) } catch { return res.status(401).json({ error: 'Faça login novamente' }) }

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})

    if (body.action === 'start') {
      const valid = validNfceUrl(body.url)
      if (!valid) return res.status(400).json({ error: 'Link inválido. Leia o QR code da nota fiscal.' })
      const page = await request(valid.url)
      if (page.status >= 400) return res.status(502).json({ error: `O portal da SEFAZ não respondeu (${page.status}). Tente de novo.` })
      if (!isCaptchaPage(page.html)) {
        const nota = parseNfce(page.html)
        if (nota.items.length) return res.status(200).json({ nota: { ...nota, key: nota.key || valid.key } })
        logLayout(page.html)
        return res.status(422).json({ error: 'Não foi possível ler esta nota.' })
      }
      const out = captchaResponse(page, page.jar, valid.url)
      if (!out) { logLayout(page.html); return res.status(422).json({ error: 'Formato da página da SEFAZ mudou.' }) }
      return res.status(200).json({ ...out, key: valid.key })
    }

    if (body.action === 'submit') {
      const s = decode(body.session)
      const answer = String(body.answer || '').trim()
      if (!answer) return res.status(400).json({ error: 'Digite o texto da imagem' })
      const form = new URLSearchParams({ sefin_response: answer, csrf_token: s.csrf })
      const page = await request(s.action, { method: 'POST', body: form.toString(), jar: s.jar, referer: s.referer })
      if (isCaptchaPage(page.html)) {
        const out = captchaResponse(page, page.jar, s.url)
        return res.status(200).json({ ...(out || {}), error: 'Texto incorreto. Tente de novo.' })
      }
      const nota = parseNfce(page.html)
      if (!nota.items.length) {
        logLayout(page.html)
        return res.status(422).json({ error: 'Não foi possível ler os itens desta nota.' })
      }
      const key = nota.key || (validNfceUrl(s.url) || {}).key || null
      return res.status(200).json({ nota: { ...nota, key } })
    }

    return res.status(400).json({ error: 'Pedido inválido' })
  } catch (e) {
    console.error('nfce', e)
    const timeout = e.name === 'TimeoutError' || e.name === 'AbortError'
    return res.status(502).json({ error: timeout ? 'O portal da SEFAZ demorou demais. Tente de novo.' : 'Não foi possível consultar a nota agora.' })
  }
}
