// The editor's document model.
//
// A document is a plain, immutable object:
//   { nodes, links, carriers, settings, remarks, meta }
// Rows keep every column they were read with, so files round-trip without losing
// data. Each row carries an internal `_uid` (never written to files) that the
// editor uses for selection and undo. `settings` holds only the keys that are
// present in the file or that the user set; `getSetting` falls back to defaults.

import { newUid, parseBoolean, booleanStyle, toNumber, isFiniteNumber } from '../../../shared/src/values.js'
import { standardColor } from '../../../shared/src/standardPalette.js'
import { PATTERN_SETTINGS } from '../../../shared/src/patterns.js'
import { SHADOW_SETTING } from '../../../shared/src/shadow.js'

export const SCHEMA_VERSION = 2

// Setting definitions drive the inspector, the defaults and the xlsx template.
export const SETTINGS = [
  { key: 'canvasWidth', group: 'canvas', type: 'number', default: 1200, label: 'Width', suffix: 'px', min: 100, step: 10, },
  { key: 'canvasHeight', group: 'canvas', type: 'number', default: 800, label: 'Height', suffix: 'px', min: 100, step: 10, },
  { key: 'scaleCanvas', group: 'canvas', type: 'number', default: 1, label: 'Output scale', min: 0.1, max: 5, step: 0.05, wide: true, help: 'Scales the drawing inside the exported image: 0.8 draws everything at 80%. Zooming the view does not change it.' },
  { key: 'backgroundColor', group: 'canvas', type: 'color', default: '#F5F3EF', label: 'Background' },
  { key: 'transparentBackground', group: 'canvas', type: 'boolean', default: false, label: 'Transparent background', help: 'Exports without a background fill.' },

  { key: 'unit', group: 'values', type: 'text', default: '', label: 'Unit', placeholder: 'e.g. PJ', help: 'Shown after every value label and in tooltips.' },
  { key: 'decimalsRoundValues', group: 'values', type: 'number', default: 1, label: 'Decimals', min: 0, max: 5, step: 1, help: 'Only labels are rounded.' },
  { key: 'scaleDataValue', group: 'values', type: 'number', default: 1, label: 'Multiply values by', min: 0, step: 'any', wide: true, help: 'Converts every value before drawing and labelling, e.g. 0.2778 for PJ → TWh. The file keeps the original values.' },
  { key: 'scaleHeight', group: 'values', type: 'number', default: 1, label: 'Pixels per unit', min: 0, step: 'any', wide: true, help: 'Flow thickness per unit. Keep it equal across diagrams so they can be compared.' },

  { key: 'title', group: 'title', type: 'text', default: '', label: 'Title', placeholder: 'Diagram title' },
  { key: 'titleFontSize', group: 'title', type: 'number', default: 24, label: 'Size', suffix: 'px', min: 6, step: 1 },
  { key: 'titlePositionX', group: 'title', type: 'number', default: 60, label: 'X', step: 1 },
  { key: 'titlePositionY', group: 'title', type: 'number', default: 60, label: 'Y', step: 1 },
  { key: 'titleColor', group: 'title', type: 'color', default: '#000000', label: 'Colour' },

  { key: 'font', group: 'labels', type: 'font', default: '', label: 'Font', help: 'Bundled fonts are embedded in exports.' },
  { key: 'labelFontSize', group: 'labels', type: 'number', default: 11, label: 'Label size', suffix: 'px', min: 6, max: 40, step: 0.5 },
  { key: 'labelTextColor', group: 'labels', type: 'color', default: '#000000', label: 'Label text' },
  { key: 'labelFillColor', group: 'labels', type: 'color', default: '#ffffff', label: 'Label background' },
  { key: 'showValueLabels', group: 'labels', type: 'boolean', default: true, label: 'Show values next to labels' },

  { key: 'nodeWidth', group: 'nodes', type: 'number', default: 4, label: 'Node width', suffix: 'px', min: 1, max: 60, step: 1 },
  { key: 'nodeColor', group: 'nodes', type: 'color', default: '#333333', label: 'Node colour' },

  { key: 'globalFlowOpacity', group: 'flows', type: 'number', default: 0.9, label: 'Flow opacity', min: 0, max: 1, step: 0.05 },

  { key: 'flowIcons', group: 'icons', type: 'select', default: 'chosen', label: 'Show icons', options: [{ value: 'chosen', label: 'Where one is chosen' }, { value: 'all', label: 'On all flows with a fitting one' }, { value: 'none', label: 'None' }], help: 'Choose an icon for a carrier or for a single flow. The second option also adds icons to carriers with a well-known ID, such as hydrogen.' },
  { key: 'flowIconSize', group: 'icons', type: 'number', default: 16, label: 'Size', suffix: 'px', min: 6, max: 80, step: 1 },
  { key: 'flowIconPosition', group: 'icons', type: 'select', default: 'auto', label: 'Place on the flow', options: [{ value: 'auto', label: 'Automatic, where flows spread out' }, { value: 'start', label: 'Near the start' }, { value: 'middle', label: 'In the middle' }, { value: 'end', label: 'Near the end' }], help: 'Drag an icon to place it yourself.' },
  { key: 'flowIconThin', group: 'icons', type: 'select', default: 'badge', label: 'On thin flows', options: [{ value: 'badge', label: 'In a circle' }, { value: 'hide', label: 'No icon' }], help: 'In thick flows icons grow up to twice their size.' },

  SHADOW_SETTING,
  ...PATTERN_SETTINGS
]

