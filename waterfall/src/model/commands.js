// Pure document edits. Each function takes a document and returns a new one (or the
// same object when nothing changed). The store wraps them for undo.

import { nextStandardColor } from '../../../shared/src/standardPalette.js'
import { newUid, toNumber, isFiniteNumber, parseBoolean } from '../../../shared/src/values.js'
import { VALUE_KEYS } from './schema.js'

const replaceAt = (arr, i, item) => arr.map((x, j) => (j === i ? item : x))

function patchRow (row, patch) {
  let changed = false
  const next = { ...row }
  Object.entries(patch).forEach(([k, v]) => { if (next[k] !== v) { next[k] = v; changed = true } })
  return changed ? next : row
}

export function uniqueId (existing, base) {
  const clean = String(base || 'item').trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '') || 'item'
  const taken = new Set(existing)
  if (!taken.has(clean)) return clean
  let i = 2
  while (taken.has(`${clean}_${i}`)) i += 1
  return `${clean}_${i}`
}

const cleanVisible = v => (typeof v === 'boolean' ? v : v === '' ? '' : parseBoolean(v))

function updateRow (doc, key, uid, patch) {
  const i = doc[key].findIndex(r => r._uid === uid)
  if (i < 0) return { doc, before: null }
  const before = doc[key][i]
  const clean = { ...patch }
  if ('id' in clean) clean.id = String(clean.id).trim()
  if ('visible' in clean) clean.visible = cleanVisible(clean.visible)
  const after = patchRow(before, clean)
  return after === before ? { doc, before: null } : { doc: { ...doc, [key]: replaceAt(doc[key], i, after) }, before, after }
}

function moveRow (rows, uid, targetUid, after) {
  const row = rows.find(r => r._uid === uid)
  if (!row || uid === targetUid || !rows.some(r => r._uid === targetUid)) return rows
  const rest = rows.filter(r => r !== row)
  const at = rest.findIndex(r => r._uid === targetUid) + (after ? 1 : 0)
  const next = [...rest.slice(0, at), row, ...rest.slice(at)]
  return next.every((r, i) => r === rows[i]) ? rows : next
}

// ---- diagrams ----

export function addDiagram (doc, row) {
  return { ...doc, diagrams: [...doc.diagrams, { title: '', subtitle: '', visible: true, ...row, _uid: row._uid || newUid('d') }] }
}

// Renaming a diagram keeps its values attached.
export function updateDiagram (doc, uid, patch) {
  const { doc: next, before, after } = updateRow(doc, 'diagrams', uid, patch)
  if (!before || before.id === after.id || before.id === '') return next
  return { ...next, values: next.values.map(v => (v.diagram === before.id ? { ...v, diagram: after.id } : v)) }
}

export function moveDiagram (doc, uid, targetUid, after) {
  const diagrams = moveRow(doc.diagrams, uid, targetUid, after)
  return diagrams === doc.diagrams ? doc : { ...doc, diagrams }
}

// Show exactly these diagrams.
export function showDiagrams (doc, uids) {
  return doc.diagrams.reduce((d, x) => updateDiagram(d, x._uid, { visible: uids.includes(x._uid) }), doc)
}

// ---- moments ----

// A moment's ID is a column of the values table, so it can't be empty, one of that
// table's own columns, or another moment's.
export function momentIdAllowed (doc, uid, id) {
  return id !== '' && !VALUE_KEYS.includes(id.toLowerCase()) && !id.startsWith('_') && id.toLowerCase() !== 'name' && !doc.moments.some(m => m._uid !== uid && m.id === id)
}

// The name of a moment after the last: one more step of the same size for years.
export function nextMoment (doc) {
  const n = doc.moments.map(m => toNumber(m.id)).filter(isFiniteNumber)
  const ids = doc.moments.map(m => m.id)
  if (n.length === doc.moments.length && n.length) {
    const step = n.length > 1 ? n[n.length - 1] - n[n.length - 2] : 5
    let id = n[n.length - 1] + (step || 5)
    while (ids.includes(String(id))) id += step || 5
    return String(id)
  }
  return doc.moments.length ? uniqueId(ids, 'moment') : '2030'
}

// Whether another moment already goes by this name.
export function momentNameTaken (doc, uid, name) {
  const n = String(name).trim().toLowerCase()
  return doc.moments.some(m => m._uid !== uid && [m.id, m.title].some(x => String(x ?? '').trim().toLowerCase() === n))
}

