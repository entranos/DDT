// Pure document edits. Each function takes a document and returns a new one (or the
// same object when nothing changed). The store wraps them for undo.

import { newUid, toNumber, isFiniteNumber, parseBoolean } from '../../../shared/src/values.js'

const replaceAt = (arr, i, item) => arr.map((x, j) => (j === i ? item : x))

function patchRow (row, patch) {
  let changed = false
  const next = { ...row }
  Object.entries(patch).forEach(([k, v]) => { if (next[k] !== v) { next[k] = v; changed = true } })
  return changed ? next : row
}

export function uniqueId (existing, base) {
  const clean = String(base || 'series').trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '') || 'series'
  const taken = new Set(existing)
  if (!taken.has(clean)) return clean
  let i = 2
  while (taken.has(`${clean}_${i}`)) i += 1
  return `${clean}_${i}`
}

// ---- series ----

export function addSeries (doc, row) {
  const s = { group: '', color: '', style: 'solid', highlight: false, visible: true, ...row, _uid: row._uid || newUid('s') }
  return { ...doc, series: [...doc.series, s] }
}

export function updateSeries (doc, uid, patch) {
  const i = doc.series.findIndex(s => s._uid === uid)
  if (i < 0) return doc
  const before = doc.series[i]
  const clean = { ...patch }
  if ('id' in clean) clean.id = String(clean.id).trim()
  if ('visible' in clean && typeof clean.visible !== 'boolean') clean.visible = clean.visible === '' ? '' : parseBoolean(clean.visible)
  if ('highlight' in clean && typeof clean.highlight !== 'boolean') clean.highlight = clean.highlight === '' ? '' : parseBoolean(clean.highlight)
  const after = patchRow(before, clean)
  if (after === before) return doc
  let points = doc.points
  if ('id' in clean && clean.id !== before.id && before.id !== '') points = points.map(p => (p.series === before.id ? { ...p, series: clean.id } : p))
  return { ...doc, series: replaceAt(doc.series, i, after), points }
}

// ---- points ----

export function addPoint (doc, row) {
  const p = { ...row, _uid: row._uid || newUid('p') }
  p.year = toNumber(p.year)
  doc.axes.forEach(a => { if (p[a.id] !== undefined) p[a.id] = toNumber(p[a.id]) })
  return { ...doc, points: [...doc.points, p] }
}

export function updatePoint (doc, uid, patch) {
  const i = doc.points.findIndex(p => p._uid === uid)
  if (i < 0) return doc
  const clean = { ...patch }
  if ('year' in clean) clean.year = toNumber(clean.year)
  if ('series' in clean) clean.series = String(clean.series).trim()
  doc.axes.forEach(a => { if (a.id in clean) clean[a.id] = toNumber(clean[a.id]) })
  const after = patchRow(doc.points[i], clean)
  return after === doc.points[i] ? doc : { ...doc, points: replaceAt(doc.points, i, after) }
}

// Decimals that keep a share accurate to about 0.1% for a total of this size.
export function decimalsFor (total) {
  if (!(total > 0)) return 2
  return Math.max(0, Math.min(6, 3 - Math.floor(Math.log10(total))))
}

// Rounded values for shares ({ <axis id>: fraction }) that add up to exactly `total`:
// the largest share takes the rounding difference.
export function valuesForShares (doc, shares, total) {
  const f = 10 ** decimalsFor(total)
  const values = {}
  doc.axes.forEach(a => { values[a.id] = Math.round(shares[a.id] * total * f) / f })
  const largest = doc.axes.reduce((best, a) => (shares[a.id] > shares[best.id] ? a : best), doc.axes[0])
  const others = doc.axes.reduce((sum, a) => (a === largest ? sum : sum + values[a.id]), 0)
  values[largest.id] = Math.round((total - others) * 1e9) / 1e9
  return values
}

