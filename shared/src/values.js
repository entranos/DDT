// Value helpers shared by every editor in the suite.

let uidCounter = 0
const uidPrefix = Math.random().toString(36).slice(2, 6)

// Internal row ids (never written to files), unique within a page session.
export function newUid (kind) {
  uidCounter += 1
  return `${kind}_${uidPrefix}${uidCounter.toString(36)}`
}

export function parseBoolean (value) {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  if (typeof value === 'string') return ['true', 'yes', 'ja', '1', 'y'].includes(value.trim().toLowerCase())
  return false
}

// How a file wrote a yes/no value, so it can be written back the same way.
export function booleanStyle (value) {
  if (typeof value === 'boolean') return 'bool'
  if (typeof value === 'number') return 'number'
  if (typeof value === 'string' && /^(yes|no)$/i.test(value.trim())) return 'yesno'
  if (typeof value === 'string' && /^(true|false)$/i.test(value.trim())) return 'boolstring'
  return 'bool'
}

export function booleanForFile (value, style) {
  const b = parseBoolean(value)
  if (style === 'yesno') return b ? 'Yes' : 'No'
  if (style === 'number') return b ? 1 : 0
  if (style === 'boolstring') return b ? 'true' : 'false'
  return b
}

// Accepts numbers, numeric strings and Dutch-style decimals ("1,5").
export function toNumber (value) {
  if (typeof value === 'number') return value
  if (typeof value !== 'string') return value
  const s = value.trim()
  if (s === '') return value
  if (/^-?\d+(\.\d+)?(e-?\d+)?$/i.test(s)) return Number(s)
  if (/^-?\d+,\d+$/.test(s)) return Number(s.replace(',', '.'))
  return value
}

export function isFiniteNumber (v) {
  return typeof v === 'number' && Number.isFinite(v)
}
