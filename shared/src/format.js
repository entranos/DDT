// Number formatting shared by labels, tooltips, the inspector and exports.
// Uses Dutch notation (1.234,5) as the editor always has.

const formatters = new Map()

function formatter (decimals) {
  const key = Math.max(0, Math.min(10, Math.round(decimals)))
  if (!formatters.has(key)) {
    formatters.set(key, new Intl.NumberFormat('de-DE', { minimumFractionDigits: key, maximumFractionDigits: key }))
  }
  return formatters.get(key)
}

export function formatNumber (value, decimals = 1) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return String(value ?? '')
  return formatter(decimals).format(value)
}

// Value label text. Values between 0 and 0.5 show as 0, as in earlier versions,
// while their flows stay visible as thin lines.
export function formatValue (value, decimals = 1, unit = '') {
  const shown = value > 0 && value < 0.5 ? 0 : value
  const text = formatNumber(shown, decimals)
  return unit ? `${text} ${unit}` : text
}

// Amounts in a diagram. decimals: a number, or 'auto': more for small numbers, without
// trailing zeros.
export function formatAuto (value, decimals = 'auto') {
  if (decimals !== 'auto') return formatNumber(value, Number(decimals))
  const a = Math.abs(value)
  let dec = a >= 100 ? 0 : a >= 10 ? 1 : 2
  while (dec > 0 && Math.round(a * 10 ** dec) % 10 === 0) dec -= 1
  return formatNumber(value, dec)
}

// Compact number for inputs and grids: plain JS notation, no trailing noise.
export function plainNumber (value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return value ?? ''
  return String(Math.round(value * 1e9) / 1e9)
}
