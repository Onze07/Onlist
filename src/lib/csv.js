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
