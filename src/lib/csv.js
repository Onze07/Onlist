// CSV no padrão do Excel em português: separador ";", decimal com vírgula e BOM UTF-8
function cell(value) {
  if (value === null || value === undefined) return ''
  const s = typeof value === 'number' ? String(value).replace('.', ',') : String(value)
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function toCsv(header, rows) {
  return '﻿' + [header, ...rows].map(r => r.map(cell).join(';')).join('\r\n')
}

export function downloadFile(filename, content, type = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// Compras (history) → CSV, uma linha por item
export function historyCsv(records) {
  const rows = []
  for (const r of records) {
    const d = r.createdAt?.toDate ? r.createdAt.toDate() : null
    const date = d ? d.toLocaleDateString('pt-BR') : ''
    for (const item of r.items || []) {
      rows.push([date, r.mercado, r.listName || '', item.name, item.category || '', item.qty, item.unit,
        Number(item.pricePerUnit) || 0, Number(item.totalPrice) || 0])
    }
    // Comprados sem acompanhar preço: entram para a planilha somar o total pago
    for (const item of r.otherItems || []) {
      const qty = Number(item.qty) || 1
      rows.push([date, r.mercado, r.listName || '', item.name, 'Sem acompanhamento', qty, item.unit || '',
        Math.round(((Number(item.totalPrice) || 0) / qty) * 100) / 100, Number(item.totalPrice) || 0])
    }
  }
  return toCsv(['Data', 'Mercado', 'Lista', 'Item', 'Categoria', 'Quantidade', 'Unidade', 'Preço unitário', 'Total'], rows)
}
