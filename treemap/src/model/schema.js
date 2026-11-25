// The treemap editor's document model.
//
//   { blocks, values, carriers, settings, meta }
//   blocks    the areas of the diagram (e.g. sectors): { id, title, group, icon, visible }
//   values    one row per tile: { block, carrier, part, value, note, icon, pattern }
//             rows with the same block and carrier are one tile; `part` tells them apart
//             in the tooltip. `icon` and `pattern` are only for a tile that differs from its carrier
//   carriers  what blocks are split into: { id, title, color, icon, pattern }
//
// Rows keep every column they were read with, so files round-trip without losing
// data. Each row carries an internal `_uid` that is never written to files.

import { newUid, parseBoolean, booleanStyle, booleanForFile, toNumber, isFiniteNumber } from '../../../shared/src/values.js'
import { standardColor } from '../../../shared/src/standardPalette.js'
import { PATTERN_SETTINGS } from '../../../shared/src/patterns.js'
import { SHADOW_SETTING } from '../../../shared/src/shadow.js'

export const SCHEMA_VERSION = 1

export { newUid, parseBoolean, toNumber, isFiniteNumber }

export const VIEWS = [
  { value: 'block', label: 'Per block, split by carrier' },
  { value: 'carrier', label: 'Per carrier, split by block' }
]

export const SETTINGS = [
  { key: 'canvasWidth', group: 'canvas', type: 'number', default: 1200, label: 'Width', suffix: 'px', min: 100, step: 10 },
  { key: 'canvasHeight', group: 'canvas', type: 'number', default: 900, label: 'Height', suffix: 'px', min: 100, step: 10 },
  { key: 'scaleCanvas', group: 'canvas', type: 'number', default: 1, label: 'Output scale', min: 0.1, max: 5, step: 0.05, wide: true, help: 'Scales the drawing inside the exported image: 0.8 draws everything at 80%. Zooming the view does not change it.' },
  { key: 'margin', group: 'canvas', type: 'number', default: 60, label: 'Margin', suffix: 'px', min: 0, max: 400, step: 5 },
  { key: 'backgroundColor', group: 'canvas', type: 'color', default: '#F5F3EF', label: 'Background' },
  { key: 'transparentBackground', group: 'canvas', type: 'boolean', default: false, label: 'Transparent background', help: 'Exports without a background fill.' },

  { key: 'title', group: 'title', type: 'text', default: '', label: 'Title', placeholder: 'Diagram title' },
  { key: 'titleFontSize', group: 'title', type: 'number', default: 24, label: 'Size', suffix: 'px', min: 6, step: 1 },
  { key: 'titlePositionX', group: 'title', type: 'number', default: 60, label: 'X', step: 1 },
  { key: 'titlePositionY', group: 'title', type: 'number', default: 60, label: 'Y', step: 1 },
  { key: 'titleColor', group: 'title', type: 'color', default: '#2B2B2B', label: 'Colour' },

  { key: 'view', group: 'view', type: 'select', default: 'block', label: 'Show', options: VIEWS },
  { key: 'chart', group: 'view', type: 'select', default: 'treemap', label: 'Draw blocks as', options: [{ value: 'treemap', label: 'Treemaps' }, { value: 'bars', label: 'Stacked bars' }], help: 'Bars run along the longer side of each block.' },
  { key: 'order', group: 'view', type: 'select', default: 'listed', label: 'Order', options: [{ value: 'listed', label: 'As listed' }, { value: 'size', label: 'Largest first' }], help: 'As listed keeps blocks in the same place when values change.' },

  { key: 'scaleMode', group: 'scale', type: 'select', default: 'fit', label: 'Area', options: [{ value: 'fit', label: 'Fill the canvas' }, { value: 'fixed', label: 'Fixed area per unit' }], help: 'Use the same fixed area in several diagrams to compare them.' },
  { key: 'areaPerUnit', group: 'scale', type: 'number', default: 100, label: 'Area per unit', suffix: 'px²', min: 0.000001, step: 'any' },
  { key: 'multiply', group: 'scale', type: 'number', default: 1, label: 'Multiply values by', step: 'any', help: 'For unit conversion. 0.27778 turns PJ into TWh.' },
  { key: 'unit', group: 'scale', type: 'text', default: '', label: 'Unit', placeholder: 'e.g. PJ' },
  { key: 'decimals', group: 'scale', type: 'select', default: 'auto', label: 'Decimals', options: [{ value: 'auto', label: 'Automatic' }, { value: '0', label: '0' }, { value: '1', label: '1' }, { value: '2', label: '2' }, { value: '3', label: '3' }] },

  { key: 'showGroupLabels', group: 'labels', type: 'boolean', default: true, label: 'Group names' },
  { key: 'showGroupTotals', group: 'labels', type: 'boolean', default: true, label: 'Group totals' },
  { key: 'showBlockTotals', group: 'labels', type: 'boolean', default: true, label: 'Block totals' },
  { key: 'showBlockIcons', group: 'labels', type: 'boolean', default: true, label: 'Block icons' },
  { key: 'tileIcons', group: 'labels', type: 'boolean', default: true, label: 'Icons on tiles' },
  { key: 'tileNames', group: 'labels', type: 'boolean', default: false, label: 'Names on tiles' },
  { key: 'tileValues', group: 'labels', type: 'boolean', default: false, label: 'Values on tiles' },
  { key: 'tileShares', group: 'labels', type: 'boolean', default: false, label: 'Shares on tiles', help: 'Of the block’s total. Texts and icons show where they fit.' },

  { key: 'legend', group: 'legend', type: 'select', default: 'top', label: 'Legend', options: [{ value: 'top', label: 'Above the diagram' }, { value: 'bottom', label: 'Below the diagram' }, { value: 'none', label: 'None' }] },

  { key: 'groupGap', group: 'layout', type: 'number', default: 44, label: 'Between groups', suffix: 'px', min: 0, max: 300, step: 1 },
  { key: 'blockGap', group: 'layout', type: 'number', default: 20, label: 'Between blocks', suffix: 'px', min: 0, max: 200, step: 1 },
  { key: 'tileGap', group: 'layout', type: 'number', default: 0, label: 'Between tiles', suffix: 'px', min: 0, max: 20, step: 1 },
  { key: 'cornerRadius', group: 'layout', type: 'number', default: 7, label: 'Corner radius', suffix: 'px', min: 0, max: 60, step: 1 },

  { key: 'font', group: 'text', type: 'font', default: '', label: 'Font', help: 'Bundled fonts are embedded in exports.' },
  { key: 'fontSize', group: 'text', type: 'number', default: 14, label: 'Text size', suffix: 'px', min: 6, max: 40, step: 0.5, help: 'Block names; other texts and icons scale with it.' },
  { key: 'textColor', group: 'text', type: 'color', default: '#2B2B2B', label: 'Text colour' },
  { key: 'mutedTextColor', group: 'text', type: 'color', default: '#8F8A82', label: 'Totals colour' },
  { key: 'softenColors', group: 'text', type: 'boolean', default: false, label: 'Soften carrier colours', help: 'Draws strong colours calmer; the colours in the file stay as they are.' },

  SHADOW_SETTING,
  ...PATTERN_SETTINGS
]

