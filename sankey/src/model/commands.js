// Pure document edits. Each function takes a document and returns a new one
// (or the same object when nothing changed). The store wraps them for undo.

import { newUid, toNumber } from './schema.js'

const replaceAt = (arr, i, item) => arr.map((x, j) => (j === i ? item : x))

function patchRow (row, patch) {
  let changed = false
  const next = { ...row }
  Object.entries(patch).forEach(([k, v]) => {
    if (next[k] !== v) { next[k] = v; changed = true }
  })
  return changed ? next : row
}

export function uniqueId (existing, base) {
  const clean = String(base || 'node').trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '') || 'node'
  const taken = new Set(existing)
  if (!taken.has(clean)) return clean
  let i = 2
  while (taken.has(`${clean}_${i}`)) i += 1
  return `${clean}_${i}`
}

export function findIndex (rows, uid) {
  return rows.findIndex(r => r._uid === uid)
}

// ---- nodes ----

export function addNode (doc, node) {
  const row = { direction: 'right', labelposition: 'right', ...node, _uid: node._uid || newUid('n') }
  return { ...doc, nodes: [...doc.nodes, row] }
}

export function updateNode (doc, uid, patch) {
  const i = findIndex(doc.nodes, uid)
  if (i < 0) return doc
  const before = doc.nodes[i]
  const clean = { ...patch }
  if ('x' in clean) clean.x = toNumber(clean.x)
  if ('y' in clean) clean.y = toNumber(clean.y)
  if ('id' in clean) clean.id = String(clean.id).trim()
  const after = patchRow(before, clean)
  if (after === before) return doc
  let links = doc.links
  if ('id' in clean && clean.id !== before.id && before.id !== '') {
    // Keep flows attached when a node is renamed.
    links = links.map(l => {
      if (l.source !== before.id && l.target !== before.id) return l
      return { ...l, source: l.source === before.id ? clean.id : l.source, target: l.target === before.id ? clean.id : l.target }
    })
  }
  return { ...doc, nodes: replaceAt(doc.nodes, i, after), links }
}

export function moveNodes (doc, moves) {
  if (!moves.length) return doc
  const byUid = new Map(moves.map(m => [m.uid, m]))
  let changed = false
  const nodes = doc.nodes.map(n => {
    const m = byUid.get(n._uid)
    if (!m || (n.x === m.x && n.y === m.y)) return n
    changed = true
    return { ...n, x: m.x, y: m.y }
  })
  return changed ? { ...doc, nodes } : doc
}

// ---- links ----

export function addLink (doc, link) {
  const row = { type: 0, visibility: 1, ...link, _uid: link._uid || newUid('l') }
  if (doc.meta.linkColumns.includes('legend') && row.legend === undefined) row.legend = row.carrier
  return { ...doc, links: [...doc.links, row] }
}

export function updateLink (doc, uid, patch) {
  const i = findIndex(doc.links, uid)
  if (i < 0) return doc
  const before = doc.links[i]
  const clean = { ...patch }
  if ('value' in clean) clean.value = toNumber(clean.value)
  if ('iconposition' in clean && String(clean.iconposition ?? '').trim() !== '') clean.iconposition = toNumber(clean.iconposition)
  if ('source' in clean) clean.source = String(clean.source).trim()
  if ('target' in clean) clean.target = String(clean.target).trim()
  // Older files carry the carrier twice (carrier + legend); keep them in step.
  if ('carrier' in clean && 'legend' in before && !('legend' in clean)) clean.legend = clean.carrier
  const after = patchRow(before, clean)
  return after === before ? doc : { ...doc, links: replaceAt(doc.links, i, after) }
}

// ---- carriers ----

export function addCarrier (doc, carrier) {
  const row = { color: '#999999', ...carrier, _uid: carrier._uid || newUid('c') }
  return { ...doc, carriers: [...doc.carriers, row] }
}

