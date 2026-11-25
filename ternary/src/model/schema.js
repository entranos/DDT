// The ternary editor's document model.
//
//   { axes, series, points, settings, meta }
//   axes    the three corners: { id, label, corner: left|right|bottom, low, high }
//           `id` is the column name of that share in the points table
//   series  trajectories: { id, title, group, color, style: solid|dashed, highlight, visible }
//   points  one row per series and year: { series, year, <axis id> ×3 }
//           values can be in any unit; each point is normalised to shares of 100%
//
// Rows keep every column they were read with, so files round-trip without losing
// data. Each row carries an internal `_uid` that is never written to files.

import { newUid, parseBoolean, booleanStyle, booleanForFile, toNumber, isFiniteNumber } from '../../../shared/src/values.js'

export const SCHEMA_VERSION = 1

export { newUid, parseBoolean, toNumber, isFiniteNumber }

export const CORNERS = [
  { id: 'left', label: 'Top left' },
  { id: 'right', label: 'Top right' },
  { id: 'bottom', label: 'Bottom' }
]

export const DEFAULT_AXES = [
  { id: 'bio', label: 'Bio & other', corner: 'left', low: 'Little bio & other', high: 'Much bio & other' },
  { id: 'electrons', label: 'Electrons', corner: 'right', low: 'Few electrons', high: 'Many electrons' },
  { id: 'fossil', label: 'Fossil', corner: 'bottom', low: 'Little fossil', high: 'Much fossil' }
]

export const SETTINGS = [
  { key: 'canvasWidth', group: 'canvas', type: 'number', default: 1200, label: 'Width', suffix: 'px', min: 100, step: 10 },
  { key: 'canvasHeight', group: 'canvas', type: 'number', default: 900, label: 'Height', suffix: 'px', min: 100, step: 10 },
  { key: 'margin', group: 'canvas', type: 'number', default: 60, label: 'Margin', suffix: 'px', min: 0, max: 400, step: 2, wide: true, help: 'Free space between the edges of the canvas and the diagram with its texts and legend.' },
  { key: 'scaleCanvas', group: 'canvas', type: 'number', default: 1, label: 'Output scale', min: 0.1, max: 5, step: 0.05, wide: true, help: 'Scales the drawing inside the exported image: 0.8 draws everything at 80%. Zooming the view does not change it.' },
  { key: 'backgroundColor', group: 'canvas', type: 'color', default: '#F5F3EF', label: 'Background' },
  { key: 'transparentBackground', group: 'canvas', type: 'boolean', default: false, label: 'Transparent background', help: 'Exports without a background fill.' },

  { key: 'title', group: 'title', type: 'text', default: '', label: 'Title', placeholder: 'Diagram title' },
  { key: 'titleFontSize', group: 'title', type: 'number', default: 24, label: 'Size', suffix: 'px', min: 6, step: 1 },
  { key: 'titlePositionX', group: 'title', type: 'number', default: 60, label: 'X', step: 1 },
  { key: 'titlePositionY', group: 'title', type: 'number', default: 60, label: 'Y', step: 1 },
  { key: 'titleColor', group: 'title', type: 'color', default: '#2B2B2B', label: 'Colour' },

  { key: 'zoom', group: 'plot', type: 'select', default: 'auto', label: 'Axes', options: [{ value: 'auto', label: 'Zoomed to the data' }, { value: 'full', label: 'Full, 0–100%' }], wide: true, help: 'Zoomed shows only the part of the triangle the visible series use; lower bounds round down to 5%. Percentages read the same.' },
  { key: 'stretch', group: 'plot', type: 'boolean', default: true, label: 'Widen the zoomed plot', help: 'Spreads trajectories apart sideways when zoomed (no longer equilateral).' },
  { key: 'gridStep', group: 'plot', type: 'select', default: 'auto', label: 'Grid lines every', options: [{ value: 'auto', label: 'Automatic' }, { value: '0.05', label: '5%' }, { value: '0.1', label: '10%' }, { value: '0.2', label: '20%' }, { value: '0.25', label: '25%' }] },
  { key: 'showArrows', group: 'plot', type: 'boolean', default: true, label: 'Direction arrows', help: 'The “few … / many …” arrows around the triangle; texts come from the corners.' },

  { key: 'lineWidth', group: 'series', type: 'number', default: 2, label: 'Line width', suffix: 'px', min: 0.5, max: 12, step: 0.1 },
  { key: 'dotSize', group: 'series', type: 'number', default: 3.6, label: 'Dot size', suffix: 'px', min: 0, max: 14, step: 0.2 },
  { key: 'curve', group: 'series', type: 'select', default: 'smooth', label: 'Lines', options: [{ value: 'smooth', label: 'Smooth curves' }, { value: 'straight', label: 'Straight' }] },
  { key: 'yearLabels', group: 'series', type: 'select', default: 'highlighted', label: 'Year labels', options: [{ value: 'highlighted', label: 'On highlighted series' }, { value: 'all', label: 'On every series' }, { value: 'none', label: 'None' }] },
  { key: 'markYear', group: 'series', type: 'number', default: 0, label: 'Mark year', min: 0, step: 1, wide: true, help: 'Draws a ring around this year on highlighted series. 0 for none.' },

  { key: 'showLegend', group: 'legend', type: 'boolean', default: true, label: 'Show legend' },
  { key: 'legendPosition', group: 'legend', type: 'select', segmented: true, default: 'top', label: 'Position', options: [{ value: 'top', label: 'Top' }, { value: 'right', label: 'Right' }, { value: 'bottom', label: 'Bottom' }], help: 'Between the title and the triangle, right of the triangle, or below it.' },
  { key: 'legendWidth', group: 'legend', type: 'number', default: 240, label: 'Width', suffix: 'px', min: 60, max: 800, step: 10, showIf: s => s('legendPosition') === 'right' },
  { key: 'legendRows', group: 'legend', type: 'number', default: 0, label: 'Rows', min: 0, max: 30, step: 1, help: 'Most entries above each other. 0 uses as few rows as the width allows.', showIf: s => s('legendPosition') !== 'right' },

  { key: 'font', group: 'text', type: 'font', default: '', label: 'Font', help: 'Bundled fonts are embedded in exports.' },
  { key: 'fontSize', group: 'text', type: 'number', default: 16, label: 'Text size', suffix: 'px', min: 6, max: 40, step: 0.5, help: 'Corner names; other texts scale with it.' },
  { key: 'textColor', group: 'text', type: 'color', default: '#2B2B2B', label: 'Text colour' },
  { key: 'gridColor', group: 'text', type: 'color', default: '#E0DCD4', label: 'Grid colour' },

  { key: 'unit', group: 'values', type: 'text', default: '', label: 'Unit', placeholder: 'e.g. PJ', help: 'Of the values in the points table; shown with totals in tooltips.' },
  { key: 'decimals', group: 'values', type: 'number', default: 0, label: 'Decimals for totals', min: 0, max: 4, step: 1 }
]

