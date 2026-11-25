// Pure document edits. Each function takes a document and returns a new one (or the
// same object when nothing changed). The store wraps them for undo.

import { nextStandardColor } from '../../../shared/src/standardPalette.js'
import { newUid, toNumber, isFiniteNumber, parseBoolean } from '../../../shared/src/values.js'
import { iconKey, patternKey, patternColorKey, seriesKeys, reservedColumn } from './schema.js'

const replaceAt = (arr, i, item) => arr.map((x, j) => (j === i ? item : x))

function patchRow (row, patch) {
  let changed = false
  const next = { ...row }
  Object.entries(patch).forEach(([k, v]) => { if (next[k] !== v) { next[k] = v; changed = true } })
  return changed ? next : row
}

// "Series 3": the first free number after a name.
export function uniqueName (existing, base) {
  const taken = new Set(existing.map(x => String(x).trim().toLowerCase()))
  if (!taken.has(base.toLowerCase())) return base
  let i = 2
  while (taken.has(`${base} ${i}`.toLowerCase())) i += 1
  return `${base} ${i}`
}

const cleanVisible = v => (typeof v === 'boolean' ? v : v === '' ? '' : parseBoolean(v))

function moveRow (rows, uid, targetUid, after) {
  const row = rows.find(r => r._uid === uid)
  if (!row || uid === targetUid || !rows.some(r => r._uid === targetUid)) return rows
  const rest = rows.filter(r => r !== row)
  const at = rest.findIndex(r => r._uid === targetUid) + (after ? 1 : 0)
  const next = [...rest.slice(0, at), row, ...rest.slice(at)]
  return next.every((r, i) => r === rows[i]) ? rows : next
}

// ---- bars ----

const numbers = (doc, row) => { doc.series.forEach(s => { if (s.id in row) row[s.id] = toNumber(row[s.id]) }) }

// A new bar joins the last bar's group.
export function addBar (doc, row = {}) {
  const last = doc.bars[doc.bars.length - 1]
  const b = { title: uniqueName(doc.bars.map(x => x.title), 'New bar'), group: last ? last.group || '' : '', ...row, _uid: row._uid || newUid('b') }
  numbers(doc, b)
  return { ...doc, bars: [...doc.bars, b] }
}

export function updateBar (doc, uid, patch) {
  const i = doc.bars.findIndex(b => b._uid === uid)
  if (i < 0) return doc
  const clean = { ...patch }
  numbers(doc, clean)
  ;['title', 'group'].forEach(k => { if (k in clean) clean[k] = String(clean[k] ?? '').trim() })
  if ('visible' in clean) clean.visible = cleanVisible(clean.visible)
  const after = patchRow(doc.bars[i], clean)
  return after === doc.bars[i] ? doc : { ...doc, bars: replaceAt(doc.bars, i, after) }
}

// Put a bar before or after another one, in that one's group.
export function moveBar (doc, uid, targetUid, after) {
  const target = doc.bars.find(b => b._uid === targetUid)
  if (!target) return doc
  const bars = moveRow(doc.bars, uid, targetUid, after)
  return updateBar(bars === doc.bars ? doc : { ...doc, bars }, uid, { group: target.group || '' })
}

export function renameGroup (doc, from, to) {
  const name = String(to).trim()
  if (name === from || !doc.bars.some(b => (b.group || '') === from)) return doc
  return { ...doc, bars: doc.bars.map(b => ((b.group || '') === from ? { ...b, group: name } : b)) }
}

const round = v => Math.round(v * 1e9) / 1e9
export function setValue (doc, barUid, seriesId, value) {
  return updateBar(doc, barUid, { [seriesId]: isFiniteNumber(value) ? round(value) : value })
}

// The icon or pattern of one part of one bar; '' goes back to its series' own.
const setPart = (doc, barUid, key, value) => {
  const next = updateBar(doc, barUid, { [key]: value })
  if (next === doc || value !== '' || next.bars.some(b => String(b[key] ?? '') !== '')) return next
  return deleteColumn(next, 'bars', key) // no part of this series has its own any more
}
export const setPartIcon = (doc, barUid, seriesId, icon) => setPart(doc, barUid, iconKey(seriesId), icon)
export const setPartPattern = (doc, barUid, seriesId, pattern) => setPart(doc, barUid, patternKey(seriesId), pattern)
export const setPartPatternColor = (doc, barUid, seriesId, color) => setPart(doc, barUid, patternColorKey(seriesId), color)

// ---- series ----

export function seriesIdAllowed (doc, uid, id) {
  return id !== '' && !reservedColumn(id) && !doc.series.some(s => s._uid !== uid && s.id === id)
}

// Whether another series already goes by this name.
export function seriesNameTaken (doc, uid, name) {
  const n = String(name).trim().toLowerCase()
  return doc.series.some(s => s._uid !== uid && [s.id, s.title].some(x => String(x ?? '').trim().toLowerCase() === n))
}

export const nextColor = (doc, ...names) => nextStandardColor(doc.series.map(x => x.color), ...names)

