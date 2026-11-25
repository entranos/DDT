// The chord editor's document model.
//
//   { flows, nodes, groups, carriers, scenarios, details, settings, meta }
//   flows      one row per flow: { source, target, carrier, part, <scenario id>…, note, icon, pattern, patterncolor }
//              rows with the same source, target and carrier are one ribbon; `part` tells
//              them apart in the tooltip
//   nodes      arcs on the circle, in this order: { id, title, group, color, icon, label, visible, labelx, labely, note }
//   groups     arcs around nodes that belong together: { id, title, color, place }
//   carriers   what flows: { id, title, color, pattern, patterncolor, icon, visible }
//   scenarios  one or more sets of amounts, e.g. years: { id, title }
//              `id` is the column name of its amounts in the flows and details tables
//   details    small lines under the label of a node: { node, title, <scenario id>… }
//
// Rows keep every column they were read with, so files round-trip without losing
// data. Each row carries an internal `_uid` that is never written to files.

import { newUid, parseBoolean, booleanStyle, booleanForFile, toNumber, isFiniteNumber } from '../../../shared/src/values.js'
import { standardColor } from '../../../shared/src/standardPalette.js'
import { PATTERN_SETTINGS } from '../../../shared/src/patterns.js'
import { SHADOW_SETTING } from '../../../shared/src/shadow.js'

export const SCHEMA_VERSION = 1

export { newUid, parseBoolean, toNumber, isFiniteNumber }

export const PLACES = [{ value: 'outside', label: 'Outside the circle' }, { value: 'inside', label: 'Inside, over the flows' }]

