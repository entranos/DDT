// Makes a chord diagram from a sankey diagram, or from a plain table: a list of flows with
// their source and target, or a matrix with the same names along both sides.

import { getSetting as sankeySetting } from '../../../sankey/src/model/schema.js'
import { normalizeDocument, isFiniteNumber, toNumber, reservedColumn } from '../model/schema.js'
import { untangle } from '../model/chords.js'

const text = v => String(v ?? '').trim()
const blank = v => text(v) === ''
const given = row => Object.fromEntries(Object.entries(row).filter(([, v]) => !blank(v)))

// A leading "." or "_" in a sankey title only says how to draw its label.
const clean = node => text(node.title || node.id).replace(/^[._]+/, '').trim() || node.id

const ROLES = ['Supply', 'Conversion', 'Use']

// Nodes are grouped by whether flows only leave them, pass through, or only arrive.
export function chordFromSankey (sankey) {
  const flows = sankey.links.filter(l => isFiniteNumber(l.value) && l.value > 0 && l.source && l.target)
  const gives = new Set(flows.map(l => l.source))
  const takes = new Set(flows.map(l => l.target))
  const role = id => (!takes.has(id) ? 0 : gives.has(id) ? 1 : 2)
  const ids = [...new Set([...sankey.nodes.map(n => n.id), ...flows.flatMap(l => [l.source, l.target])])].filter(id => gives.has(id) || takes.has(id))
  const links = flows.map(l => ({ source: l.source, target: l.target, value: l.value }))
  const used = [0, 1, 2].filter(r => ids.some(id => role(id) === r))
  const arranged = untangle(used.map(r => ids.filter(id => role(id) === r)), links)
  const row = new Map(sankey.nodes.map(n => [n.id, n]))
  const { doc } = normalizeDocument({
    flows: flows.map(l => ({ source: l.source, target: l.target, carrier: l.carrier || '', value: l.value, ...given({ note: l.annotate, icon: l.icon, pattern: l.pattern, patterncolor: l.patterncolor }) })),
    nodes: arranged.flatMap((list, i) => list.map(id => ({ id, title: clean(row.get(id) || { id }), group: used.length > 1 ? ROLES[used[i]] : '' }))),
    groups: used.length > 1 ? used.map(r => ({ id: ROLES[r], title: ROLES[r], color: '' })) : [],
    carriers: sankey.carriers.map(c => ({ id: c.id, title: c.name || c.title || c.id, color: c.color, ...given({ icon: c.icon, pattern: c.pattern, patterncolor: c.patterncolor }) })),
    scenarios: [{ id: 'value', title: 'Value' }],
    settings: [
      { setting: 'title', waarde: sankeySetting(sankey, 'title') || '' },
      { setting: 'unit', waarde: sankeySetting(sankey, 'unit') || '' },
      { setting: 'multiply', waarde: sankeySetting(sankey, 'scaleDataValue') || 1 },
      { setting: 'ribbonOrder', waarde: 'untangled' }
    ]
  })
  return doc
}

const NAMES = { source: ['source', 'from', 'van', 'bron', 'source.id'], target: ['target', 'to', 'naar', 'doel', 'target.id'], carrier: ['carrier', 'energiedrager', 'drager', 'legend', 'type'] }

// rows: arrays of cells, the first filled one with the column names. Returns a document or null.
export function chordFromTable (rows) {
  const filled = rows.filter(r => r && r.some(c => !blank(c)))
  for (let head = 0; head < Math.min(filled.length - 1, 12); head++) {
    const names = filled[head].map(text)
    const body = filled.slice(head + 1)
    const find = key => names.findIndex(n => NAMES[key].includes(n.toLowerCase()))
    const s = find('source')
    const t = find('target')
    const numeric = i => body.some(r => isFiniteNumber(toNumber(r[i])))
    if (s >= 0 && t >= 0) {
      const c = find('carrier')
      const cols = names.map((n, i) => i).filter(i => ![s, t, c].includes(i) && names[i] && numeric(i) && !reservedColumn(names[i]))
      if (!cols.length) continue
      const flows = body.filter(r => !blank(r[s]) && !blank(r[t])).map(r => ({ source: text(r[s]), target: text(r[t]), carrier: c >= 0 ? text(r[c]) : '', ...Object.fromEntries(cols.filter(i => isFiniteNumber(toNumber(r[i]))).map(i => [names[i], toNumber(r[i])])) }))
      return finish(flows, cols.map(i => names[i]), c >= 0)
    }
    // A matrix: what leaves the node of a row for the node of a column.
    const across = names.slice(1).filter(Boolean)
    const down = body.map(r => text(r[0])).filter(Boolean)
    if (across.length >= 2 && down.filter(n => across.includes(n)).length >= Math.max(2, Math.min(across.length, down.length) * 0.6)) {
      const flows = body.flatMap(r => names.map((n, i) => ({ n, i })).slice(1).filter(x => x.n && isFiniteNumber(toNumber(r[x.i])) && toNumber(r[x.i]) > 0 && !blank(r[0])).map(x => ({ source: text(r[0]), target: x.n, carrier: '', value: toNumber(r[x.i]) })))
      return finish(flows, ['value'], false)
    }
  }
  return null
}

function finish (flows, columns, hasCarrier) {
  if (!flows.length) return null
  const ids = [...new Set(flows.flatMap(f => [f.source, f.target]))]
  const links = flows.map(f => ({ source: f.source, target: f.target, value: columns.reduce((t, c) => t + (f[c] > 0 ? f[c] : 0), 0) }))
  const nodes = untangle([ids], links)[0].map(id => ({ id, title: id }))
  // Without carriers a flow takes the colour of the node it leaves.
  const raw = hasCarrier ? flows : flows.map(f => ({ ...f, carrier: f.source }))
  return normalizeDocument({ flows: raw, nodes, scenarios: columns.map(id => ({ id, title: id === 'value' ? 'Value' : id })), settings: [{ setting: 'scaleMode', waarde: 'largest' }], columns: { flows: ['source', 'target', 'carrier', ...columns] } }).doc
}
