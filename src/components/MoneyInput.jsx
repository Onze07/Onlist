import { formatMoney, textToValue } from '../lib/money'

// Campo de dinheiro: digite só números, os centavos se ajustam sozinhos (599 → 5,99)
export default function MoneyInput({ value, onChange, decimals = 2, className = '', placeholder, ...rest }) {
  const zero = (0).toFixed(decimals).replace('.', ',')

  function keepCaretAtEnd(e) {
    const el = e.target
    requestAnimationFrame(() => el.setSelectionRange?.(el.value.length, el.value.length))
  }

  return (
    <input
      {...rest}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      value={formatMoney(value, decimals)}
      onChange={e => onChange(textToValue(e.target.value, decimals))}
      onFocus={keepCaretAtEnd}
      onClick={keepCaretAtEnd}
      placeholder={placeholder ?? `R$ ${zero}`}
      className={className}
    />
  )
}