export const SETTINGS = [
  { key: 'canvasWidth', group: 'canvas', type: 'number', default: 1200, label: 'Width', suffix: 'px', min: 100, step: 10 },
  { key: 'canvasHeight', group: 'canvas', type: 'number', default: 1050, label: 'Height', suffix: 'px', min: 100, step: 10 },
  { key: 'scaleCanvas', group: 'canvas', type: 'number', default: 1, label: 'Output scale', min: 0.1, max: 5, step: 0.05, wide: true, help: 'Scales the drawing inside the exported image: 0.8 draws everything at 80%. Zooming the view does not change it.' },
  { key: 'margin', group: 'canvas', type: 'number', default: 60, label: 'Margin', suffix: 'px', min: 0, max: 400, step: 5 },
  { key: 'backgroundColor', group: 'canvas', type: 'color', default: '#F5F3EF', label: 'Background' },
  { key: 'transparentBackground', group: 'canvas', type: 'boolean', default: false, label: 'Transparent background', help: 'Exports without a background fill.' },

  { key: 'title', group: 'title', type: 'text', default: '', label: 'Title', placeholder: 'Diagram title' },
  { key: 'subtitle', group: 'title', type: 'text', default: '', label: 'Subtitle', placeholder: 'Shown under the title' },
  { key: 'showScenario', group: 'title', type: 'boolean', default: true, label: 'Name of the scenario in the subtitle' },
  { key: 'titleFontSize', group: 'title', type: 'number', default: 24, label: 'Size', suffix: 'px', min: 6, step: 1 },
  { key: 'subtitleFontSize', group: 'title', type: 'number', default: 15, label: 'Subtitle size', suffix: 'px', min: 6, step: 1 },
  { key: 'titlePositionX', group: 'title', type: 'number', default: 60, label: 'X', step: 1 },
  { key: 'titlePositionY', group: 'title', type: 'number', default: 60, label: 'Y', step: 1 },
  { key: 'titleColor', group: 'title', type: 'color', default: '#2B2B2B', label: 'Colour' },

  { key: 'scenario', group: 'scenario', type: 'text', default: '', label: 'Show' },

  { key: 'scaleMode', group: 'scale', type: 'select', default: 'largest', label: 'A full circle is', options: [{ value: 'shown', label: 'The total that is shown' }, { value: 'largest', label: 'The total of the largest scenario' }, { value: 'fixed', label: 'A fixed amount' }], help: 'Use the same amount in several diagrams to compare them. A smaller total leaves part of the circle empty.' },
  { key: 'fullCircle', group: 'scale', type: 'number', default: 1000, label: 'Amount of a full circle', min: 0.000001, step: 'any' },
  { key: 'multiply', group: 'scale', type: 'number', default: 1, label: 'Multiply values by', step: 'any', help: 'For unit conversion. 0.27778 turns PJ into TWh.' },
  { key: 'unit', group: 'scale', type: 'text', default: '', label: 'Unit', placeholder: 'e.g. PJ' },
  { key: 'decimals', group: 'scale', type: 'select', default: 'auto', label: 'Decimals', options: [{ value: 'auto', label: 'Automatic' }, { value: '0', label: '0' }, { value: '1', label: '1' }, { value: '2', label: '2' }, { value: '3', label: '3' }] },

  { key: 'spacing', group: 'circle', type: 'select', control: 'segmented', default: 'spread', label: 'Empty space', options: [{ value: 'spread', label: 'Between groups' }, { value: 'compact', label: 'At the end' }] },
  { key: 'radius', group: 'circle', type: 'number', default: 0, label: 'Radius', suffix: 'px', min: 0, max: 5000, step: 5, help: '0 is as large as fits.' },
  { key: 'rotation', group: 'circle', type: 'number', default: 0, label: 'Rotation', suffix: '°', min: -360, max: 360, step: 1 },
  { key: 'offsetX', group: 'circle', type: 'number', default: 0, label: 'Move right', suffix: 'px', step: 5 },
  { key: 'offsetY', group: 'circle', type: 'number', default: 0, label: 'Move down', suffix: 'px', step: 5 },
  { key: 'groupGap', group: 'circle', type: 'number', default: 7, label: 'Between groups', suffix: '°', min: 0, max: 90, step: 0.5 },
  { key: 'nodeGap', group: 'circle', type: 'number', default: 1.2, label: 'Between nodes', suffix: '°', min: 0, max: 45, step: 0.1 },
  { key: 'showDisc', group: 'circle', type: 'boolean', default: true, label: 'Disc behind the flows' },
  { key: 'discColor', group: 'circle', type: 'color', default: '#FFFFFF', label: 'Disc colour' },

  { key: 'ribbonOrder', group: 'flows', type: 'select', default: 'untangled', label: 'Order along a node', options: [{ value: 'untangled', label: 'By where they go, with few crossings' }, { value: 'carrier', label: 'By carrier' }, { value: 'size', label: 'Largest first' }] },
  { key: 'flowOpacity', group: 'flows', type: 'number', default: 0.6, label: 'Opacity', min: 0.05, max: 1, step: 0.05 },
  { key: 'bend', group: 'flows', type: 'number', default: 70, label: 'Bend to the centre', suffix: '%', min: 0, max: 100, step: 5 },
  { key: 'arrows', group: 'flows', type: 'boolean', default: true, label: 'Arrow heads' },
  { key: 'flowLabels', group: 'flows', type: 'select', default: 'none', label: 'On flows', options: [{ value: 'none', label: 'Nothing' }, { value: 'values', label: 'Values' }, { value: 'icons', label: 'Icons' }], help: 'Where they fit.' },

  { key: 'nodeWidth', group: 'nodes', type: 'number', default: 7, label: 'Width of nodes', suffix: 'px', min: 0, max: 100, step: 1 },
  { key: 'nodeColor', group: 'nodes', type: 'color', default: '#B9B2A6', label: 'Colour of mixed nodes', help: 'Nodes with flows of one carrier take its colour.' },
  { key: 'showGroups', group: 'nodes', type: 'boolean', default: true, label: 'Arcs of groups' },
  { key: 'groupPlace', group: 'nodes', type: 'select', default: 'outside', label: 'Place of groups', options: PLACES },
  { key: 'groupWidth', group: 'nodes', type: 'number', default: 28, label: 'Width of groups', suffix: 'px', min: 4, max: 200, step: 1 },
  { key: 'groupColor', group: 'nodes', type: 'color', default: '#FFFFFF', label: 'Colour of groups' },
  { key: 'groupBorder', group: 'nodes', type: 'boolean', default: true, label: 'Border around groups' },
  { key: 'cornerRadius', group: 'nodes', type: 'number', default: 4, label: 'Corner radius', suffix: 'px', min: 0, max: 40, step: 1 },

  { key: 'showNames', group: 'labels', type: 'boolean', default: true, label: 'Names of nodes' },
  { key: 'showValues', group: 'labels', type: 'boolean', default: true, label: 'Amounts of nodes' },
  { key: 'nodeAmount', group: 'labels', type: 'select', default: 'larger', label: 'Amount of a node', options: [{ value: 'larger', label: 'The larger of what goes in and out' }, { value: 'sum', label: 'In and out together' }, { value: 'out', label: 'What goes out' }, { value: 'in', label: 'What comes in' }] },
  { key: 'showDetails', group: 'labels', type: 'boolean', default: true, label: 'Details under them' },
  { key: 'nodeIcons', group: 'labels', type: 'boolean', default: true, label: 'Icons of nodes' },
  { key: 'showGroupNames', group: 'labels', type: 'boolean', default: true, label: 'Names of groups' },
  { key: 'colorValues', group: 'labels', type: 'boolean', default: true, label: 'Amounts in the colour of their carrier' },
  { key: 'markerLines', group: 'labels', type: 'select', default: 'auto', label: 'Lines to labels', options: [{ value: 'auto', label: 'Where a label had to move' }, { value: 'always', label: 'Always' }, { value: 'never', label: 'Never' }] },
  { key: 'labelDistance', group: 'labels', type: 'number', default: 16, label: 'Distance', suffix: 'px', min: 0, max: 400, step: 1 },
  { key: 'labelWidth', group: 'labels', type: 'number', default: 180, label: 'Widest label', suffix: 'px', min: 40, max: 800, step: 5 },

  { key: 'legend', group: 'legend', type: 'select', default: 'top', label: 'Legend', options: [{ value: 'top', label: 'Above the diagram' }, { value: 'bottom', label: 'Below the diagram' }, { value: 'none', label: 'None' }] },

  { key: 'font', group: 'text', type: 'font', default: '', label: 'Font', help: 'Bundled fonts are embedded in exports.' },
  { key: 'fontSize', group: 'text', type: 'number', default: 14, label: 'Text size', suffix: 'px', min: 6, max: 40, step: 0.5, help: 'Node names; other texts and icons scale with it.' },
  { key: 'textColor', group: 'text', type: 'color', default: '#2B2B2B', label: 'Text colour' },
  { key: 'mutedTextColor', group: 'text', type: 'color', default: '#827D75', label: 'Details colour' },
  { key: 'softenColors', group: 'text', type: 'boolean', default: false, label: 'Soften carrier colours', help: 'Draws strong colours calmer; the colours in the file stay as they are.' },

  { ...SHADOW_SETTING },
  ...PATTERN_SETTINGS
]