export const SETTING_GROUPS = [
  { id: 'canvas', label: 'Canvas' },
  { id: 'title', label: 'Title' },
  { id: 'axes', label: 'Corners' },
  { id: 'plot', label: 'Triangle' },
  { id: 'series', label: 'Lines and points' },
  { id: 'legend', label: 'Legend' },
  { id: 'text', label: 'Text and colours' },
  { id: 'values', label: 'Values' }
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

// Colours for series without one: a hue per group, shades within it.
export { STANDARD_COLORS as GROUP_PALETTE } from '../../../shared/src/standardPalette.js'

export const AXIS_COLUMNS = ['id', 'label', 'corner', 'low', 'high']
export const SERIES_COLUMNS = ['id', 'title', 'group', 'color', 'style', 'highlight', 'visible']
export const pointColumns = doc => ['series', 'year', ...doc.axes.map(a => a.id).filter(Boolean)]

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

export function seriesIsDashed (s) { return /^(dash|dashed|gestreept|history|dotted)/i.test(text(s.style)) }
export function seriesIsHighlighted (s) { return parseBoolean(s.highlight) }
export function seriesIsVisible (s) { return s.visible === undefined || s.visible === null || s.visible === '' ? true : parseBoolean(s.visible) }

function columnOrder (rows, preferred, headerColumns = []) {
  const cols = []
  const add = c => { if (!c.startsWith('_') && !cols.includes(c)) cols.push(c) }
  headerColumns.forEach(add)
  rows.forEach(r => Object.keys(r).forEach(add))
  const front = preferred.filter(c => cols.includes(c))
  return [...front, ...cols.filter(c => !front.includes(c))]
}

// Turn raw file data into a document. raw = { axes, series, points, settings, version, columns? }.
// Returns { doc, notes }.
export function normalizeDocument (raw) {
  const notes = []
  let axesRaw = (raw.axes || []).filter(r => r && typeof r === 'object')
  if (!axesRaw.length) {
    // Without an axes table, use the first three numeric columns of the points as corners.
    const skip = new Set(['series', 'scenario', 'year', 'jaar', 'label', 'total'])
    const keys = []
    ;(raw.points || []).forEach(r => Object.keys(r || {}).forEach(k => { if (!skip.has(k.toLowerCase()) && !keys.includes(k)) keys.push(k) }))
    const found = keys.filter(k => (raw.points || []).some(r => isFiniteNumber(toNumber(r && r[k])))).slice(0, 3)
    if (found.length === 3) {
      axesRaw = ['left', 'right', 'bottom'].map((corner, i) => ({ id: found[i], label: found[i], corner }))
      notes.push(`Set up the corners from the point columns ${found.join(', ')}.`)
    } else {
      axesRaw = DEFAULT_AXES
    }
  }
  const used = new Set()
  const axes = axesRaw.slice(0, 3).map((row, i) => {
    let corner = text(row.corner).toLowerCase().replace(/[^a-z]/g, '')
    if (/^top?left$|^lefttop$|^linksboven$/.test(corner) || corner === 'l') corner = 'left'
    else if (/^topright$|^righttop$|^rechtsboven$/.test(corner) || corner === 'r') corner = 'right'
    else if (/^down$|^onder$|^b$|^fossil$/.test(corner)) corner = 'bottom'
    if (!CORNERS.some(c => c.id === corner) || used.has(corner)) corner = CORNERS.map(c => c.id).find(c => !used.has(c)) || 'left'
    used.add(corner)
    return { ...row, _uid: newUid('a'), id: text(row.id) || `share_${i + 1}`, label: text(row.label) || text(row.id) || `Share ${i + 1}`, corner, low: text(row.low), high: text(row.high) }
  })

  const series = (raw.series || []).filter(r => r && typeof r === 'object').map(row => ({ ...row, _uid: newUid('s'), id: text(row.id), title: text(row.title) || text(row.id) }))
  const knownSeries = new Set(series.map(s => s.id))
  const points = (raw.points || []).filter(r => r && typeof r === 'object').map(row => {
    const out = { ...row, _uid: newUid('p') }
    out.series = text(row.series !== undefined ? row.series : row.scenario)
    if ('scenario' in row && row.series === undefined) delete out.scenario
    out.year = toNumber(row.year !== undefined ? row.year : row.jaar)
    if ('jaar' in row && row.year === undefined) delete out.jaar
    axes.forEach(a => { if (a.id in row) out[a.id] = toNumber(row[a.id]) })
    return out
  })
  // Points whose series has no row of its own still get drawn: add the series.
  const implied = [...new Set(points.map(p => p.series).filter(id => id && !knownSeries.has(id)))]
  if (implied.length) {
    implied.forEach(id => series.push({ _uid: newUid('s'), id, title: id, group: '', color: '', style: 'solid', highlight: false, visible: true }))
    if (raw.series && raw.series.length) notes.push(`Added ${implied.length} series used by points but missing from the series table: ${implied.slice(0, 4).join(', ')}${implied.length > 4 ? ', …' : ''}.`)
  }

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
    axes,
    series,
    points,
    settings,
    meta: {
      sourceVersion: Math.floor(Number(String(raw.version ?? 1).split('.')[0])) || 1,
      settingsOrder,
      settingsStyle,
      axisColumns: columnOrder(axes, AXIS_COLUMNS, cols.axes),
      seriesColumns: columnOrder(series, SERIES_COLUMNS, cols.series),
      pointColumns: columnOrder(points, ['series', 'year', ...axes.map(a => a.id)], (cols.points || []).map(c => c === 'scenario' ? 'series' : c === 'jaar' ? 'year' : c))
    }
  }
  return { doc, notes }
}

