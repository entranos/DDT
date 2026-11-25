// Pure document edits. Each function takes a document and returns a new one (or the
// same object when nothing changed). The store wraps them for undo.

import { nextStandardColor } from '../../../shared/src/standardPalette.js'
import { newUid, toNumber, isFiniteNumber, parseBoolean } from '../../../shared/src/values.js'
import { META, reservedColumn, scenarioIds, shownScenario } from './schema.js'

const replaceAt = (arr, i, item) => arr.map((x, j) => (j === i ? item : x))
const trim = v => String(v ?? '').trim()
const round = v => Math.round(v * 1e9) / 1e9

function patchRow (row, patch) {
  let changed = false
  const next = { ...row }
  Object.entries(patch).forEach(([k, v]) => { if (next[k] !== v) { next[k] = v; changed = true } })
  return changed ? next : row
}

export function uniqueId (existing, base) {
  const taken = new Set(existing)
  if (!taken.has(base)) return base
  let i = 2
  while (taken.has(`${base}_${i}`)) i += 1
  return `${base}_${i}`
}

// "Group 3": the first free number after a name.
export function uniqueName (existing, base) {
  const taken = new Set(existing.map(x => trim(x).toLowerCase()))
  if (!taken.has(base.toLowerCase())) return base
  let i = 2
  while (taken.has(`${base} ${i}`.toLowerCase())) i += 1
  return `${base} ${i}`
}

const flag = v => (typeof v === 'boolean' ? v : v === '' ? '' : parseBoolean(v))

function clean (doc, patch) {
  const out = { ...patch }
  scenarioIds(doc).forEach(id => { if (id in out) out[id] = isFiniteNumber(toNumber(out[id])) ? round(toNumber(out[id])) : out[id] })
  ;['visible', 'label'].forEach(k => { if (k in out) out[k] = flag(out[k]) })
  ;['labelx', 'labely'].forEach(k => { if (k in out && trim(out[k]) !== '') out[k] = toNumber(out[k]) })
  return out
}

function update (doc, kind, uid, patch) {
  const i = doc[kind].findIndex(r => r._uid === uid)
  if (i < 0) return doc
  const after = patchRow(doc[kind][i], patch)
  return after === doc[kind][i] ? doc : { ...doc, [kind]: replaceAt(doc[kind], i, after) }
}

function moveRow (rows, uid, targetUid, after) {
  const row = rows.find(r => r._uid === uid)
  if (!row || uid === targetUid || !rows.some(r => r._uid === targetUid)) return rows
  const rest = rows.filter(r => r !== row)
  const at = rest.findIndex(r => r._uid === targetUid) + (after ? 1 : 0)
  const next = [...rest.slice(0, at), row, ...rest.slice(at)]
  return next.every((r, i) => r === rows[i]) ? rows : next
}

// Renames an ID wherever other rows refer to it. refs: [[table, column], …]
function renameRefs (doc, refs, from, to) {
  return refs.reduce((d, [kind, key]) => (d[kind].some(r => r[key] === from) ? { ...d, [kind]: d[kind].map(r => (r[key] === from ? { ...r, [key]: to } : r)) } : d), doc)
}

function updateWithId (doc, kind, uid, patch, refs) {
  const before = doc[kind].find(r => r._uid === uid)
  if (!before) return doc
  const out = { ...patch }
  if ('id' in out) {
    out.id = trim(out.id)
    if (!out.id || doc[kind].some(r => r._uid !== uid && r.id === out.id)) delete out.id
  }
  const next = update(doc, kind, uid, out)
  return next !== doc && out.id !== undefined && out.id !== before.id ? renameRefs(next, refs, before.id, out.id) : next
}

// ---- flows ----

export function addFlow (doc, row = {}) {
  const f = { source: '', target: '', carrier: '', ...row, _uid: row._uid || newUid('f') }
  return { ...doc, flows: [...doc.flows, { ...f, ...clean(doc, f) }] }
}

export const updateFlow = (doc, uid, patch) => {
  const out = clean(doc, patch)
  ;['source', 'target', 'carrier', 'part'].forEach(k => { if (k in out) out[k] = trim(out[k]) })
  return update(doc, 'flows', uid, out)
}