export const SETTING_GROUPS = [
  { id: 'canvas', label: 'Canvas' },
  { id: 'values', label: 'Values and scaling' },
  { id: 'title', label: 'Title' },
  { id: 'labels', label: 'Labels and font' },
  { id: 'nodes', label: 'Nodes' },
  { id: 'flows', label: 'Flows' },
  { id: 'icons', label: 'Icons on flows' },
  { id: 'fills', label: 'Shadow and patterns' }
]

export const SETTINGS_BY_KEY = Object.fromEntries(SETTINGS.map(s => [s.key, s]))

export const FONT_CHOICES = [
  { value: '', label: 'Roboto (default)' },
  { value: 'RO Sans', label: 'RO Sans' },
  { value: 'RO Serif', label: 'RO Serif' },
  { value: 'Arial', label: 'Arial' },
  { value: 'Helvetica', label: 'Helvetica' },
  { value: 'Georgia', label: 'Georgia' },
  { value: 'Verdana', label: 'Verdana' }
]

// Standard column order per sheet; other columns follow in file order.
export const NODE_COLUMNS = ['id', 'title', 'x', 'y', 'direction', 'labelposition']
export const LINK_COLUMNS = ['source', 'target', 'value', 'carrier', 'type', 'annotate', 'icon', 'iconposition', 'pattern', 'patterncolor']
export const CARRIER_COLUMNS = ['id', 'color', 'icon', 'pattern', 'patterncolor']

// Everything that can have an icon.
export const iconRows = doc => [...doc.carriers, ...doc.links]

export { newUid, parseBoolean, toNumber, isFiniteNumber }

export function getSetting (doc, key) {
  const value = doc.settings[key]
  const def = SETTINGS_BY_KEY[key]
  if (value === undefined || value === null || value === '') {
    if (key === 'labelFontSize' && isFiniteNumber(toNumber(doc.settings.fontSize))) return toNumber(doc.settings.fontSize)
    return def ? def.default : undefined
  }
  if (!def) return value
  if (def.type === 'number') {
    const n = toNumber(value)
    return isFiniteNumber(n) ? n : def.default
  }
  if (def.type === 'boolean') return parseBoolean(value)
  if (def.type === 'select') return def.options.some(o => o.value === String(value)) ? String(value) : def.default
  return String(value)
}

export function isLeftDirection (direction) {
  return typeof direction === 'string' && /^l/i.test(direction.trim())
}

function columnOrder (rows, preferred, headerColumns) {
  const cols = []
  const add = c => { if (!c.startsWith('_') && !cols.includes(c)) cols.push(c) }
  ;(headerColumns || []).forEach(add)
  rows.forEach(r => Object.keys(r).forEach(add))
  // Preferred columns first, in their standard order, when present.
  const front = preferred.filter(c => cols.includes(c))
  return [...front, ...cols.filter(c => !front.includes(c))]
}

