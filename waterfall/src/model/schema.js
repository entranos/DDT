// The waterfall editor's document model.
//
//   { diagrams, moments, carriers, values, settings, meta }
//   diagrams  one or more waterfalls drawn above each other on one shared set of columns:
//             { id, title, subtitle, visible }
//   moments   the totals along the x axis, usually years: { id, title, visible }
//             `id` is the column name of that moment in the values table
//   carriers  what totals are made of: { id, title, color, icon, pattern }
//   values    a row per diagram and carrier, a column per moment: { diagram, carrier, <moment id>…, note, pattern }
//
// The steps between two moments are not stored: they are the difference between the
// moments' totals, per carrier.
//
// Rows keep every column they were read with, so files round-trip without losing
// data. Each row carries an internal `_uid` that is never written to files.

import { newUid, parseBoolean, booleanStyle, booleanForFile, toNumber, isFiniteNumber } from '../../../shared/src/values.js'
import { standardColor } from '../../../shared/src/standardPalette.js'
import { PATTERN_SETTINGS } from '../../../shared/src/patterns.js'

export const SCHEMA_VERSION = 1

export { newUid, parseBoolean, toNumber, isFiniteNumber }

export const SETTINGS = [
  { key: 'canvasWidth', group: 'canvas', type: 'number', default: 1600, label: 'Width', suffix: 'px', min: 100, step: 10 },
  { key: 'canvasHeight', group: 'canvas', type: 'number', default: 900, label: 'Height', suffix: 'px', min: 100, step: 10 },
  { key: 'scaleCanvas', group: 'canvas', type: 'number', default: 1, label: 'Output scale', min: 0.1, max: 5, step: 0.05, wide: true, help: 'Scales the drawing inside the exported image: 0.8 draws everything at 80%. Zooming the view does not change it.' },
  { key: 'margin', group: 'canvas', type: 'number', default: 60, label: 'Margin', suffix: 'px', min: 0, max: 400, step: 5 },
  { key: 'backgroundColor', group: 'canvas', type: 'color', default: '#F5F3EF', label: 'Background' },
  { key: 'transparentBackground', group: 'canvas', type: 'boolean', default: false, label: 'Transparent background', help: 'Exports without a background fill.' },

  { key: 'title', group: 'title', type: 'text', default: '', label: 'Title', placeholder: 'Diagram title' },
  { key: 'subtitle', group: 'title', type: 'text', default: '', label: 'Subtitle', placeholder: 'Shown under the title' },
  { key: 'titleFontSize', group: 'title', type: 'number', default: 24, label: 'Size', suffix: 'px', min: 6, step: 1 },
  { key: 'subtitleFontSize', group: 'title', type: 'number', default: 15, label: 'Subtitle size', suffix: 'px', min: 6, step: 1 },
  { key: 'titlePositionX', group: 'title', type: 'number', default: 60, label: 'X', step: 1 },
  { key: 'titlePositionY', group: 'title', type: 'number', default: 60, label: 'Y', step: 1 },
  { key: 'titleColor', group: 'title', type: 'color', default: '#2B2B2B', label: 'Colour' },

  { key: 'axisSync', group: 'diagrams', type: 'select', default: 'same', label: 'Vertical axes', options: [{ value: 'same', label: 'The same in every diagram' }, { value: 'fitted', label: 'Same scale, height follows the values' }, { value: 'own', label: 'Each its own scale' }], help: 'Columns are always shared, so the diagrams line up.' },
  { key: 'diagramGap', group: 'diagrams', type: 'number', default: 18, label: 'Space between', suffix: 'px', min: 0, max: 300, step: 1 },
  { key: 'axisPlace', group: 'diagrams', type: 'select', default: 'auto', label: 'Column headings', options: [{ value: 'auto', label: 'Between two diagrams, below one' }, { value: 'top', label: 'Above' }, { value: 'bottom', label: 'Below' }, { value: 'each', label: 'Below every diagram' }] },

  { key: 'scaleMode', group: 'scale', type: 'select', default: 'fit', label: 'Height', options: [{ value: 'fit', label: 'Fill the canvas' }, { value: 'fixed', label: 'Fixed pixels per unit' }], help: 'Use the same fixed scale in several diagrams to compare them.' },
  { key: 'pxPerUnit', group: 'scale', type: 'number', default: 0.1, label: 'Pixels per unit', min: 0.000001, step: 'any' },
  { key: 'multiply', group: 'scale', type: 'number', default: 1, label: 'Multiply values by', step: 'any', help: 'For unit conversion. 0.27778 turns PJ into TWh.' },
  { key: 'unit', group: 'scale', type: 'text', default: '', label: 'Unit', placeholder: 'e.g. PJ' },
  { key: 'decimals', group: 'scale', type: 'select', default: 'auto', label: 'Decimals', options: [{ value: 'auto', label: 'Automatic' }, { value: '0', label: '0' }, { value: '1', label: '1' }, { value: '2', label: '2' }, { value: '3', label: '3' }] },

  { key: 'columns', group: 'steps', type: 'select', default: 'all', label: 'Columns between totals', options: [{ value: 'all', label: 'Every carrier, always in the same place' }, { value: 'changing', label: 'Only carriers that change' }] },
  { key: 'columnHeads', group: 'steps', type: 'select', default: 'icons', label: 'Marked with', options: [{ value: 'icons', label: 'Icons' }, { value: 'names', label: 'Names' }, { value: 'tabs', label: 'Colours' }, { value: 'none', label: 'Nothing' }] },
  { key: 'decreases', group: 'steps', type: 'select', default: 'light', label: 'Decreases', options: [{ value: 'light', label: 'Outlined' }, { value: 'solid', label: 'Filled, like increases' }] },
  { key: 'showConnectors', group: 'steps', type: 'boolean', default: true, label: 'Lines between steps' },
  { key: 'showBands', group: 'steps', type: 'boolean', default: true, label: 'White panel behind the steps' },

  { key: 'showTotals', group: 'labels', type: 'boolean', default: true, label: 'Totals' },
  { key: 'showChanges', group: 'labels', type: 'boolean', default: true, label: 'Changes' },
  { key: 'changeLabels', group: 'labels', type: 'select', default: 'auto', label: 'Direction of change labels', options: [{ value: 'auto', label: 'Automatic' }, { value: 'horizontal', label: 'Horizontal' }, { value: 'vertical', label: 'Vertical' }] },
  { key: 'showNet', group: 'labels', type: 'boolean', default: true, label: 'Net change between totals' },
  { key: 'netPercent', group: 'labels', type: 'boolean', default: false, label: 'Net change in percent too' },
  { key: 'segmentLabels', group: 'labels', type: 'select', default: 'none', label: 'In the totals', options: [{ value: 'none', label: 'Nothing' }, { value: 'values', label: 'Values' }, { value: 'icons', label: 'Icons' }] },
  { key: 'showAxis', group: 'labels', type: 'boolean', default: true, label: 'Vertical axis' },
  { key: 'showGrid', group: 'labels', type: 'boolean', default: true, label: 'Grid lines' },

  { key: 'legend', group: 'legend', type: 'select', default: 'top', label: 'Legend', options: [{ value: 'top', label: 'Above the diagram' }, { value: 'bottom', label: 'Below the diagram' }, { value: 'none', label: 'None' }] },

  { key: 'totalWidth', group: 'layout', type: 'number', default: 52, label: 'Width of totals', suffix: 'px', min: 4, max: 300, step: 1 },
  { key: 'periodGap', group: 'layout', type: 'number', default: 18, label: 'Beside totals', suffix: 'px', min: 0, max: 200, step: 1 },
  { key: 'barGap', group: 'layout', type: 'number', default: 3, label: 'Between steps', suffix: 'px', min: 0, max: 60, step: 1 },
  { key: 'cornerRadius', group: 'layout', type: 'number', default: 5, label: 'Corner radius', suffix: 'px', min: 0, max: 40, step: 1 },

  { key: 'font', group: 'text', type: 'font', default: '', label: 'Font', help: 'Bundled fonts are embedded in exports.' },
  { key: 'fontSize', group: 'text', type: 'number', default: 14, label: 'Text size', suffix: 'px', min: 6, max: 40, step: 0.5, help: 'Diagram and year names; other texts and icons scale with it.' },
  { key: 'textColor', group: 'text', type: 'color', default: '#2B2B2B', label: 'Text colour' },
  { key: 'mutedTextColor', group: 'text', type: 'color', default: '#827D75', label: 'Axis text' },
  { key: 'gridColor', group: 'text', type: 'color', default: '#E3DFD7', label: 'Grid colour' },
  { key: 'softenColors', group: 'text', type: 'boolean', default: false, label: 'Soften carrier colours', help: 'Draws strong colours calmer; the colours in the file stay as they are.' },

  ...PATTERN_SETTINGS
]

