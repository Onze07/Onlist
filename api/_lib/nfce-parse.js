// Leitura da página de consulta da NFC-e (layout nacional "xsl/v202", usado pela SEFAZ-RO e outros estados).
// Funções puras: recebem HTML (já decodificado) e devolvem dados estruturados.

function text(html) {
  return String(html || '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim()
}

// "1.234,56" -> 1234.56
export function brNumber(s) {
  const m = String(s || '').match(/-?\d[\d.]*(?:,\d+)?/)
  if (!m) return 0
  return Number(m[0].replace(/\./g, '').replace(',', '.')) || 0
}

function byClass(html, cls) {
  const re = new RegExp(`<[^>]+class="[^"]*\\b${cls}\\b[^"]*"[^>]*>([\\s\\S]*?)</(?:span|div|td|label)>`, 'i')
  const m = html.match(re)
  return m ? text(m[1]) : ''
}

export function isCaptchaPage(html) {
  return /name="sefin_response"/i.test(html) || /preencha o captcha/i.test(html)
}

export function extractCaptcha(html) {
  const img = html.match(/<img[^>]+src="(data:image\/[a-z]+;base64,[^"]+)"/i)
  const csrf = html.match(/name="csrf_token"[^>]*value="([^"]+)"/i) || html.match(/value="([^"]+)"[^>]*name="csrf_token"/i)
  const action = html.match(/<form[^>]+id="form_nfce"[^>]+action="([^"]+)"/i)
  return { image: img?.[1] || null, csrf: csrf?.[1] || null, action: action?.[1] || 'dados_nfce.jsp' }
}

// Fuso do estado emissor (código IBGE no início da chave). Padrão: horário de Brasília.
const UF_OFFSET = { 12: '-05:00', 11: '-04:00', 13: '-04:00', 14: '-04:00', 50: '-04:00', 51: '-04:00' }
export function ufOffset(key) {
  return UF_OFFSET[String(key || '').slice(0, 2)] || '-03:00'
}

export function parseNfce(html) {
  // Itens: <tr id="Item + 1"> ... </tr>
  const items = []
  const rows = html.match(/<tr[^>]*id="Item[^"]*"[\s\S]*?<\/tr>/gi) || []
  for (const row of rows) {
    const name = byClass(row, 'txtTit2') || byClass(row, 'txtTit')
    const code = (byClass(row, 'RCod').match(/\d{4,}/) || [''])[0]
    const qty = brNumber(byClass(row, 'Rqtd').replace(/qtde\.?:?/i, ''))
    const unit = byClass(row, 'RUN').replace(/UN\s*:/i, '').trim()
    const unitPrice = brNumber(byClass(row, 'RvlUnit').replace(/vl\.?\s*unit\.?:?/i, ''))
    const total = brNumber(byClass(row, 'valor'))
    if (name) items.push({ name, code, qty: qty || 1, unit: unit.toUpperCase(), unitPrice, total: total || Math.round(qty * unitPrice * 100) / 100 })
  }

  const store = text((html.match(/id="u20"[^>]*>([\s\S]*?)<\/div>/i) || [])[1]) || byClass(html, 'txtTopo')
  const cnpjMatch = html.match(/CNPJ:?\s*([\d./-]{14,18})/i)
  const cnpj = cnpjMatch ? cnpjMatch[1].replace(/\D/g, '') : ''

  const plain = text(html)
  const emission = plain.match(/Emiss[ãa]o:?\s*(\d{2}\/\d{2}\/\d{4})\s+(\d{2}:\d{2}(?::\d{2})?)/i)
  const keyMatch = plain.match(/((?:\d{4}\s?){10}\d{4})/)
  const key = keyMatch ? keyMatch[1].replace(/\s/g, '') : null
  let issuedAt = null
  if (emission) {
    const [d, m, y] = emission[1].split('/')
    issuedAt = `${y}-${m}-${d}T${emission[2].length === 5 ? emission[2] + ':00' : emission[2]}${ufOffset(key)}`
  }
  const totalMatch = plain.match(/Valor a pagar R\$:?\s*([\d.,]+)/i) || plain.match(/Valor total R\$:?\s*([\d.,]+)/i)
  const discountMatch = plain.match(/Descontos? R\$:?\s*([\d.,]+)/i)

  const sum = Math.round(items.reduce((s, i) => s + i.total, 0) * 100) / 100
  return {
    store,
    cnpj,
    issuedAt,
    total: totalMatch ? brNumber(totalMatch[1]) : sum,
    discount: discountMatch ? brNumber(discountMatch[1]) : 0,
    key,
    items,
  }
}

// Link do QR code: só aceita portais oficiais .gov.br
export function validNfceUrl(raw) {
  let url
  try { url = new URL(String(raw).trim()) } catch { return null }
  if (!/\.gov\.br$/i.test(url.hostname)) return null
  const p = url.searchParams.get('p') || ''
  const key = (p.match(/\d{44}/) || [])[0]
  if (!key) return null
  return { url: url.toString(), key, uf: key.slice(0, 2) }
}