// The amount of a ribbon in one scenario; several rows change in proportion.
export function setAmount (doc, uids, scenarioId, amount) {
  const rows = doc.flows.filter(f => uids.includes(f._uid))
  if (!rows.length) return doc
  if (rows.length === 1) return updateFlow(doc, rows[0]._uid, { [scenarioId]: amount })
  const total = rows.reduce((s, r) => s + (isFiniteNumber(r[scenarioId]) ? r[scenarioId] : 0), 0)
  return rows.reduce((d, r, i) => updateFlow(d, r._uid, { [scenarioId]: total > 0 ? (isFiniteNumber(r[scenarioId]) ? r[scenarioId] : 0) * amount / total : i === 0 ? amount : 0 }), doc)
}

// ---- nodes and groups ----

export function addNode (doc, row = {}) {
  const last = doc.nodes[doc.nodes.length - 1]
  const n = { title: uniqueName(doc.nodes.map(x => x.title), 'New node'), group: last ? last.group || '' : '', ...row, _uid: row._uid || newUid('n') }
  if (!n.id) n.id = uniqueId(doc.nodes.map(x => x.id), trim(n.title).toLowerCase().replace(/\s+/g, '_') || 'node')
  return withGroup({ ...doc, nodes: [...doc.nodes, n] }, n.group)
}

// A group that nodes refer to exists in the groups table.
function withGroup (doc, id) {
  return !id || doc.groups.some(g => g.id === id) ? doc : { ...doc, groups: [...doc.groups, { _uid: newUid('g'), id, title: id, color: '' }] }
}

export function updateNode (doc, uid, patch) {
  const out = clean(doc, patch)
  if ('group' in out) out.group = trim(out.group)
  const next = updateWithId(doc, 'nodes', uid, out, [['flows', 'source'], ['flows', 'target'], ['details', 'node']])
  return out.group ? withGroup(next, out.group) : next
}

// Put a node before or after another one, in that one's group.
export function moveNode (doc, uid, targetUid, after) {
  const target = doc.nodes.find(n => n._uid === targetUid)
  if (!target) return doc
  const nodes = moveRow(doc.nodes, uid, targetUid, after)
  return updateNode(nodes === doc.nodes ? doc : { ...doc, nodes }, uid, { group: target.group || '' })
}

export const orderNodes = (doc, uids) => {
  const at = new Map(uids.map((u, i) => [u, i]))
  const nodes = [...doc.nodes].sort((a, b) => (at.get(a._uid) ?? 1e9) - (at.get(b._uid) ?? 1e9))
  return nodes.every((n, i) => n === doc.nodes[i]) ? doc : { ...doc, nodes }
}
export const orderGroups = (doc, uids) => {
  const at = new Map(uids.map((u, i) => [u, i]))
  const groups = [...doc.groups].sort((a, b) => (at.get(a._uid) ?? 1e9) - (at.get(b._uid) ?? 1e9))
  return groups.every((g, i) => g === doc.groups[i]) ? doc : { ...doc, groups }
}

export function addGroup (doc, row = {}) {
  const title = row.title || row.id || uniqueName(doc.groups.flatMap(g => [g.id, g.title || '']), 'Group')
  return { ...doc, groups: [...doc.groups, { id: title, title, color: '', ...row, _uid: row._uid || newUid('g') }] }
}
export const updateGroup = (doc, uid, patch) => updateWithId(doc, 'groups', uid, patch, [['nodes', 'group']])
export function moveGroup (doc, uid, targetUid, after) {
  const groups = moveRow(doc.groups, uid, targetUid, after)
  return groups === doc.groups ? doc : { ...doc, groups }
}

// ---- carriers ----

export const nextColor = (doc, ...names) => nextStandardColor(doc.carriers.map(c => c.color), ...names)
export function addCarrier (doc, row = {}) {
  const c = { title: uniqueName(doc.carriers.map(x => x.title || x.id), 'New carrier'), icon: '', ...row, _uid: row._uid || newUid('c') }
  if (!c.id) c.id = uniqueId(doc.carriers.map(x => x.id), trim(c.title).toLowerCase().replace(/\s+/g, '_') || 'carrier')
  if (!c.color) c.color = nextColor(doc, c.id, c.title)
  return { ...doc, carriers: [...doc.carriers, c] }
}
export const updateCarrier = (doc, uid, patch) => updateWithId(doc, 'carriers', uid, clean(doc, patch), [['flows', 'carrier']])
export function moveCarrier (doc, uid, targetUid, after) {
  const carriers = moveRow(doc.carriers, uid, targetUid, after)
  return carriers === doc.carriers ? doc : { ...doc, carriers }
}

// ---- scenarios: the columns of amounts ----