// at: index to insert at; left out, the end.
export function addSeries (doc, row = {}, at = doc.series.length) {
  const name = row.title || row.id || uniqueName(doc.series.flatMap(s => [s.id, s.title || '']), 'Series')
  const s = { id: name, title: name, icon: '', visible: true, ...row, _uid: row._uid || newUid('s') }
  if (!s.color) s.color = nextColor(doc, s.id, s.title)
  return { ...doc, series: [...doc.series.slice(0, at), s, ...doc.series.slice(at)] }
}

// Renaming a series' ID moves its columns of values, icons and patterns along.
export function updateSeries (doc, uid, patch) {
  const i = doc.series.findIndex(s => s._uid === uid)
  if (i < 0) return doc
  const before = doc.series[i]
  const clean = { ...patch }
  if ('id' in clean) {
    clean.id = String(clean.id).trim()
    if (!seriesIdAllowed(doc, uid, clean.id)) delete clean.id
  }
  if ('visible' in clean) clean.visible = cleanVisible(clean.visible)
  const after = patchRow(before, clean)
  if (after === before) return doc
  const next = { ...doc, series: replaceAt(doc.series, i, after) }
  if (after.id === before.id) return next
  const to = seriesKeys(after.id)
  const keys = new Map(seriesKeys(before.id).map((k, j) => [k, to[j]]))
  const rename = k => keys.get(k) ?? k
  return {
    ...next,
    meta: { ...next.meta, barColumns: next.meta.barColumns.map(rename) },
    bars: next.bars.map(b => ([...keys.keys()].some(k => k in b) ? Object.fromEntries(Object.entries(b).map(([k, v]) => [rename(k), v])) : b))
  }
}

// What people mean by renaming a series: its name, and its column when they were the same.
export function renameSeries (doc, uid, title) {
  const s = doc.series.find(x => x._uid === uid)
  const name = String(title).trim()
  if (!s || !name || seriesNameTaken(doc, uid, name)) return doc
  const patch = { title: name }
  if ((s.title || s.id) === s.id && seriesIdAllowed(doc, uid, name)) patch.id = name
  return updateSeries(doc, uid, patch)
}

export function moveSeries (doc, uid, targetUid, after) {
  const series = moveRow(doc.series, uid, targetUid, after)
  return series === doc.series ? doc : { ...doc, series }
}

// One step earlier (-1) or later (1) among the rows drawn (`uids`, in drawing order).
export function stepRow (doc, kind, uid, dir, uids) {
  const target = uids[uids.indexOf(uid) + dir]
  if (!uids.includes(uid) || !target) return doc
  return kind === 'bars' ? moveBar(doc, uid, target, dir > 0) : moveSeries(doc, uid, target, dir > 0)
}

// ---- deletes and settings ----

const META = { bars: 'barColumns', series: 'seriesColumns' }

// Removes a column of a table that is neither a series nor one of its standard columns.
export function deleteColumn (doc, kind, key) {
  return {
    ...doc,
    [kind]: doc[kind].map(r => { if (!(key in r)) return r; const { [key]: gone, ...rest } = r; return rest }),
    meta: { ...doc.meta, [META[kind]]: doc.meta[META[kind]].filter(c => c !== key) }
  }
}

// Deleting a series deletes its column.
export function deleteItems (doc, { bars = [], series = [] }) {
  const gone = doc.series.filter(s => series.includes(s._uid))
  const keep = doc.bars.filter(b => !bars.includes(b._uid))
  if (!gone.length && keep.length === doc.bars.length) return doc
  const next = { ...doc, bars: keep, series: doc.series.filter(s => !series.includes(s._uid)) }
  return gone.reduce((d, s) => seriesKeys(s.id).reduce((x, key) => deleteColumn(x, 'bars', key), d), next)
}

export function setSetting (doc, key, value) {
  if (doc.settings[key] === value) return doc
  return { ...doc, settings: { ...doc.settings, [key]: value } }
}

// Columns in new rows that the table doesn't have become series when they hold numbers.
function withNewSeries (doc, rows) {
  const known = new Set(doc.series.map(s => s.id))
  const keys = [...new Set(rows.flatMap(r => Object.keys(r)))].filter(k => !known.has(k) && !reservedColumn(k) && !doc.meta.barColumns.includes(k))
  return keys.filter(k => rows.some(r => isFiniteNumber(toNumber(r[k])))).reduce((d, k) => addSeries(d, { id: k, title: k }), doc)
}

export function applyRowEdits (doc, kind, edits = [], newRows = []) {
  let next = doc
  edits.forEach(({ uid, patch }) => { next = kind === 'bars' ? updateBar(next, uid, patch) : updateSeries(next, uid, patch) })
  if (kind === 'bars') {
    if (newRows.length) next = withNewSeries(next, newRows)
    newRows.forEach(row => { next = addBar(next, { ...row, group: row.group ?? '' }) })
  } else newRows.forEach(row => { next = addSeries(next, { ...row, id: row.id || row.title || undefined, title: row.title || row.id || undefined }) })
  return next
}
