// Pure document edits. Each function takes a document and returns a new one (or the
// same object when nothing changed). The store wraps them for undo.

import { nextStandardColor } from '../../../shared/src/standardPalette.js'
import { newUid, toNumber, parseBoolean } from '../../../shared/src/values.js'

const replaceAt = (arr, i, item) => arr.map((x, j) => (j === i ? item : x))

function patchRow (row, patch) {
  let changed = false
  const next = { ...row }
  Object.entries(patch).forEach(([k, v]) => { if (next[k] !== v) { next[k] = v; changed = true } })
  return changed ? next : row
}

export function uniqueId (existing, base) {
  const clean = String(base || 'block').trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '') || 'block'
  const taken = new Set(existing)
  if (!taken.has(clean)) return clean
  let i = 2
  while (taken.has(`${clean}_${i}`)) i += 1
  return `${clean}_${i}`
}

// ---- blocks ----

// group: undefined puts the block in the last block's group.
export function addBlock (doc, row) {
  const last = doc.blocks[doc.blocks.length - 1]
  const b = { group: last ? last.group || '' : '', icon: '', visible: true, ...row, _uid: row._uid || newUid('b') }
  return { ...doc, blocks: [...doc.blocks, b] }
}

export function updateBlock (doc, uid, patch) {
  const i = doc.blocks.findIndex(b => b._uid === uid)
  if (i < 0) return doc
  const before = doc.blocks[i]
  const clean = { ...patch }
  if ('id' in clean) clean.id = String(clean.id).trim()
  if ('group' in clean) clean.group = String(clean.group ?? '').trim()
  if ('visible' in clean && typeof clean.visible !== 'boolean') clean.visible = clean.visible === '' ? '' : parseBoolean(clean.visible)
  const after = patchRow(before, clean)
  if (after === before) return doc
  const values = 'id' in clean && clean.id !== before.id && before.id !== ''
    ? doc.values.map(v => (v.block === before.id ? { ...v, block: clean.id } : v))
    : doc.values
  return { ...doc, blocks: replaceAt(doc.blocks, i, after), values }
}

function moveRow (rows, uid, targetUid, after) {
  const row = rows.find(r => r._uid === uid)
  if (!row || uid === targetUid || !rows.some(r => r._uid === targetUid)) return rows
  const rest = rows.filter(r => r !== row)
  const at = rest.findIndex(r => r._uid === targetUid) + (after ? 1 : 0)
  const next = [...rest.slice(0, at), row, ...rest.slice(at)]
  return next.every((r, i) => r === rows[i]) ? rows : next
}

// Put a block before or after another one, in that one's group.
export function moveBlock (doc, uid, targetUid, after) {
  const target = doc.blocks.find(b => b._uid === targetUid)
  if (!target) return doc
  const blocks = moveRow(doc.blocks, uid, targetUid, after)
  const moved = blocks === doc.blocks ? doc : { ...doc, blocks }
  return updateBlock(moved, uid, { group: target.group || '' })
}

export function moveCarrier (doc, uid, targetUid, after) {
  const carriers = moveRow(doc.carriers, uid, targetUid, after)
  return carriers === doc.carriers ? doc : { ...doc, carriers }
}

// One step earlier (-1) or later (1) among the rows drawn (`uids`, in drawing order).
export function stepRow (doc, kind, uid, dir, uids) {
  const i = uids.indexOf(uid)
  const target = uids[i + dir]
  if (i < 0 || !target) return doc
  return kind === 'blocks' ? moveBlock(doc, uid, target, dir > 0) : moveCarrier(doc, uid, target, dir > 0)
}

export function renameGroup (doc, from, to) {
  const name = String(to).trim()
  if (name === from || !doc.blocks.some(b => (b.group || '') === from)) return doc
  return { ...doc, blocks: doc.blocks.map(b => ((b.group || '') === from ? { ...b, group: name } : b)) }
}

// ---- values ----

