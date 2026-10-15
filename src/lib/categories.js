// Categorias dos produtos, na ordem do caminho no mercado (lista e catálogo seguem esta ordem).
// Farmácia e Automotivo ficam no fim: normalmente são outra loja.
export const CATEGORIES = [
  'Hortifruti', 'Padaria', 'Carne', 'Laticínios', 'Congelados', 'Mercearia', 'Bebidas',
  'Limpeza', 'Higiene', 'Bebê', 'Pet', 'Casa e Utilidades', 'Farmácia', 'Automotivo', 'Outros',
]

// Exemplos mostrados no cadastro, para deixar claro o que entra em cada uma
export const CATEGORY_EXAMPLES = {
  Hortifruti: 'frutas, verduras, legumes, ovos',
  Padaria: 'pão, bolo, biscoito, torrada',
  Carne: 'bovina, frango, peixe, linguiça',
  Laticínios: 'leite, queijo, iogurte, manteiga, presunto',
  Congelados: 'pizza, sorvete, lasanha, nuggets',
  Mercearia: 'arroz, feijão, café, óleo, molhos',
  Bebidas: 'água, suco, refrigerante, cerveja',
  Limpeza: 'sabão, detergente, desinfetante, esponja',
  Higiene: 'sabonete, shampoo, papel higiênico, pasta de dente',
  Bebê: 'fraldas, lenços, leite em pó, papinha',
  Pet: 'ração, areia, petiscos, antipulgas',
  'Casa e Utilidades': 'pilhas, lâmpadas, potes, papel filme, assadeira',
  Farmácia: 'remédios, vitaminas, curativos, termômetro',
  Automotivo: 'óleo de motor, filtro, peças, aditivo, lavagem',
  Outros: 'o que não se encaixa nas outras',
}

// Ordena grupos pela ordem acima; categorias antigas/desconhecidas aparecem antes de "Outros" (nunca somem)
export function orderCategories(names) {
  const known = CATEGORIES.filter(c => names.includes(c) && c !== 'Outros')
  const unknown = names.filter(c => !CATEGORIES.includes(c)).sort()
  return [...known, ...unknown, ...(names.includes('Outros') ? ['Outros'] : [])]
}

const normalize = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()

// Palavras-chave por categoria. A ordem importa: "óleo de motor" é Automotivo antes de "óleo" ser Mercearia,
// "batata palito" é Congelados antes de "batata" ser Hortifruti, leite infantil é Bebê antes de Laticínios.
const RULES = [
  ['Automotivo', /\b(LUBRIFICANTE|OLEO (DE )?MOTOR|OLEO LUBR|\d{1,2}W-?\d{2}|FILTRO (DE )?(OLEO|AR|COMBUST)|ADITIVO (RADIADOR|ARREF)|ARLA|FLUIDO (DE )?FREIO|PALHETA|PNEU|VELA (DE )?IGNI|AUTOMOTIV|ARREFECIMENTO)/],
  ['Farmácia', /\b(DIPIRONA|PARACETAMOL|IBUPROFENO|DORFLEX|NEOSALDINA|ENGOV|VITAMINA|COMPRIMIDOS?|CAPSULAS?|XAROPE|POMADA|CURATIVO|BAND-?AID|ESPARADRAPO|GAZE|TERMOMETRO|DRAMIN|OMEPRAZOL|LOSARTANA|SORO FISIOL|ANTIALERG|\d+ ?MG)\b/],
  ['Bebê', /\b(FRALDAS?|LENCOS? UMEDECIDOS?|PAPINHA|MAMADEIRA|CHUPETA|NAN|APTAMIL|MUCILON|NESTOGENO|ASSADURA)\b/],
  ['Pet', /\b(RACAO|AREIA (SANITARIA|HIGIENICA|GATO)|PETISCO|ANTIPULGAS?|WHISKAS|PEDIGREE|FRISKIES|GOLDEN|PREMIER PET|CAES|GATOS|PET)\b/],
  ['Congelados', /\b(CONGELAD[OA]S?|SORVETE|PICOLE|PIZZA|LASANHA|NUGGETS?|HAMBURGUER|BATATA (PALITO|PRE[- ]?FRITA)|POLPA)\b/],
  ['Casa e Utilidades', /\b(PILHAS?|LAMPADA|ASSADEIRA|POTES?|CESTO|ORGANIZADOR|PAPEL FILME|FILME PVC|PAPEL ALUMINIO|ISQUEIRO|FOSFOROS?|PANELA|TOALHA|VELAS?|TAPETE|CABIDE)\b/],
  ['Limpeza', /\b(DETERGENTE|SABAO|AMACIANTE|DESINFETANTE|AGUA SANITARIA|ALVEJANTE|ESPONJA|LIMPADOR|MULTIUSO|SACOS? (DE |P\/ ?)?LIXO|LUSTRA|INSETICIDA|DESENGORDURANTE|LIMPA)\b/],
  ['Higiene', /\b(SABONETE|SHAMPOO|CONDICIONADOR|CREME DENTAL|PASTA DENTAL|ESCOVA DENTAL|DESODORANTE|PAPEL HIGIENICO|ABSORVENTE|FIO DENTAL|HIDRATANTE|BARBEAR|COTONETE|ENXAGUANTE)\b/],
  ['Bebidas', /\b(REFRIGERANTE|REFRI|COCA|GUARANA|SUCO|AGUA MINERAL|AGUA (C|S)\/ ?GAS|CERVEJA|VINHO|CACHACA|ENERGETICO|ISOTONICO|CHA GELADO)\b/],
  ['Laticínios', /\b(LEITE|QUEIJO|IOGURTE|MANTEIGA|MARGARINA|REQUEIJAO|CREME DE LEITE|PRESUNTO|MUSSARELA|MUCARELA|NATA|COALHADA)\b/],
  ['Carne', /\b(CARNE|BOVIN[OA]|FRANGO|PEITO|COXAS?|SOBRECOXA|LINGUICA|BACON|PEIXE|TILAPIA|PATINHO|ACEM|ALCATRA|COSTELA|CONTRA ?FILE|PICANHA|SALSICHA|MOIDA|SUIN[OA]|PERNIL|FIGADO)\b/],
  ['Padaria', /\b(PAO|PAES|BISNAGUINHA|BOLO|BISCOITO|BOLACHA|TORRADA|ROSCA|PANETTONE|SONHO|CROISSANT)\b/],
  ['Hortifruti', /\b(BANANA|MACA|TOMATE|CEBOLA|ALHO|BATATA|CENOURA|ALFACE|LARANJA|LIMAO|MAMAO|MELANCIA|ABACAXI|UVA|MANGA|OVOS?|PIMENTAO|ABOBORA|CHEIRO VERDE|COUVE|REPOLHO|BETERRABA|CHUCHU|PEPINO|GENGIBRE|MANDIOCA)\b/],
  ['Mercearia', /\b(ARROZ|FEIJAO|ACUCAR|CAFE|OLEO|AZEITE|MACARRAO|FARINHA|SAL|MOLHO|EXTRATO|MILHO|ERVILHA|ATUM|SARDINHA|ACHOCOLATADO|GRANULADO|CHOCOLATE|TEMPERO|VINAGRE|FUBA|AVEIA|MAIONESE|KETCHUP)\b/],
]

// Sugestão pelo nome do produto (nota fiscal ou cadastro). null = não reconhecido.
export function suggestCategory(name) {
  const n = normalize(name)
  if (!n) return null
  for (const [cat, re] of RULES) if (re.test(n)) return cat
  return null
}