export const SETTING_GROUPS = [
  { id: 'scenario', label: 'Scenario' },
  { id: 'canvas', label: 'Canvas' },
  { id: 'title', label: 'Title' },
  { id: 'scale', label: 'Values and scale' },
  { id: 'circle', label: 'Circle' },
  { id: 'flows', label: 'Flows' },
  { id: 'nodes', label: 'Nodes and groups' },
  { id: 'labels', label: 'Labels' },
  { id: 'legend', label: 'Legend' },
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

export const FLOW_HEAD = ['source', 'target', 'carrier', 'part']
export const FLOW_TAIL = ['note', 'icon', 'pattern', 'patterncolor']
export const DETAIL_HEAD = ['node', 'title']
export const NODE_COLUMNS = ['id', 'title', 'group', 'color', 'icon', 'label', 'visible', 'labelx', 'labely', 'note']
export const GROUP_COLUMNS = ['id', 'title', 'color', 'place']
export const CARRIER_COLUMNS = ['id', 'title', 'color', 'pattern', 'patterncolor', 'icon', 'visible']
export const SCENARIO_COLUMNS = ['id', 'title']
export const scenarioIds = doc => doc.scenarios.map(s => s.id).filter(Boolean)
export const flowColumns = doc => [...FLOW_HEAD, ...scenarioIds(doc), ...FLOW_TAIL]
export const detailColumns = doc => [...DETAIL_HEAD, ...scenarioIds(doc)]
// Columns of the flows and details tables that can't be the amounts of a scenario.
const RESERVED = [...FLOW_HEAD, ...FLOW_TAIL, ...DETAIL_HEAD, 'sourcegroup', 'targetgroup']
export const reservedColumn = key => { const k = String(key).trim().toLowerCase(); return RESERVED.includes(k) || k.startsWith('_') }

export const TABLES = ['flows', 'nodes', 'groups', 'carriers', 'scenarios', 'details']

// Everything that can have an icon.
export const iconRows = doc => [...doc.nodes, ...doc.carriers, ...doc.flows]

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

const yes = v => (v === undefined || v === null || v === '' ? true : parseBoolean(v))
export const isVisible = row => yes(row.visible)
// Without a label of its own a node is only a part of its group: no arc, and its flows end at the group's.
export const hasLabel = row => yes(row.label)

export function hexColor (value) {
  const v = text(value)
  if (/^#[0-9a-f]{6}$/i.test(v)) return v
  return /^#[0-9a-f]{3}$/i.test(v) ? '#' + v.slice(1).split('').map(c => c + c).join('') : null
}

// A carrier's colour, with a stable fallback by its place in the table.
export const carrierColor = (doc, carrier) => hexColor(carrier.color) || standardColor(doc.carriers.indexOf(carrier), carrier.id, carrier.title)

// The scenario that is shown.
export function shownScenario (doc) {
  const id = text(doc.settings.scenario)
  return doc.scenarios.find(s => s.id === id) || doc.scenarios[0] || null
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

// Turn raw file data into a document. raw = { flows, nodes, groups, carriers, scenarios,
// details, settings, version, columns? }. Returns { doc, notes }.
export function normalizeDocument (raw) {
  const notes = []
  const cols = raw.columns || {}
  const groupOfNode = new Map() // from sourceGroup and targetGroup columns
  const flows = rowsOf(raw.flows).map(row => {
    const out = { ...row, _uid: newUid('f') }
    ;['source', 'target', 'carrier', 'part'].forEach(k => { if (out[k] !== undefined || k !== 'part') out[k] = text(out[k]) })
    ;[['sourceGroup', 'source'], ['targetGroup', 'target']].forEach(([g, n]) => { if (text(out[g]) && out[n] && !groupOfNode.has(out[n])) groupOfNode.set(out[n], text(out[g])) })
    return out
  })
  const details = rowsOf(raw.details).map(row => ({ ...row, _uid: newUid('d'), node: text(row.node), title: text(row.title) || text(row.label) }))
  const nodes = rowsOf(raw.nodes).map(row => ({ ...row, _uid: newUid('n'), id: text(row.id), title: text(row.title) || text(row.id), group: text(row.group) || groupOfNode.get(text(row.id)) || '' }))
  const groups = rowsOf(raw.groups).map(row => ({ ...row, _uid: newUid('g'), id: text(row.id), title: text(row.title) || text(row.id), color: text(row.color) }))
  const carriers = rowsOf(raw.carriers).map(row => ({ ...row, _uid: newUid('c'), id: text(row.id), title: text(row.title) || text(row.name) || text(row.id), color: text(row.color) }))
  const scenarios = rowsOf(raw.scenarios).map(row => ({ ...row, _uid: newUid('s'), id: text(row.id), title: text(row.title) || text(row.id) }))

  // Without a scenarios table, every numeric column of the flows is a scenario, in file order.
  if (!scenarios.length) {
    const keys = []
    ;[...(cols.flows || []).map(String), ...flows.flatMap(f => Object.keys(f))].forEach(k => { if (!reservedColumn(k) && !keys.includes(k)) keys.push(k) })
    keys.filter(k => flows.some(f => isFiniteNumber(toNumber(f[k])))).forEach(id => scenarios.push({ _uid: newUid('s'), id, title: id === 'value' ? 'Value' : id }))
    if (!scenarios.length) scenarios.push({ _uid: newUid('s'), id: 'value', title: 'Value' })
  }
  ;[...flows, ...details].forEach(r => scenarios.forEach(s => { if (s.id in r) r[s.id] = toNumber(r[s.id]) }))

  // Nodes, groups and carriers that are only referred to still get drawn: add them.
  const unknown = (list, ids) => { const known = new Set(list.map(x => x.id)); return [...new Set(ids.filter(id => id && !known.has(id)))] }
  const newNodes = unknown(nodes, flows.flatMap(f => [f.source, f.target]))
  newNodes.forEach(id => nodes.push({ _uid: newUid('n'), id, title: id, group: groupOfNode.get(id) || '' }))
  unknown(groups, nodes.map(n => n.group)).forEach(id => groups.push({ _uid: newUid('g'), id, title: id, color: '' }))
  const newCarriers = unknown(carriers, flows.map(f => f.carrier))
  newCarriers.forEach(id => carriers.push({ _uid: newUid('c'), id, title: id, color: standardColor(carriers.length, id) }))
  const list = ids => `${ids.slice(0, 4).join(', ')}${ids.length > 4 ? ', …' : ''}`
  if (newNodes.length && raw.nodes && raw.nodes.length) notes.push(`Added ${newNodes.length} node(s) used by flows but missing from the nodes table: ${list(newNodes)}.`)
  if (newCarriers.length && raw.carriers && raw.carriers.length) notes.push(`Added ${newCarriers.length} carrier(s) used by flows but missing from the carriers table: ${list(newCarriers)}.`)

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

  const doc = { flows, nodes, groups, carriers, scenarios, details, settings, meta: { sourceVersion: Math.floor(Number(String(raw.version ?? 1).split('.')[0])) || 1, settingsOrder, settingsStyle } }
  Object.assign(doc.meta, {
    flowColumns: columnOrder(flows, flowColumns(doc), cols.flows),
    nodeColumns: columnOrder(nodes, NODE_COLUMNS, cols.nodes),
    groupColumns: columnOrder(groups, GROUP_COLUMNS, cols.groups),
    carrierColumns: columnOrder(carriers, CARRIER_COLUMNS, cols.carriers),
    scenarioColumns: columnOrder(scenarios, SCENARIO_COLUMNS, cols.scenarios),
    detailColumns: columnOrder(details, detailColumns(doc), (cols.details || []).map(c => (c === 'label' ? 'title' : c)))
  })
  return { doc, notes }
}

export function emptyDocument () {
  return normalizeDocument({ flows: [], nodes: [], groups: [], carriers: [], scenarios: [], details: [], settings: [] }).doc
}

export const META = { flows: 'flowColumns', nodes: 'nodeColumns', groups: 'groupColumns', carriers: 'carrierColumns', scenarios: 'scenarioColumns', details: 'detailColumns' }
export const standardColumns = (doc, kind) => ({ flows: flowColumns(doc), nodes: NODE_COLUMNS, groups: GROUP_COLUMNS, carriers: CARRIER_COLUMNS, scenarios: SCENARIO_COLUMNS, details: detailColumns(doc) })[kind]

function strip (row, columns) {
  const out = {}
  const put = c => { if (!c.startsWith('_') && row[c] !== undefined && !(c in out)) out[c] = row[c] }
  columns.forEach(put)
  Object.keys(row).forEach(put)
  return out
}

// Plain rows for writing a file in `format` ('xlsx' | 'json' | 'yaml').
export function documentToFileData (doc, format) {
  const columns = { ...Object.fromEntries(TABLES.map(k => [k, columnOrder(doc[k], standardColumns(doc, k), doc.meta[META[k]])])), settings: ['setting', 'waarde'] }
  const order = [...doc.meta.settingsOrder, ...Object.keys(doc.settings).filter(k => !doc.meta.settingsOrder.includes(k))]
  const settings = order.filter(key => doc.settings[key] !== undefined).map(key => {
    const def = SETTINGS_BY_KEY[key]
    let value = doc.settings[key]
    if (def && def.type === 'boolean') value = booleanForFile(value, doc.meta.settingsStyle[key] || (format === 'xlsx' ? 'yesno' : 'bool'))
    return { setting: key, waarde: value }
  })
  const on = format === 'xlsx' ? 'Yes' : true
  const off = format === 'xlsx' ? 'No' : false
  const withFlags = r => {
    ;['visible', 'label'].forEach(k => { if (k in r && r[k] !== '') r[k] = parseBoolean(r[k]) ? on : off })
    return r
  }
  const plain = kind => doc[kind].map(r => strip(r, columns[kind]))
  return {
    version: `${SCHEMA_VERSION}.0`,
    flows: plain('flows'),
    nodes: plain('nodes').map(withFlags),
    groups: plain('groups'),
    carriers: plain('carriers').map(withFlags),
    scenarios: plain('scenarios'),
    details: plain('details'),
    settings,
    columns
  }
}