export function addValue (doc, row) {
  const v = { value: 0, ...row, _uid: row._uid || newUid('v') }
  v.value = toNumber(v.value)
  return { ...doc, values: [...doc.values, v] }
}

export function updateValue (doc, uid, patch) {
  const i = doc.values.findIndex(v => v._uid === uid)
  if (i < 0) return doc
  const clean = { ...patch }
  if ('value' in clean) clean.value = toNumber(clean.value)
  ;['block', 'carrier'].forEach(k => { if (k in clean) clean[k] = String(clean[k] ?? '').trim() })
  const after = patchRow(doc.values[i], clean)
  return after === doc.values[i] ? doc : { ...doc, values: replaceAt(doc.values, i, after) }
}

// ---- carriers ----

export function addCarrier (doc, row) {
  const c = { icon: '', ...row, _uid: row._uid || newUid('c') }
  if (!c.color) c.color = nextColor(doc, c.id, c.title)
  return { ...doc, carriers: [...doc.carriers, c] }
}

export const nextColor = (doc, ...names) => nextStandardColor(doc.carriers.map(c => c.color), ...names)

export function updateCarrier (doc, uid, patch) {
  const i = doc.carriers.findIndex(c => c._uid === uid)
  if (i < 0) return doc
  const before = doc.carriers[i]
  const clean = { ...patch }
  if ('id' in clean) clean.id = String(clean.id).trim()
  const after = patchRow(before, clean)
  if (after === before) return doc
  const values = 'id' in clean && clean.id !== before.id && before.id !== ''
    ? doc.values.map(v => (v.carrier === before.id ? { ...v, carrier: clean.id } : v))
    : doc.values
  return { ...doc, carriers: replaceAt(doc.carriers, i, after), values }
}

// ---- deletes and settings ----

// Deleting a block or carrier deletes its values.
export function deleteItems (doc, { blocks = [], values = [], carriers = [] }) {
  const b = new Set(blocks)
  const v = new Set(values)
  const c = new Set(carriers)
  const blockIds = new Set(doc.blocks.filter(x => b.has(x._uid)).map(x => x.id))
  const carrierIds = new Set(doc.carriers.filter(x => c.has(x._uid)).map(x => x.id))
  const next = {
    blocks: doc.blocks.filter(x => !b.has(x._uid)),
    carriers: doc.carriers.filter(x => !c.has(x._uid)),
    values: doc.values.filter(x => !v.has(x._uid) && !blockIds.has(x.block) && !carrierIds.has(x.carrier))
  }
  if (Object.keys(next).every(k => next[k].length === doc[k].length)) return doc
  return { ...doc, ...next }
}

export function setSetting (doc, key, value) {
  if (doc.settings[key] === value) return doc
  return { ...doc, settings: { ...doc.settings, [key]: value } }
}

const UPDATERS = { blocks: updateBlock, values: updateValue, carriers: updateCarrier }

export function applyRowEdits (doc, kind, edits = [], newRows = []) {
  let next = doc
  edits.forEach(({ uid, patch }) => { next = UPDATERS[kind](next, uid, patch) })
  newRows.forEach(row => {
    if (kind === 'values') next = addValue(next, row)
    else if (kind === 'blocks') next = addBlock(next, { ...row, id: row.id || uniqueId(next.blocks.map(x => x.id), row.title || 'block') })
    else next = addCarrier(next, { ...row, id: row.id || uniqueId(next.carriers.map(x => x.id), row.title || 'carrier') })
  })
  return next
}

// Values whose block or carrier has no row (kept, but not drawn) get one.
export function addMissing (doc) {
  let next = doc
  const ids = key => [...new Set(doc.values.map(v => v[key]).filter(Boolean))]
  const blocks = new Set(doc.blocks.map(b => b.id))
  const carriers = new Set(doc.carriers.map(c => c.id))
  ids('block').filter(id => !blocks.has(id)).forEach(id => { next = addBlock(next, { id, title: id }) })
  ids('carrier').filter(id => !carriers.has(id)).forEach(id => { next = addCarrier(next, { id, title: id }) })
  return next
}
