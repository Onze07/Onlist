// Correspondência entre itens da nota (NFC-e) e o catálogo. Funções puras.

export const UNITS = ['un', 'kg', 'g', 'l', 'ml', 'dz', 'cx', 'pct', 'bl', 'fd', 'sc', 'bdj', 'lata', 'gf', 'pote', 'fr', 'rl', 'par']

export const UNIT_LABELS = {
  un: 'unidade', kg: 'quilo', g: 'grama', l: 'litro', ml: 'mililitro', dz: 'dúzia', cx: 'caixa', pct: 'pacote',
  bl: 'blister', fd: 'fardo', sc: 'saco', bdj: 'bandeja', lata: 'lata', gf: 'garrafa', pote: 'pote', fr: 'frasco',
  rl: 'rolo', par: 'par',
}

const UNIT_ALIASES = {
  un: ['UN', 'UND', 'UNID', 'UNIDADE', 'U', 'PC', 'PÇ', 'PECA', 'PEÇA'],
  kg: ['KG', 'KGR', 'KGS', 'QUILO'],
  g: ['G', 'GR', 'GRS', 'GRAMA'],
  l: ['L', 'LT', 'LTS', 'LITRO'],
  ml: ['ML'],
  dz: ['DZ', 'DUZIA', 'DÚZIA'],
  cx: ['CX', 'CAIXA'],
  pct: ['PCT', 'PACOTE', 'PAC', 'PT'],
  bl: ['BL', 'BLISTER', 'BLT'],
  fd: ['FD', 'FARDO'],
  sc: ['SC', 'SACO', 'SACHE', 'SACHÊ'],
  bdj: ['BDJ', 'BANDEJA', 'BJ'],
  lata: ['LATA', 'LA'],
  gf: ['GF', 'GARRAFA', 'GARR'],
  pote: ['POTE'],
  fr: ['FR', 'FRASCO', 'FRC'],
  rl: ['RL', 'ROLO'],
  par: ['PAR', 'PR'],
}

export function mapUnit(raw) {
  const u = String(raw || '').trim().toUpperCase()
  for (const [key, aliases] of Object.entries(UNIT_ALIASES)) if (aliases.includes(u)) return key
  return 'un'
}

export function normalize(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
}

// "ARROZ T1 TIO JOAO 5KG" -> { amount: 5, unit: 'kg' }
export function packSize(desc) {
  const m = String(desc || '').toUpperCase().match(/(\d+(?:[.,]\d+)?)\s*(KG|KGS|G|GR|GRS|L|LT|LTS|ML)\b/)
  if (!m) return null
  return { amount: Number(m[1].replace(',', '.')), unit: mapUnit(m[2]) }
}

// Converte o item da nota para a unidade do produto do catálogo quando dá (ex.: pacote de 5 kg -> kg)
export function convertForUnit(item, targetUnit) {
  const unit = mapUnit(item.unit)
  const base = { qty: item.qty, unitPrice: item.unitPrice, unit, converted: false }
  if (!targetUnit || unit === targetUnit) return { ...base, unit: targetUnit || unit }
  const size = packSize(item.name)
  if (size) {
    const factor = size.unit === targetUnit ? size.amount
      : size.unit === 'g' && targetUnit === 'kg' ? size.amount / 1000
      : size.unit === 'kg' && targetUnit === 'g' ? size.amount * 1000
      : size.unit === 'ml' && targetUnit === 'l' ? size.amount / 1000
      : size.unit === 'l' && targetUnit === 'ml' ? size.amount * 1000
      : null
    if (factor) {
      return {
        qty: Math.round(item.qty * factor * 1000) / 1000,
        unitPrice: Math.round((item.unitPrice / factor) * 100) / 100,
        unit: targetUnit,
        converted: true,
      }
    }
  }
  return base
}

const STOP = new Set(['de', 'da', 'do', 'com', 'sem', 'e', 'tp', 'tipo', 'und', 'un', 'kg', 'g', 'gr', 'l', 'lt', 'ml', 'pct', 'cx', 'rg'])

function tokens(s) {
  return normalize(s).split(' ').filter(t => t.length > 1 && !STOP.has(t) && !/^\d/.test(t))
}

// Nome genérico sugerido: primeira palavra significativa, com inicial maiúscula ("BANANA MACA RG" -> "Banana")
export function genericName(desc) {
  const t = tokens(desc)[0] || normalize(desc).split(' ')[0] || 'Item'
  return t.charAt(0).toUpperCase() + t.slice(1)
}

// Produtos do catálogo parecidos com a descrição da nota, do mais provável ao menos
export function candidates(desc, catalogItems) {
  const descTokens = new Set(tokens(desc))
  const out = []
  for (const item of catalogItems) {
    const t = tokens(item.name)
    if (!t.length) continue
    const hits = t.filter(x => descTokens.has(x)).length
    if (!hits) continue
    const score = hits / t.length - (t[0] && !descTokens.has(t[0]) ? 0.25 : 0)
    out.push({ item, score })
  }
  return out.sort((a, b) => b.score - a.score || a.item.name.length - b.item.name.length)
}

// Decide o destino de cada item: mapeamento salvo > produto parecido (todas as palavras batem) > novo produto genérico
export function suggestTarget(nfItem, catalogItems, mappings = {}) {
  const mapped = nfItem.code && mappings[nfItem.code]
  if (mapped) {
    const item = catalogItems.find(c => c.id === mapped.catalogId)
    if (item) return { type: 'existing', item, reason: 'lembrado' }
  }
  const list = candidates(nfItem.name, catalogItems)
  if (list[0] && list[0].score >= 1) return { type: 'existing', item: list[0].item, reason: 'parecido', alternatives: list.slice(1, 4).map(c => c.item) }
  return { type: 'new', name: genericName(nfItem.name), alternatives: list.slice(0, 4).map(c => c.item) }
}

// "IRMAOS GONCALVES COMERCIO E INDUSTRIA LTDA" -> "Irmaos Goncalves" (ou o nome já usado pela família)
export function marketName(store, knownMarkets = []) {
  const clean = normalize(store).split(' ')
    .filter(w => !['ltda', 'me', 'epp', 'eireli', 'sa', 'comercio', 'industria', 'e', 'de', 'do', 'da', 'supermercado', 'supermercados', 'mercado', 'atacadista', 'distribuidora'].includes(w))
  const short = clean.slice(0, 3).join(' ')
  const known = knownMarkets.find(m => {
    const k = normalize(m)
    return k && (short.startsWith(k) || k.startsWith(short) || normalize(store).includes(k))
  })
  if (known) return known
  return short.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') || 'Mercado'
}