export function emptyDocument () {
  return normalizeDocument({ axes: DEFAULT_AXES, series: [], points: [], settings: [] }).doc
}

const SERIES_BOOLEANS = ['highlight', 'visible']

function strip (row, columns) {
  const out = {}
  const put = c => { if (!c.startsWith('_') && row[c] !== undefined && !(c in out)) out[c] = row[c] }
  columns.forEach(put)
  Object.keys(row).forEach(put)
  return out
}

// Plain rows for writing a file in `format` ('xlsx' | 'json' | 'yaml').
export function documentToFileData (doc, format) {
  const axisColumns = columnOrder(doc.axes, AXIS_COLUMNS, doc.meta.axisColumns)
  const seriesColumns = columnOrder(doc.series, SERIES_COLUMNS, doc.meta.seriesColumns)
  const pCols = columnOrder(doc.points, pointColumns(doc), doc.meta.pointColumns)
  const order = [...doc.meta.settingsOrder, ...Object.keys(doc.settings).filter(k => !doc.meta.settingsOrder.includes(k))]
  const settings = order.filter(key => doc.settings[key] !== undefined).map(key => {
    const def = SETTINGS_BY_KEY[key]
    let value = doc.settings[key]
    if (def && def.type === 'boolean') value = booleanForFile(value, doc.meta.settingsStyle[key] || (format === 'xlsx' ? 'yesno' : 'bool'))
    return { setting: key, waarde: value }
  })
  const yes = format === 'xlsx' ? 'Yes' : true
  const no = format === 'xlsx' ? 'No' : false
  const series = doc.series.map(s => {
    const out = strip(s, seriesColumns)
    SERIES_BOOLEANS.forEach(k => { if (k in out && out[k] !== '') out[k] = parseBoolean(out[k]) ? yes : no })
    return out
  })
  return {
    version: `${SCHEMA_VERSION}.0`,
    axes: doc.axes.map(a => strip(a, axisColumns)),
    series,
    points: doc.points.map(p => strip(p, pCols)),
    settings,
    columns: { axes: axisColumns, series: seriesColumns, points: pCols, settings: ['setting', 'waarde'] }
  }
}