// Turn raw file data into a document. `raw` = { nodes, links, carriers, settings,
// remarks, version, columns? }. Returns { doc, notes } where notes describe migrations.
export function normalizeDocument (raw) {
  const notes = []
  const version = raw.version === undefined || raw.version === null ? 1 : Math.floor(Number(String(raw.version).split('.')[0])) || 1

  const nodes = (raw.nodes || []).filter(r => r && typeof r === 'object').map(row => {
    const node = { ...row, _uid: newUid('n') }
    node.id = row.id === undefined || row.id === null ? '' : String(row.id).trim()
    if (row.title !== undefined && row.title !== null) node.title = String(row.title)
    node.x = toNumber(row.x)
    node.y = toNumber(row.y)
    return node
  })

  let renamedLinkColumns = false
  let carrierFromLegend = 0
  const links = (raw.links || []).filter(r => r && typeof r === 'object').map(row => {
    const link = { ...row, _uid: newUid('l') }
    if (link.source === undefined && row['source.id'] !== undefined) { link.source = row['source.id']; renamedLinkColumns = true }
    if (link.target === undefined && row['target.id'] !== undefined) { link.target = row['target.id']; renamedLinkColumns = true }
    if ('source.id' in link || 'target.id' in link) renamedLinkColumns = true
    delete link['source.id']
    delete link['target.id']
    link.source = link.source === undefined || link.source === null ? '' : String(link.source).trim()
    link.target = link.target === undefined || link.target === null ? '' : String(link.target).trim()
    if ((link.carrier === undefined || link.carrier === null || link.carrier === '') && link.legend) {
      link.carrier = link.legend
      carrierFromLegend += 1
    }
    if (link.carrier !== undefined && link.carrier !== null) link.carrier = String(link.carrier).trim()
    link.value = toNumber(link.value)
    return link
  })
  if (renamedLinkColumns) notes.push('Renamed the link columns source.id and target.id to source and target.')
  if (carrierFromLegend) notes.push(`Filled the carrier column from the legend column on ${carrierFromLegend} flow(s).`)

  const carriers = (raw.carriers || []).filter(r => r && typeof r === 'object').map((row, i) => ({
    ...row,
    _uid: newUid('c'),
    id: row.id === undefined || row.id === null ? '' : String(row.id).trim(),
    color: row.color === undefined || row.color === null || String(row.color).trim() === '' ? standardColor(i, row.id) : String(row.color).trim()
  }))

  const settings = {}
  const settingsOrder = []
  const settingsStyle = {}
  const rawSettings = raw.settings
  const settingRows = Array.isArray(rawSettings)
    ? (rawSettings.length && rawSettings[0] && rawSettings[0].setting === undefined && rawSettings.length === 1
        ? Object.entries(rawSettings[0]).map(([setting, waarde]) => ({ setting, waarde }))
        : rawSettings)
    : Object.entries(rawSettings || {}).map(([setting, waarde]) => ({ setting, waarde }))
  settingRows.forEach(row => {
    if (!row || row.setting === undefined || row.setting === null) return
    const key = String(row.setting).trim()
    if (!key) return
    let value = row.waarde !== undefined ? row.waarde : row.value
    const def = SETTINGS_BY_KEY[key]
    if (def && def.type === 'boolean') {
      settingsStyle[key] = booleanStyle(value)
      value = parseBoolean(value)
    } else if (def && def.type === 'number') {
      value = toNumber(value)
    } else if (def && def.type === 'select') {
      value = String(value ?? '').trim()
    }
    if (!settingsOrder.includes(key)) settingsOrder.push(key)
    settings[key] = value
  })

  const cols = raw.columns || {}
  const doc = {
    nodes,
    links,
    carriers,
    settings,
    remarks: raw.remarks === undefined ? [] : raw.remarks,
    meta: {
      sourceVersion: version,
      settingsOrder,
      settingsStyle,
      nodeColumns: columnOrder(nodes, NODE_COLUMNS, cols.nodes),
      linkColumns: columnOrder(links, LINK_COLUMNS, (cols.links || []).map(c => c === 'source.id' ? 'source' : c === 'target.id' ? 'target' : c)),
      carrierColumns: columnOrder(carriers, CARRIER_COLUMNS, cols.carriers)
    }
  }
  return { doc, notes }
}

export function emptyDocument () {
  return normalizeDocument({ nodes: [], links: [], carriers: [], settings: [], remarks: [], version: SCHEMA_VERSION }).doc
}

function stripInternal (row, columns) {
  const out = {}
  columns.forEach(c => { if (row[c] !== undefined) out[c] = row[c] })
  Object.keys(row).forEach(c => { if (!c.startsWith('_') && !(c in out) && row[c] !== undefined) out[c] = row[c] })
  return out
}

function settingValueForFile (doc, key, value, format) {
  const def = SETTINGS_BY_KEY[key]
  if (!def || def.type !== 'boolean') return value
  const b = parseBoolean(value)
  const style = doc.meta.settingsStyle[key] || (format === 'xlsx' ? 'yesno' : 'bool')
  if (style === 'yesno') return b ? 'Yes' : 'No'
  if (style === 'number') return b ? 1 : 0
  if (style === 'boolstring') return b ? 'true' : 'false'
  return b
}

// Plain rows for writing a file in `format` ('xlsx' | 'json' | 'yaml').
export function documentToFileData (doc, format) {
  const nodeColumns = columnOrder(doc.nodes, NODE_COLUMNS, doc.meta.nodeColumns)
  const linkColumns = columnOrder(doc.links, LINK_COLUMNS, doc.meta.linkColumns)
  const carrierColumns = columnOrder(doc.carriers, CARRIER_COLUMNS, doc.meta.carrierColumns)
  const order = [...doc.meta.settingsOrder, ...Object.keys(doc.settings).filter(k => !doc.meta.settingsOrder.includes(k))]
  const settings = order
    .filter(key => doc.settings[key] !== undefined)
    .map(key => ({ setting: key, waarde: settingValueForFile(doc, key, doc.settings[key], format) }))
  return {
    version: `${SCHEMA_VERSION}.0`,
    nodes: doc.nodes.map(n => stripInternal(n, nodeColumns)),
    links: doc.links.map(l => stripInternal(l, linkColumns)),
    carriers: doc.carriers.map(c => stripInternal(c, carrierColumns)),
    settings,
    remarks: doc.remarks,
    columns: { nodes: nodeColumns, links: linkColumns, carriers: carrierColumns, settings: ['setting', 'waarde'] }
  }
}