export const SETTING_GROUPS = [
  { id: 'canvas', label: 'Canvas' },
  { id: 'title', label: 'Title' },
  { id: 'view', label: 'View' },
  { id: 'scale', label: 'Values and scale' },
  { id: 'labels', label: 'Labels' },
  { id: 'legend', label: 'Legend' },
  { id: 'layout', label: 'Spacing' },
  { id: 'text', label: 'Text and colours' },
  { id: 'fills', label: 'Shadow and patterns' }
]

export const SETTINGS_BY_KEY = Object.fromEntries(SETTINGS.map(s => [s.key, s]))

export const FONT_CHOICES = [
  { value: '', label: 'Roboto (default)' },
  { value: 'RO Sans', label: 'RO Sans' },
  { value: 'RO Serif', label: 'RO Serif' },
  { value: 'Arial', label: 'Arial' },
  { value: 'Georgia', label: 'Georgia' },
  { value: 'Verdana', label: 'Verdana' }
]

export const BLOCK_COLUMNS = ['id', 'title', 'group', 'icon', 'visible']
export const VALUE_COLUMNS = ['block', 'carrier', 'part', 'value', 'note', 'icon', 'pattern', 'patterncolor']
export const CARRIER_COLUMNS = ['id', 'title', 'color', 'icon', 'pattern', 'patterncolor']