// Adds a moment beside another one, starting from the values of the one before it.
// Between two years it gets a year in between.
export function insertMoment (doc, targetUid, after) {
  const at = doc.moments.findIndex(m => m._uid === targetUid) + (after ? 1 : 0)
  if (!doc.moments.some(m => m._uid === targetUid) || at >= doc.moments.length) return addMoment(doc)
  const ids = doc.moments.map(m => m.id)
  const prev = doc.moments[at - 1]
  const next = doc.moments[at]
  const b = toNumber(next.id)
  const a = prev ? toNumber(prev.id) : b - ((toNumber((doc.moments[1] || {}).id) - b) || 5) * 2
  const middle = isFiniteNumber(a) && isFiniteNumber(b) ? String(Math.round((a + b) / 2)) : ''
  const id = middle && !ids.includes(middle) ? middle : uniqueId(ids, 'moment')
  const from = prev || next
  const moment = { title: id, visible: true, id, _uid: newUid('m') }
  return {
    ...doc,
    moments: [...doc.moments.slice(0, at), moment, ...doc.moments.slice(at)],
    values: doc.values.map(v => (v[from.id] === undefined || v[from.id] === '' ? v : { ...v, [id]: v[from.id] }))
  }
}

// Adds a moment at the end, starting from the values of the last one.
export function addMoment (doc, row = {}) {
  const id = row.id || nextMoment(doc)
  const last = doc.moments[doc.moments.length - 1]
  const moments = [...doc.moments, { title: id, visible: true, ...row, id, _uid: row._uid || newUid('m') }]
  const values = last && row.copy !== false ? doc.values.map(v => (v[last.id] === undefined || v[last.id] === '' ? v : { ...v, [id]: v[last.id] })) : doc.values
  return { ...doc, moments, values }
}

// Renaming a moment's ID moves its column of values along.
export function updateMoment (doc, uid, patch) {
  const clean = { ...patch }
  if ('id' in clean) {
    clean.id = String(clean.id).trim()
    if (!momentIdAllowed(doc, uid, clean.id)) delete clean.id
  }
  const { doc: next, before, after } = updateRow(doc, 'moments', uid, clean)
  if (!before || before.id === after.id) return next
  return {
    ...next,
    meta: { ...next.meta, valueColumns: next.meta.valueColumns.map(c => (c === before.id ? after.id : c)) },
    values: next.values.map(v => {
      if (!(before.id in v)) return v
      const { [before.id]: value, ...rest } = v
      return { ...rest, [after.id]: value }
    })
  }
}

// What people mean by renaming a year: its name, and its column when they were the same.
export function renameMoment (doc, uid, title) {
  const m = doc.moments.find(x => x._uid === uid)
  const name = String(title).trim()
  if (!m || !name || momentNameTaken(doc, uid, name)) return doc
  const patch = { title: name }
  if ((m.title || m.id) === m.id && momentIdAllowed(doc, uid, name)) patch.id = name
  return updateMoment(doc, uid, patch)
}

export function moveMoment (doc, uid, targetUid, after) {
  const moments = moveRow(doc.moments, uid, targetUid, after)
  return moments === doc.moments ? doc : { ...doc, moments }
}

// ---- carriers ----

export const nextColor = (doc, ...names) => nextStandardColor(doc.carriers.map(c => c.color), ...names)

export function addCarrier (doc, row) {
  const c = { icon: '', ...row, _uid: row._uid || newUid('c') }
  if (!c.color) c.color = nextColor(doc, c.id, c.title)
  return { ...doc, carriers: [...doc.carriers, c] }
}

export function updateCarrier (doc, uid, patch) {
  const { doc: next, before, after } = updateRow(doc, 'carriers', uid, patch)
  if (!before || before.id === after.id || before.id === '') return next
  return { ...next, values: next.values.map(v => (v.carrier === before.id ? { ...v, carrier: after.id } : v)) }
}

export function moveCarrier (doc, uid, targetUid, after) {
  const carriers = moveRow(doc.carriers, uid, targetUid, after)
  return carriers === doc.carriers ? doc : { ...doc, carriers }
}

// One step earlier (-1) or later (1) among the rows drawn (`uids`, in drawing order).
export function stepRow (doc, kind, uid, dir, uids) {
  const target = uids[uids.indexOf(uid) + dir]
  if (!uids.includes(uid) || !target) return doc
  return { carriers: moveCarrier, moments: moveMoment, diagrams: moveDiagram }[kind](doc, uid, target, dir > 0)
}

// ---- values ----

const cell = (doc, clean) => { doc.moments.forEach(m => { if (m.id in clean) clean[m.id] = toNumber(clean[m.id]) }) }

export function addValue (doc, row) {
  const v = { ...row, _uid: row._uid || newUid('v') }
  cell(doc, v)
  return { ...doc, values: [...doc.values, v] }
}

export function updateValue (doc, uid, patch) {
  const i = doc.values.findIndex(v => v._uid === uid)
  if (i < 0) return doc
  const clean = { ...patch }
  cell(doc, clean)
  ;['diagram', 'carrier'].forEach(k => { if (k in clean) clean[k] = String(clean[k] ?? '').trim() })
  const after = patchRow(doc.values[i], clean)
  return after === doc.values[i] ? doc : { ...doc, values: replaceAt(doc.values, i, after) }
}