export const scenarioIdAllowed = (doc, uid, id) => id !== '' && !reservedColumn(id) && !doc.scenarios.some(s => s._uid !== uid && s.id === id)

export function scenarioNameTaken (doc, uid, name) {
  const n = trim(name).toLowerCase()
  return doc.scenarios.some(s => s._uid !== uid && [s.id, s.title].some(x => trim(x).toLowerCase() === n))
}

const isYear = s => /^(19|20|21)\d\d$/.test(trim(s))

// The next one after the last: five years on when they are years.
function nextScenarioName (doc) {
  const names = doc.scenarios.map(s => trim(s.title || s.id))
  const last = names[names.length - 1]
  if (last && isYear(last)) {
    const prev = names.length > 1 && isYear(names[names.length - 2]) ? Number(last) - Number(names[names.length - 2]) : 5
    const next = String(Number(last) + (prev > 0 ? prev : 5))
    if (!names.includes(next)) return next
  }
  return uniqueName(doc.scenarios.flatMap(s => [s.id, s.title || '']), 'Scenario')
}

// A new scenario starts with the amounts of the one beside it (or the last).
export function addScenario (doc, { near = null, after = true, ...row } = {}) {
  const at = near ? doc.scenarios.findIndex(s => s._uid === near) : -1
  const from = at >= 0 ? doc.scenarios[at] : doc.scenarios[doc.scenarios.length - 1]
  const name = row.title || row.id || (at >= 0 ? uniqueName(doc.scenarios.flatMap(s => [s.id, s.title || '']), 'Scenario') : nextScenarioName(doc))
  const s = { id: name, title: name, ...row, _uid: row._uid || newUid('s') }
  const index = at < 0 ? doc.scenarios.length : at + (after ? 1 : 0)
  const copy = rows => rows.map(r => (from && isFiniteNumber(r[from.id]) ? { ...r, [s.id]: r[from.id] } : r))
  return { ...doc, scenarios: [...doc.scenarios.slice(0, index), s, ...doc.scenarios.slice(index)], flows: copy(doc.flows), details: copy(doc.details) }
}

// Renaming a scenario's ID moves its columns of amounts along.
export function updateScenario (doc, uid, patch) {
  const before = doc.scenarios.find(s => s._uid === uid)
  if (!before) return doc
  const out = { ...patch }
  if ('id' in out) {
    out.id = trim(out.id)
    if (!scenarioIdAllowed(doc, uid, out.id)) delete out.id
  }
  const next = update(doc, 'scenarios', uid, out)
  if (next === doc || out.id === undefined || out.id === before.id) return next
  const rename = k => (k === before.id ? out.id : k)
  const move = rows => rows.map(r => (before.id in r ? Object.fromEntries(Object.entries(r).map(([k, v]) => [rename(k), v])) : r))
  return {
    ...next,
    flows: move(next.flows),
    details: move(next.details),
    settings: next.settings.scenario === before.id ? { ...next.settings, scenario: out.id } : next.settings,
    meta: { ...next.meta, flowColumns: next.meta.flowColumns.map(rename), detailColumns: next.meta.detailColumns.map(rename) }
  }
}

// What people mean by renaming a scenario: its name, and its column when they were the same.
export function renameScenario (doc, uid, title) {
  const s = doc.scenarios.find(x => x._uid === uid)
  const name = trim(title)
  if (!s || !name || scenarioNameTaken(doc, uid, name)) return doc
  const patch = { title: name }
  if ((s.title || s.id) === s.id && scenarioIdAllowed(doc, uid, name)) patch.id = name
  return updateScenario(doc, uid, patch)
}

export function moveScenario (doc, uid, targetUid, after) {
  const scenarios = moveRow(doc.scenarios, uid, targetUid, after)
  return scenarios === doc.scenarios ? doc : { ...doc, scenarios }
}

export const showScenario = (doc, id) => setSetting(doc, 'scenario', id)

// ---- details ----

export function addDetail (doc, row = {}) {
  const d = { node: '', title: '', ...row, _uid: row._uid || newUid('d') }
  return { ...doc, details: [...doc.details, { ...d, ...clean(doc, d) }] }
}
export const updateDetail = (doc, uid, patch) => update(doc, 'details', uid, clean(doc, patch))

// ---- any table ----

const UPDATE = { flows: updateFlow, nodes: updateNode, groups: updateGroup, carriers: updateCarrier, scenarios: updateScenario, details: updateDetail }
const ADD = { flows: addFlow, nodes: addNode, groups: addGroup, carriers: addCarrier, scenarios: addScenario, details: addDetail }
const MOVE = { nodes: moveNode, groups: moveGroup, carriers: moveCarrier, scenarios: moveScenario }

