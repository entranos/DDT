// The bar chart editor's document model.
//
//   { bars, series, settings, meta }
//   bars    one row per bar: { title, group, <series id>…, icon, color, pattern, visible, note }
//           with a column per series. `<series id>_icon`, `_pattern` and `_patterncolor` are for
//           one part of one bar, where it differs from its series
//   series  what bars are made of: { id, title, color, pattern, icon, visible }
//           `id` is the column name of the series in the bars table
//
// Rows keep every column they were read with, so files round-trip without losing
// data. Each row carries an internal `_uid` that is never written to files.

import { newUid, parseBoolean, booleanStyle, booleanForFile, toNumber, isFiniteNumber } from '../../../shared/src/values.js'
import { standardColor } from '../../../shared/src/standardPalette.js'
import { PATTERN_SETTINGS } from '../../../shared/src/patterns.js'
import { SHADOW_SETTING } from '../../../shared/src/shadow.js'

export const SCHEMA_VERSION = 1

export { newUid, parseBoolean, toNumber, isFiniteNumber }

export const SETTINGS = [
  { key: 'canvasWidth', group: 'canvas', type: 'number', default: 1200, label: 'Width', suffix: 'px', min: 100, step: 10 },
  { key: 'canvasHeight', group: 'canvas', type: 'number', default: 800, label: 'Height', suffix: 'px', min: 100, step: 10 },
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

  { key: 'orientation', group: 'chart', type: 'select', control: 'segmented', default: 'vertical', label: 'Bars', options: [{ value: 'vertical', label: 'Vertical' }, { value: 'horizontal', label: 'Horizontal' }] },
  { key: 'mode', group: 'chart', type: 'select', control: 'segmented', default: 'stacked', label: 'Series', options: [{ value: 'stacked', label: 'Stacked' }, { value: 'grouped', label: 'Side by side' }, { value: 'share', label: 'To 100%' }] },
  { key: 'order', group: 'chart', type: 'select', default: 'listed', label: 'Order', options: [{ value: 'listed', label: 'As listed' }, { value: 'largest', label: 'Largest first' }, { value: 'smallest', label: 'Smallest first' }], help: 'Within each group.' },

  { key: 'scaleMode', group: 'scale', type: 'select', default: 'fit', label: 'Length', options: [{ value: 'fit', label: 'Fill the canvas' }, { value: 'fixed', label: 'Fixed pixels per unit' }], help: 'Use the same fixed scale in several charts to compare them.' },
  { key: 'pxPerUnit', group: 'scale', type: 'number', default: 1, label: 'Pixels per unit', min: 0.000001, step: 'any' },
  { key: 'axisMax', group: 'scale', type: 'number', default: 0, label: 'End of the axis', min: 0, step: 'any', help: '0 ends it at the longest bar. Longer bars always extend it.' },
  { key: 'multiply', group: 'scale', type: 'number', default: 1, label: 'Multiply values by', step: 'any', help: 'For unit conversion. 0.27778 turns PJ into TWh.' },
  { key: 'unit', group: 'scale', type: 'text', default: '', label: 'Unit', placeholder: 'e.g. PJ' },
  { key: 'decimals', group: 'scale', type: 'select', default: 'auto', label: 'Decimals', options: [{ value: 'auto', label: 'Automatic' }, { value: '0', label: '0' }, { value: '1', label: '1' }, { value: '2', label: '2' }, { value: '3', label: '3' }] },

  { key: 'barIcons', group: 'icons', type: 'select', default: 'axis', label: 'Icons of bars', options: [{ value: 'axis', label: 'With its name' }, { value: 'inside', label: 'In the bar, at its start' }, { value: 'end', label: 'At the end of the bar' }, { value: 'none', label: 'None' }], help: 'Bars side by side always have them with the name.' },
  { key: 'seriesIcons', group: 'icons', type: 'boolean', default: true, label: 'Icons of series in the bars', help: 'Shown where they fit.' },
  { key: 'iconSize', group: 'icons', type: 'number', default: 24, label: 'Largest size', suffix: 'px', min: 8, max: 120, step: 1 },

  { key: 'showTotals', group: 'labels', type: 'boolean', default: true, label: 'Amount at the end of bars' },
  { key: 'showValues', group: 'labels', type: 'boolean', default: false, label: 'Values in the bars' },
  { key: 'showShares', group: 'labels', type: 'boolean', default: false, label: 'Shares in the bars', help: 'Of the bar’s total. Texts and icons show where they fit.' },
  { key: 'showNames', group: 'labels', type: 'boolean', default: true, label: 'Names of bars' },
  { key: 'nameAngle', group: 'labels', type: 'select', default: 'auto', label: 'Names under vertical bars', options: [{ value: 'auto', label: 'Automatic' }, { value: 'horizontal', label: 'Horizontal' }, { value: 'slanted', label: 'Slanted' }] },
  { key: 'showGroupNames', group: 'labels', type: 'boolean', default: true, label: 'Names of groups' },
  { key: 'showAxis', group: 'labels', type: 'boolean', default: true, label: 'Value axis' },
  { key: 'showGrid', group: 'labels', type: 'boolean', default: true, label: 'Grid lines' },
  { key: 'axisTitle', group: 'labels', type: 'text', default: '', label: 'Axis title', placeholder: 'The unit when empty' },

  { key: 'legend', group: 'legend', type: 'select', default: 'top', label: 'Legend', options: [{ value: 'top', label: 'Above the chart' }, { value: 'bottom', label: 'Below the chart' }, { value: 'none', label: 'None' }], help: 'Not shown for a single series.' },

  { key: 'barSize', group: 'layout', type: 'number', default: 62, label: 'Bar width', suffix: '%', min: 5, max: 100, step: 1 },
  { key: 'maxBar', group: 'layout', type: 'number', default: 64, label: 'At most', suffix: 'px', min: 2, max: 400, step: 1 },
  { key: 'groupGap', group: 'layout', type: 'number', default: 36, label: 'Between groups', suffix: 'px', min: 0, max: 300, step: 1 },
  { key: 'seriesGap', group: 'layout', type: 'number', default: 2, label: 'Between series', suffix: 'px', min: 0, max: 40, step: 0.5 },
  { key: 'cornerRadius', group: 'layout', type: 'number', default: 5, label: 'Corner radius', suffix: 'px', min: 0, max: 60, step: 1 },
  { key: 'showTracks', group: 'layout', type: 'boolean', default: false, label: 'Track behind the bars' },

  { key: 'font', group: 'text', type: 'font', default: '', label: 'Font', help: 'Bundled fonts are embedded in exports.' },
  { key: 'fontSize', group: 'text', type: 'number', default: 14, label: 'Text size', suffix: 'px', min: 6, max: 40, step: 0.5, help: 'Bar names; other texts scale with it.' },
  { key: 'textColor', group: 'text', type: 'color', default: '#2B2B2B', label: 'Text colour' },
  { key: 'mutedTextColor', group: 'text', type: 'color', default: '#827D75', label: 'Axis text' },
  { key: 'gridColor', group: 'text', type: 'color', default: '#E3DFD7', label: 'Grid colour' },
  { key: 'softenColors', group: 'text', type: 'boolean', default: false, label: 'Soften colours', help: 'Draws strong colours calmer; the colours in the file stay as they are.' },

  SHADOW_SETTING,
  ...PATTERN_SETTINGS
]