export function getSetting (doc, key) {
  const value = doc.settings[key]
  const def = SETTINGS_BY_KEY[key]
  if (value === undefined || value === null || value === '') return def ? def.default : undefined
  if (!def) return value
  if (def.type === 'number') {
    const n = toNumber(value)
    return isFiniteNumber(n) ? n : def.default
  }
  if (def.type === 'boolean') return parseBoolean(value)
  if (def.type === 'select') return def.options.some(o => o.value === String(value)) ? String(value) : def.default
  return String(value)
}

const text = v => (v === undefined || v === null ? '' : String(v).trim())

export const blockIsVisible = b => (b.visible === undefined || b.visible === null || b.visible === '' ? true : parseBoolean(b.visible))

// Everything that can have an icon.
export const iconRows = doc => [...doc.blocks, ...doc.carriers, ...doc.values]

// A carrier's colour, with a stable fallback by its place in the table.
export function carrierColor (doc, carrier) {
  if (/^#[0-9a-f]{6}$/i.test(carrier.color || '')) return carrier.color
  if (/^#[0-9a-f]{3}$/i.test(carrier.color || '')) return '#' + carrier.color.slice(1).split('').map(c => c + c).join('')
  return standardColor(doc.carriers.indexOf(carrier), carrier.id, carrier.title)
}

function columnOrder (rows, preferred, headerColumns = []) {
  const cols = []
  const add = c => { if (!c.startsWith('_') && !cols.includes(c)) cols.push(c) }
  headerColumns.forEach(add)
  rows.forEach(r => Object.keys(r).forEach(add))
  const front = preferred.filter(c => cols.includes(c))
  return [...front, ...cols.filter(c => !front.includes(c))]
}

const rowsOf = list => (list || []).filter(r => r && typeof r === 'object')

// A values table with a column per carrier (a row per block) → one row per value.
function melt (rows) {
  const blockKey = ['block', 'sector', 'id'].find(k => rows.some(r => k in r))
  if (!blockKey) return null
  const skip = new Set([blockKey, 'title', 'group', 'icon', 'visible', 'note', 'part', 'pattern', 'patterncolor'])
  const carriers = []
  rows.forEach(r => Object.keys(r).forEach(k => { if (!skip.has(k) && !k.startsWith('_') && isFiniteNumber(toNumber(r[k])) && !carriers.includes(k)) carriers.push(k) }))
  if (!carriers.length) return null
  return rows.flatMap(r => carriers.filter(c => isFiniteNumber(toNumber(r[c])) && toNumber(r[c]) !== 0).map(c => ({ block: r[blockKey], carrier: c, value: r[c] })))
}

// Turn raw file data into a document. raw = { blocks, values, carriers, settings, version, columns? }.
// Returns { doc, notes }.
export function normalizeDocument (raw) {
  const notes = []
  let valueRows = rowsOf(raw.values)
  if (valueRows.length && !valueRows.some(r => 'carrier' in r || 'value' in r)) {
    const long = melt(valueRows)
    if (long) {
      notes.push('Read the values as a table with a column per carrier.')
      valueRows = long
      if (raw.columns) raw = { ...raw, columns: { ...raw.columns, values: [] } }
    }
  }
  const values = valueRows.map(row => {
    const out = { ...row, _uid: newUid('v') }
    if (out.block === undefined && out.sector !== undefined) { out.block = out.sector; delete out.sector }
    out.block = text(out.block)
    out.carrier = text(out.carrier)
    out.value = toNumber(out.value)
    return out
  })
  const blocks = rowsOf(raw.blocks).map(row => ({ ...row, _uid: newUid('b'), id: text(row.id), title: text(row.title) || text(row.id), group: text(row.group) }))
  const carriers = rowsOf(raw.carriers).map(row => ({ ...row, _uid: newUid('c'), id: text(row.id), title: text(row.title) || text(row.name) || text(row.id), color: text(row.color) }))

  // Blocks and carriers that only appear in the values still get drawn: add them.
  const missing = (list, key) => {
    const known = new Set(list.map(x => x.id))
    return [...new Set(values.map(v => v[key]).filter(id => id && !known.has(id)))]
  }
  const newBlocks = missing(blocks, 'block')
  newBlocks.forEach(id => blocks.push({ _uid: newUid('b'), id, title: id, group: '' }))
  const newCarriers = missing(carriers, 'carrier')
  newCarriers.forEach(id => carriers.push({ _uid: newUid('c'), id, title: id, color: standardColor(carriers.length, id) }))
  const list = ids => `${ids.slice(0, 4).join(', ')}${ids.length > 4 ? ', …' : ''}`
  if (newBlocks.length && raw.blocks && raw.blocks.length) notes.push(`Added ${newBlocks.length} block(s) used by values but missing from the blocks table: ${list(newBlocks)}.`)
  if (newCarriers.length && raw.carriers && raw.carriers.length) notes.push(`Added ${newCarriers.length} carrier(s) used by values but missing from the carriers table: ${list(newCarriers)}.`)

  const settings = {}
  const settingsOrder = []
  const settingsStyle = {}
  const rows = Array.isArray(raw.settings)
    ? raw.settings
    : Object.entries(raw.settings || {}).map(([setting, waarde]) => ({ setting, waarde }))
  rows.forEach(row => {
    if (!row || row.setting === undefined || row.setting === null) return
    const key = text(row.setting)
    if (!key) return
    let value = row.waarde !== undefined ? row.waarde : row.value
    const def = SETTINGS_BY_KEY[key]
    if (def && def.type === 'boolean') { settingsStyle[key] = booleanStyle(value); value = parseBoolean(value) } else if (def && def.type === 'number') value = toNumber(value)
    else if (def && def.type === 'select') value = text(value)
    if (!settingsOrder.includes(key)) settingsOrder.push(key)
    settings[key] = value
  })

  const cols = raw.columns || {}
  const doc = {
    blocks,
    values,
    carriers,
    settings,
    meta: {
      sourceVersion: Math.floor(Number(String(raw.version ?? 1).split('.')[0])) || 1,
      settingsOrder,
      settingsStyle,
      blockColumns: columnOrder(blocks, BLOCK_COLUMNS, cols.blocks),
      valueColumns: columnOrder(values, VALUE_COLUMNS, (cols.values || []).map(c => (c === 'sector' ? 'block' : c))),
      carrierColumns: columnOrder(carriers, CARRIER_COLUMNS, cols.carriers)
    }
  }
  return { doc, notes }
}

export function emptyDocument () {
  return normalizeDocument({ blocks: [], values: [], carriers: [], settings: [] }).doc
}

function strip (row, columns) {
  const out = {}
  const put = c => { if (!c.startsWith('_') && row[c] !== undefined && !(c in out)) out[c] = row[c] }
  columns.forEach(put)
  Object.keys(row).forEach(put)
  return out
}

// Plain rows for writing a file in `format` ('xlsx' | 'json' | 'yaml').
export function documentToFileData (doc, format) {
  const blockColumns = columnOrder(doc.blocks, BLOCK_COLUMNS, doc.meta.blockColumns)
  const valueColumns = columnOrder(doc.values, VALUE_COLUMNS, doc.meta.valueColumns)
  const carrierColumns = columnOrder(doc.carriers, CARRIER_COLUMNS, doc.meta.carrierColumns)
  const order = [...doc.meta.settingsOrder, ...Object.keys(doc.settings).filter(k => !doc.meta.settingsOrder.includes(k))]
  const settings = order.filter(key => doc.settings[key] !== undefined).map(key => {
    const def = SETTINGS_BY_KEY[key]
    let value = doc.settings[key]
    if (def && def.type === 'boolean') value = booleanForFile(value, doc.meta.settingsStyle[key] || (format === 'xlsx' ? 'yesno' : 'bool'))
    return { setting: key, waarde: value }
  })
  const yes = format === 'xlsx' ? 'Yes' : true
  const no = format === 'xlsx' ? 'No' : false
  return {
    version: `${SCHEMA_VERSION}.0`,
    blocks: doc.blocks.map(b => {
      const out = strip(b, blockColumns)
      if ('visible' in out && out.visible !== '') out.visible = parseBoolean(out.visible) ? yes : no
      return out
    }),
    values: doc.values.map(v => strip(v, valueColumns)),
    carriers: doc.carriers.map(c => strip(c, carrierColumns)),
    settings,
    columns: { blocks: blockColumns, values: valueColumns, carriers: carrierColumns, settings: ['setting', 'waarde'] }
  }
}