// One step earlier (-1) or later (1) among the rows listed (`uids`, in their order).
export function stepRow (doc, kind, uid, dir, uids) {
  const target = uids[uids.indexOf(uid) + dir]
  return !MOVE[kind] || !uids.includes(uid) || !target ? doc : MOVE[kind](doc, uid, target, dir > 0)
}

// Removes a column of a table.
export function deleteColumn (doc, kind, key) {
  return {
    ...doc,
    [kind]: doc[kind].map(r => { if (!(key in r)) return r; const { [key]: gone, ...rest } = r; return rest }),
    meta: { ...doc.meta, [META[kind]]: doc.meta[META[kind]].filter(c => c !== key) }
  }
}

// Deleting a node deletes its flows and details; a group leaves its nodes without one; a
// carrier deletes its flows; a scenario its columns (the last one stays).
export function deleteItems (doc, { flows = [], nodes = [], groups = [], carriers = [], scenarios = [], details = [] }) {
  const ids = (kind, uids) => new Set(doc[kind].filter(r => uids.includes(r._uid)).map(r => r.id))
  const n = ids('nodes', nodes)
  const c = ids('carriers', carriers)
  const g = ids('groups', groups)
  const left = doc.scenarios.filter(s => !scenarios.includes(s._uid))
  const goneScenarios = left.length ? doc.scenarios.filter(s => scenarios.includes(s._uid)) : []
  let next = {
    ...doc,
    flows: doc.flows.filter(f => !flows.includes(f._uid) && !n.has(f.source) && !n.has(f.target) && !c.has(f.carrier)),
    nodes: doc.nodes.filter(x => !nodes.includes(x._uid)).map(x => (g.has(x.group) ? { ...x, group: '' } : x)),
    groups: doc.groups.filter(x => !groups.includes(x._uid)),
    carriers: doc.carriers.filter(x => !carriers.includes(x._uid)),
    details: doc.details.filter(d => !details.includes(d._uid) && !n.has(d.node))
  }
  if (goneScenarios.length) {
    next = { ...next, scenarios: left }
    goneScenarios.forEach(s => { next = deleteColumn(deleteColumn(next, 'flows', s.id), 'details', s.id) })
    if (goneScenarios.some(s => s.id === doc.settings.scenario)) next = { ...next, settings: { ...next.settings, scenario: shownScenario(next).id } }
  }
  const same = ['flows', 'nodes', 'groups', 'carriers', 'scenarios', 'details'].every(k => next[k].length === doc[k].length)
  return same ? doc : next
}

export function setSetting (doc, key, value) {
  if (doc.settings[key] === value) return doc
  return { ...doc, settings: { ...doc.settings, [key]: value } }
}

// Columns in new flows that the table doesn't have become scenarios when they hold numbers.
function withNewScenarios (doc, rows) {
  const known = new Set(scenarioIds(doc))
  const keys = [...new Set(rows.flatMap(r => Object.keys(r)))].filter(k => !known.has(k) && !reservedColumn(k) && !doc.meta.flowColumns.includes(k))
  return keys.filter(k => rows.some(r => isFiniteNumber(toNumber(r[k])))).reduce((d, k) => ({ ...d, scenarios: [...d.scenarios, { _uid: newUid('s'), id: k, title: k }] }), doc)
}

// Nodes and carriers that new flows refer to.
function withRefs (doc, rows) {
  let next = doc
  rows.forEach(r => {
    ;[r.source, r.target].map(trim).filter(Boolean).forEach(id => { if (!next.nodes.some(n => n.id === id)) next = addNode(next, { id, title: id, group: '' }) })
    const c = trim(r.carrier)
    if (c && !next.carriers.some(x => x.id === c)) next = addCarrier(next, { id: c, title: c })
  })
  return next
}

export function applyRowEdits (doc, kind, edits = [], newRows = []) {
  let next = doc
  edits.forEach(({ uid, patch }) => { next = UPDATE[kind](next, uid, patch) })
  if (kind === 'flows' && newRows.length) next = withRefs(withNewScenarios(next, newRows), newRows)
  newRows.forEach(row => { next = ADD[kind](next, row) })
  return next
}

// Nodes and carriers that are used but not in their table.
export function addMissing (doc) {
  return withRefs(doc, doc.flows)
}