export const SETTING_GROUPS = [
  { id: 'chart', label: 'Chart' },
  { id: 'canvas', label: 'Canvas' },
  { id: 'title', label: 'Title' },
  { id: 'scale', label: 'Values and scale' },
  { id: 'icons', label: 'Icons' },
  { id: 'labels', label: 'Labels' },
  { id: 'legend', label: 'Legend' },
  { id: 'layout', label: 'Bars' },
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

export const BAR_HEAD = ['title', 'group']
export const BAR_TAIL = ['icon', 'color', 'pattern', 'patterncolor', 'visible', 'note']
// Columns of the bars table that are not series.
export const BAR_KEYS = [...BAR_HEAD, ...BAR_TAIL]
const TITLE_ALIASES = ['bar', 'name', 'label', 'naam']
export const SERIES_COLUMNS = ['id', 'title', 'color', 'pattern', 'patterncolor', 'icon', 'visible']
// Columns of the bars table for one part of a bar, beside its amount.
const PART_SUFFIXES = ['_icon', '_pattern', '_patterncolor']
export const iconKey = seriesId => `${seriesId}_icon`
export const patternKey = seriesId => `${seriesId}_pattern`
export const patternColorKey = seriesId => `${seriesId}_patterncolor`
// Every column of one series.
export const seriesKeys = seriesId => [seriesId, ...PART_SUFFIXES.map(x => `${seriesId}${x}`)]
export const reservedColumn = key => { const k = String(key).trim().toLowerCase(); return BAR_KEYS.includes(k) || TITLE_ALIASES.includes(k) || k.startsWith('_') || PART_SUFFIXES.some(x => k.endsWith(x)) }
export const barColumns = doc => [...BAR_HEAD, ...doc.series.map(s => s.id).filter(Boolean), ...BAR_TAIL]

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

export function hexColor (value) {
  const v = text(value)
  if (/^#[0-9a-f]{6}$/i.test(v)) return v
  return /^#[0-9a-f]{3}$/i.test(v) ? '#' + v.slice(1).split('').map(c => c + c).join('') : null
}

// A series' colour, with a stable fallback by its place in the table.
export const seriesColor = (doc, series) => hexColor(series.color) || standardColor(doc.series.indexOf(series), series.id, series.title)

// Everything that can have an icon, for the picker and the icon library: bars, series, and
// single parts of bars.
export function iconRows (doc) {
  const parts = doc.bars.flatMap(b => doc.series.filter(s => text(b[iconKey(s.id)])).map(s => ({ _uid: b._uid, title: `${b.title}, ${s.title || s.id}`, icon: b[iconKey(s.id)], part: s._uid })))
  return [...doc.bars, ...doc.series, ...parts]
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

// Turn raw file data into a document. raw = { bars, series, settings, version, columns? }.
// Returns { doc, notes }.
export function normalizeDocument (raw) {
  const notes = []
  const cols = raw.columns || {}
  const alias = Object.fromEntries(TITLE_ALIASES.map(a => [a, 'title']))
  const bars = rowsOf(raw.bars).map(row => {
    const out = { ...row, _uid: newUid('b') }
    if (out.title === undefined) {
      const key = Object.keys(out).find(k => TITLE_ALIASES.includes(k.trim().toLowerCase()))
      if (key) { out.title = out[key]; delete out[key] }
    }
    out.title = text(out.title)
    out.group = text(out.group)
    return out
  })
  const header = (cols.bars || []).map(c => alias[String(c).trim().toLowerCase()] || String(c))
  const series = rowsOf(raw.series).map(row => ({ ...row, _uid: newUid('s'), id: text(row.id), title: text(row.title) || text(row.id), color: text(row.color) }))

  // Without a series table, every numeric column of the bars is a series, in file order.
  if (!series.length) {
    const keys = []
    ;[...header, ...bars.flatMap(b => Object.keys(b))].forEach(k => { if (!reservedColumn(k) && !keys.includes(k)) keys.push(k) })
    keys.filter(k => bars.some(b => isFiniteNumber(toNumber(b[k])))).forEach((id, i) => series.push({ _uid: newUid('s'), id, title: id, color: standardColor(i, id), visible: true }))
    if (series.length && raw.series) notes.push(`Set up the series from the columns ${series.slice(0, 5).map(s => s.id).join(', ')}${series.length > 5 ? ', …' : ''}.`)
  }
  bars.forEach(b => series.forEach(s => { if (s.id in b) b[s.id] = toNumber(b[s.id]) }))

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
    bars,
    series,
    settings,
    meta: {
      sourceVersion: Math.floor(Number(String(raw.version ?? 1).split('.')[0])) || 1,
      settingsOrder,
      settingsStyle,
      barColumns: columnOrder(bars, [...BAR_HEAD, ...series.map(s => s.id), ...BAR_TAIL], header),
      seriesColumns: columnOrder(series, SERIES_COLUMNS, cols.series)
    }
  }
  return { doc, notes }
}

export function emptyDocument () {
  return normalizeDocument({ bars: [], series: [], settings: [] }).doc
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
    bars: columnOrder(doc.bars, barColumns(doc), doc.meta.barColumns),
    series: columnOrder(doc.series, SERIES_COLUMNS, doc.meta.seriesColumns),
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
  return { version: `${SCHEMA_VERSION}.0`, bars: withVisible(doc.bars, columns.bars), series: withVisible(doc.series, columns.series), settings, columns }
}