export function updateCarrier (doc, uid, patch) {
  const i = findIndex(doc.carriers, uid)
  if (i < 0) return doc
  const before = doc.carriers[i]
  const clean = { ...patch }
  if ('id' in clean) clean.id = String(clean.id).trim()
  const after = patchRow(before, clean)
  if (after === before) return doc
  let links = doc.links
  if ('id' in clean && clean.id !== before.id && before.id !== '') {
    links = links.map(l => {
      if (l.carrier !== before.id && l.legend !== before.id) return l
      const next = { ...l }
      if (l.carrier === before.id) next.carrier = clean.id
      if (l.legend === before.id) next.legend = clean.id
      return next
    })
  }
  return { ...doc, carriers: replaceAt(doc.carriers, i, after), links }
}

// ---- deletes ----

export function deleteItems (doc, { nodes = [], links = [], carriers = [] }) {
  const nodeSet = new Set(nodes)
  const linkSet = new Set(links)
  const carrierSet = new Set(carriers)
  const removedIds = new Set(doc.nodes.filter(n => nodeSet.has(n._uid)).map(n => n.id))
  const nextNodes = doc.nodes.filter(n => !nodeSet.has(n._uid))
  // Deleting a node takes its flows with it.
  const nextLinks = doc.links.filter(l => !linkSet.has(l._uid) && !removedIds.has(l.source) && !removedIds.has(l.target))
  const nextCarriers = doc.carriers.filter(c => !carrierSet.has(c._uid))
  if (nextNodes.length === doc.nodes.length && nextLinks.length === doc.links.length && nextCarriers.length === doc.carriers.length) return doc
  return { ...doc, nodes: nextNodes, links: nextLinks, carriers: nextCarriers }
}

export function unusedNodeUids (doc) {
  const used = new Set()
  doc.links.forEach(l => { used.add(l.source); used.add(l.target) })
  return doc.nodes.filter(n => !used.has(n.id)).map(n => n._uid)
}

export function unusedCarrierUids (doc) {
  const used = new Set(doc.links.map(l => l.carrier))
  return doc.carriers.filter(c => !used.has(c.id)).map(c => c._uid)
}

// ---- settings ----

export function setSetting (doc, key, value) {
  if (doc.settings[key] === value) return doc
  return { ...doc, settings: { ...doc.settings, [key]: value } }
}

// ---- bulk row edits (data grid, paste) ----

const UPDATERS = { nodes: updateNode, links: updateLink, carriers: updateCarrier }
const ADDERS = { nodes: addNode, links: addLink, carriers: addCarrier }

export function applyRowEdits (doc, kind, edits = [], newRows = []) {
  let next = doc
  edits.forEach(({ uid, patch }) => { next = UPDATERS[kind](next, uid, patch) })
  newRows.forEach(row => { next = ADDERS[kind](next, row) })
  return next
}

// ---- arranging ----

export function alignNodes (doc, uids, mode) {
  const nodes = doc.nodes.filter(n => uids.includes(n._uid))
  if (nodes.length < 2) return doc
  const xs = nodes.map(n => Number(n.x) || 0)
  const ys = nodes.map(n => Number(n.y) || 0)
  const target = {
    left: { x: Math.min(...xs) },
    right: { x: Math.max(...xs) },
    top: { y: Math.min(...ys) },
    bottom: { y: Math.max(...ys) }
  }[mode]
  if (!target) return doc
  return moveNodes(doc, nodes.map(n => ({ uid: n._uid, x: target.x ?? n.x, y: target.y ?? n.y })))
}

export function distributeNodes (doc, uids, axis) {
  const nodes = doc.nodes.filter(n => uids.includes(n._uid))
  if (nodes.length < 3) return doc
  const sorted = [...nodes].sort((a, b) => (Number(a[axis]) || 0) - (Number(b[axis]) || 0))
  const first = Number(sorted[0][axis]) || 0
  const last = Number(sorted[sorted.length - 1][axis]) || 0
  const step = (last - first) / (sorted.length - 1)
  return moveNodes(doc, sorted.map((n, i) => ({
    uid: n._uid,
    x: axis === 'x' ? Math.round(first + step * i) : n.x,
    y: axis === 'y' ? Math.round(first + step * i) : n.y
  })))
}