export const SETTING_GROUPS = [
  { id: 'canvas', label: 'Canvas' },
  { id: 'title', label: 'Title' },
  { id: 'diagrams', label: 'Diagrams' },
  { id: 'scale', label: 'Values and scale' },
  { id: 'steps', label: 'Steps' },
  { id: 'labels', label: 'Labels' },
  { id: 'legend', label: 'Legend' },
  { id: 'layout', label: 'Widths' },
  { id: 'text', label: 'Text and colours' },
  { id: 'fills', label: 'Patterns' }
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

export const DIAGRAM_COLUMNS = ['id', 'title', 'subtitle', 'visible']
export const MOMENT_COLUMNS = ['id', 'title', 'visible']
export const CARRIER_COLUMNS = ['id', 'title', 'color', 'icon', 'pattern', 'patterncolor']
// Columns of the values table that are not moments.
export const VALUE_KEYS = ['diagram', 'carrier', 'note', 'pattern', 'patterncolor']
export const valueColumns = doc => ['diagram', 'carrier', ...doc.moments.map(m => m.id).filter(Boolean), 'note', 'pattern', 'patterncolor']

// Everything that can have an icon.
export const iconRows = doc => doc.carriers

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

export const isVisible = row => (row.visible === undefined || row.visible === null || row.visible === '' ? true : parseBoolean(row.visible))

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

// Turn raw file data into a document. raw = { diagrams, moments, carriers, values, settings, version, columns? }.
// Returns { doc, notes }.
export function normalizeDocument (raw) {
  const notes = []
  const cols = raw.columns || {}
  const values = rowsOf(raw.values).map(row => {
    const out = { ...row, _uid: newUid('v') }
    if (out.carrier === undefined && out.name !== undefined) { out.carrier = out.name; delete out.name }
    out.diagram = text(out.diagram)
    out.carrier = text(out.carrier)
    return out
  })
  const diagrams = rowsOf(raw.diagrams).map(row => ({ ...row, _uid: newUid('d'), id: text(row.id), title: text(row.title) || text(row.id), subtitle: text(row.subtitle) }))
  const carriers = rowsOf(raw.carriers).map(row => ({ ...row, _uid: newUid('c'), id: text(row.id), title: text(row.title) || text(row.name) || text(row.id), color: text(row.color) }))
  const moments = rowsOf(raw.moments).map(row => ({ ...row, _uid: newUid('m'), id: text(row.id), title: text(row.title) || text(row.id) }))

  // Without a moments table, every numeric column of the values is a moment, in file order.
  if (!moments.length) {
    const keys = []
    const header = (cols.values || []).map(String)
    ;[...header, ...values.flatMap(v => Object.keys(v))].forEach(k => { if (!k.startsWith('_') && !VALUE_KEYS.includes(k) && k !== 'name' && !keys.includes(k)) keys.push(k) })
    keys.filter(k => values.some(v => isFiniteNumber(toNumber(v[k])))).forEach(id => moments.push({ _uid: newUid('m'), id, title: id, visible: true }))
    if (moments.length && raw.moments && values.length) notes.push(`Set up the moments from the value columns ${moments.slice(0, 5).map(m => m.id).join(', ')}${moments.length > 5 ? ', …' : ''}.`)
  }
  values.forEach(v => moments.forEach(m => { if (m.id in v) v[m.id] = toNumber(v[m.id]) }))

  // Rows without a diagram belong to the first one.
  if (values.some(v => !v.diagram)) {
    const first = diagrams[0] ? diagrams[0].id : 'diagram'
    values.forEach(v => { if (!v.diagram) v.diagram = first })
  }
  // Diagrams and carriers that only appear in the values still get drawn: add them.
  const missing = (list, key) => {
    const known = new Set(list.map(x => x.id))
    return [...new Set(values.map(v => v[key]).filter(id => id && !known.has(id)))]
  }
  const newDiagrams = missing(diagrams, 'diagram')
  newDiagrams.forEach(id => diagrams.push({ _uid: newUid('d'), id, title: raw.diagrams || newDiagrams.length > 1 ? id : '', subtitle: '', visible: true }))
  const newCarriers = missing(carriers, 'carrier')
  newCarriers.forEach(id => carriers.push({ _uid: newUid('c'), id, title: id, color: standardColor(carriers.length, id) }))
  const list = ids => `${ids.slice(0, 4).join(', ')}${ids.length > 4 ? ', …' : ''}`
  if (newDiagrams.length && raw.diagrams && raw.diagrams.length) notes.push(`Added ${newDiagrams.length} diagram(s) used by values but missing from the diagrams table: ${list(newDiagrams)}.`)
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

  const doc = {
    diagrams,
    moments,
    carriers,
    values,
    settings,
    meta: {
      sourceVersion: Math.floor(Number(String(raw.version ?? 1).split('.')[0])) || 1,
      settingsOrder,
      settingsStyle,
      diagramColumns: columnOrder(diagrams, DIAGRAM_COLUMNS, cols.diagrams),
      momentColumns: columnOrder(moments, MOMENT_COLUMNS, cols.moments),
      carrierColumns: columnOrder(carriers, CARRIER_COLUMNS, cols.carriers),
      valueColumns: columnOrder(values, ['diagram', 'carrier', ...moments.map(m => m.id), 'note'], (cols.values || []).map(c => (c === 'name' ? 'carrier' : String(c))))
    }
  }
  return { doc, notes }
}

export function emptyDocument () {
  return normalizeDocument({ diagrams: [{ id: 'diagram', title: '' }], moments: [], carriers: [], values: [], settings: [] }).doc
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
  const columns = {
    diagrams: columnOrder(doc.diagrams, DIAGRAM_COLUMNS, doc.meta.diagramColumns),
    moments: columnOrder(doc.moments, MOMENT_COLUMNS, doc.meta.momentColumns),
    carriers: columnOrder(doc.carriers, CARRIER_COLUMNS, doc.meta.carrierColumns),
    values: columnOrder(doc.values, ['diagram', 'carrier', ...doc.moments.map(m => m.id), 'note'], doc.meta.valueColumns),
    settings: ['setting', 'waarde']
  }
  const order = [...doc.meta.settingsOrder, ...Object.keys(doc.settings).filter(k => !doc.meta.settingsOrder.includes(k))]
  const settings = order.filter(key => doc.settings[key] !== undefined).map(key => {
    const def = SETTINGS_BY_KEY[key]
    let value = doc.settings[key]
    if (def && def.type === 'boolean') value = booleanForFile(value, doc.meta.settingsStyle[key] || (format === 'xlsx' ? 'yesno' : 'bool'))
    return { setting: key, waarde: value }
  })
  const yes = format === 'xlsx' ? 'Yes' : true
  const no = format === 'xlsx' ? 'No' : false
  const withVisible = (rows, cols) => rows.map(r => {
    const out = strip(r, cols)
    if ('visible' in out && out.visible !== '') out.visible = parseBoolean(out.visible) ? yes : no
    return out
  })
  return {
    version: `${SCHEMA_VERSION}.0`,
    diagrams: withVisible(doc.diagrams, columns.diagrams),
    moments: withVisible(doc.moments, columns.moments),
    carriers: doc.carriers.map(c => strip(c, columns.carriers)),
    values: doc.values.map(v => strip(v, columns.values)),
    settings,
    columns
  }
}