// Set a point's mix, keeping its total.
export function setPointShares (doc, uid, shares, total) {
  return updatePoint(doc, uid, valuesForShares(doc, shares, total))
}

// The year the next point of a series would get: last year + the usual step.
export function nextYear (doc, seriesId) {
  const years = doc.points.filter(p => p.series === seriesId && isFiniteNumber(p.year)).map(p => p.year).sort((a, b) => a - b)
  if (!years.length) return 2030
  const step = years.length > 1 ? years[years.length - 1] - years[years.length - 2] : 5
  return years[years.length - 1] + (step > 0 ? step : 5)
}

// ---- corners ----

const CORNER_IDS = ['left', 'right', 'bottom']

// A corner's ID is a column of the points table, so it can't be empty, one of that
// table's own columns, or another corner's.
export function axisIdAllowed (doc, uid, id) {
  return id !== '' && !['series', 'year'].includes(id.toLowerCase()) && !id.startsWith('_') && !doc.axes.some(a => a._uid !== uid && a.id === id)
}

export function updateAxis (doc, uid, patch) {
  const i = doc.axes.findIndex(a => a._uid === uid)
  if (i < 0) return doc
  const before = doc.axes[i]
  const clean = { ...patch }
  if ('id' in clean) {
    clean.id = String(clean.id).trim()
    if (!axisIdAllowed(doc, uid, clean.id)) delete clean.id
  }
  if ('corner' in clean) {
    clean.corner = String(clean.corner).trim().toLowerCase()
    if (!CORNER_IDS.includes(clean.corner)) delete clean.corner
  }
  const after = patchRow(before, clean)
  if (after === before) return doc
  let axes = replaceAt(doc.axes, i, after)
  // Two corners can't share a position: the one that had it takes the old spot.
  if ('corner' in clean && clean.corner !== before.corner) axes = axes.map((a, j) => (j !== i && a.corner === clean.corner ? { ...a, corner: before.corner } : a))
  let points = doc.points
  if ('id' in clean && clean.id !== before.id) {
    // The share's column in the points table follows its new name.
    points = points.map(p => {
      if (!(before.id in p)) return p
      const { [before.id]: value, ...rest } = p
      return { ...rest, [clean.id]: value }
    })
  }
  return { ...doc, axes, points }
}

// ---- deletes and settings ----

export function deleteItems (doc, { series = [], points = [] }) {
  const sSet = new Set(series)
  const pSet = new Set(points)
  const removedIds = new Set(doc.series.filter(s => sSet.has(s._uid)).map(s => s.id))
  const nextSeries = doc.series.filter(s => !sSet.has(s._uid))
  const nextPoints = doc.points.filter(p => !pSet.has(p._uid) && !removedIds.has(p.series))
  if (nextSeries.length === doc.series.length && nextPoints.length === doc.points.length) return doc
  return { ...doc, series: nextSeries, points: nextPoints }
}

export function setSetting (doc, key, value) {
  if (doc.settings[key] === value) return doc
  return { ...doc, settings: { ...doc.settings, [key]: value } }
}

const UPDATERS = { series: updateSeries, points: updatePoint, axes: updateAxis }

export function applyRowEdits (doc, kind, edits = [], newRows = []) {
  let next = doc
  edits.forEach(({ uid, patch }) => { next = UPDATERS[kind](next, uid, patch) })
  newRows.forEach(row => {
    if (kind === 'points') next = addPoint(next, row)
    else if (kind === 'series') next = addSeries(next, { ...row, id: row.id || uniqueId(next.series.map(s => s.id), row.title || 'series') })
  })
  return next
}

// Points whose series row is missing (kept, but not drawn) get one.
export function addMissingSeries (doc) {
  const known = new Set(doc.series.map(s => s.id))
  const missing = [...new Set(doc.points.map(p => p.series).filter(id => id && !known.has(id)))]
  return missing.reduce((d, id) => addSeries(d, { id, title: id }), doc)
}