const round = v => Math.round(v * 1e9) / 1e9

// Set what one carrier amounts to in one diagram at one moment. Adds the row when there
// is none; when several rows make up the amount, the first one takes the difference.
export function setAmount (doc, diagramId, carrierId, momentId, amount) {
  const rows = doc.values.filter(v => v.diagram === diagramId && v.carrier === carrierId)
  if (!rows.length) return addValue(doc, { diagram: diagramId, carrier: carrierId, ...Object.fromEntries(doc.moments.map(m => [m.id, 0])), [momentId]: round(amount) })
  const others = rows.slice(1).reduce((s, v) => s + (isFiniteNumber(v[momentId]) ? v[momentId] : 0), 0)
  return updateValue(doc, rows[0]._uid, { [momentId]: round(amount - others) })
}

export function amountOf (doc, diagramId, carrierId, momentId) {
  return doc.values.filter(v => v.diagram === diagramId && v.carrier === carrierId).reduce((s, v) => s + (isFiniteNumber(v[momentId]) ? v[momentId] : 0), 0)
}

// Set a step: the second moment becomes the first plus the change.
export function setChange (doc, diagramId, carrierId, fromId, toId, change) {
  return setAmount(doc, diagramId, carrierId, toId, amountOf(doc, diagramId, carrierId, fromId) + change)
}

// ---- deletes and settings ----

// Deleting a diagram or carrier deletes its values; deleting a moment its column.
export function deleteItems (doc, { diagrams = [], moments = [], carriers = [], values = [] }) {
  const gone = key => new Set(doc[key].filter(x => ({ diagrams, moments, carriers }[key]).includes(x._uid)).map(x => x.id))
  const d = gone('diagrams')
  const c = gone('carriers')
  const m = gone('moments')
  const v = new Set(values)
  const next = {
    diagrams: doc.diagrams.filter(x => !diagrams.includes(x._uid)),
    moments: doc.moments.filter(x => !moments.includes(x._uid)),
    carriers: doc.carriers.filter(x => !carriers.includes(x._uid)),
    values: doc.values.filter(x => !v.has(x._uid) && !d.has(x.diagram) && !c.has(x.carrier))
  }
  if (Object.keys(next).every(k => next[k].length === doc[k].length)) return doc
  if (m.size) {
    next.values = next.values.map(x => Object.fromEntries(Object.entries(x).filter(([k]) => !m.has(k))))
    next.meta = { ...doc.meta, valueColumns: doc.meta.valueColumns.filter(c => !m.has(c)) }
  }
  return { ...doc, ...next }
}

const META = { diagrams: 'diagramColumns', moments: 'momentColumns', carriers: 'carrierColumns', values: 'valueColumns' }

// Removes a column of a table that isn't one of its standard columns.
export function deleteColumn (doc, kind, key) {
  return {
    ...doc,
    [kind]: doc[kind].map(r => { if (!(key in r)) return r; const { [key]: gone, ...rest } = r; return rest }),
    meta: { ...doc.meta, [META[kind]]: doc.meta[META[kind]].filter(c => c !== key) }
  }
}

export function setSetting (doc, key, value) {
  if (doc.settings[key] === value) return doc
  return { ...doc, settings: { ...doc.settings, [key]: value } }
}

const UPDATERS = { diagrams: updateDiagram, moments: updateMoment, carriers: updateCarrier, values: updateValue }

export function applyRowEdits (doc, kind, edits = [], newRows = []) {
  let next = doc
  edits.forEach(({ uid, patch }) => { next = UPDATERS[kind](next, uid, patch) })
  newRows.forEach(row => {
    if (kind === 'values') next = addValue(next, { diagram: (next.diagrams[0] || {}).id || '', ...row })
    else if (kind === 'diagrams') next = addDiagram(next, { ...row, id: row.id || uniqueId(next.diagrams.map(x => x.id), row.title || 'diagram') })
    else if (kind === 'moments') next = addMoment(next, { ...row, copy: false, id: row.id ? String(row.id) : row.title || undefined })
    else next = addCarrier(next, { ...row, id: row.id || uniqueId(next.carriers.map(x => x.id), row.title || 'carrier') })
  })
  return next
}

// Values whose diagram or carrier has no row (kept, but not drawn) get one.
export function addMissing (doc) {
  let next = doc
  const ids = key => [...new Set(doc.values.map(v => v[key]).filter(Boolean))]
  const known = key => new Set(doc[key].map(x => x.id))
  ids('diagram').filter(id => !known('diagrams').has(id)).forEach(id => { next = addDiagram(next, { id, title: id }) })
  ids('carrier').filter(id => !known('carriers').has(id)).forEach(id => { next = addCarrier(next, { id, title: id }) })
  return next
}
