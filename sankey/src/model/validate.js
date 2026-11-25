// Data checks behind the Issues panel. Runs after every edit.
//
// Each issue: { key, severity: 'error'|'warning'|'info', message, targets: [{kind, uid}], fix? }
// `fix` names an action the app knows how to perform (see main.js `runFix`).

import { isFiniteNumber, toNumber } from './schema.js'
import { formatNumber } from '../../../shared/src/format.js'
import { nodeTotals, unbalancedNodes } from './graph.js'
import { patternIssues } from '../../../shared/src/patterns.js'

const blank = v => v === undefined || v === null || String(v).trim() === ''
const row = i => i + 2 // spreadsheet row: row 1 is the header

export function validateDocument (doc) {
  const issues = []
  const add = (severity, key, message, targets = [], fix) => issues.push({ severity, key, message, targets, fix })

  // Nodes
  const idCount = new Map()
  doc.nodes.forEach(n => idCount.set(n.id, (idCount.get(n.id) || 0) + 1))
  const nonInteger = []
  doc.nodes.forEach((n, i) => {
    const t = [{ kind: 'node', uid: n._uid }]
    if (blank(n.id)) add('error', `node-noid-${n._uid}`, `Node on row ${row(i)} has no ID.`, t)
    else if (idCount.get(n.id) > 1) add('error', `node-dup-${n._uid}`, `Node ID "${n.id}" is used ${idCount.get(n.id)} times (row ${row(i)}). Flows can't tell these nodes apart.`, t)
    const badX = !isFiniteNumber(n.x)
    const badY = !isFiniteNumber(n.y)
    if (badX || badY) {
      add('error', `node-pos-${n._uid}`, `Node "${n.id}" (row ${row(i)}) has no valid ${badX && badY ? 'x and y' : badX ? 'x' : 'y'} position.`, t)
    } else if (!Number.isInteger(n.x) || !Number.isInteger(n.y)) {
      nonInteger.push(n)
    }
  })
  if (nonInteger.length) {
    add('warning', 'node-nonint', `${nonInteger.length} node(s) have positions with decimals (${nonInteger.slice(0, 3).map(n => `"${n.id}"`).join(', ')}${nonInteger.length > 3 ? ', …' : ''}). Other tools expect whole numbers.`,
      nonInteger.map(n => ({ kind: 'node', uid: n._uid })), { label: 'Round positions', action: 'roundPositions' })
  }

  // Flows
  const nodeIds = new Set(doc.nodes.map(n => n.id))
  const carrierIds = new Set(doc.carriers.map(c => c.id))
  const pairCount = new Map()
  doc.links.forEach((l, i) => {
    const t = [{ kind: 'link', uid: l._uid }]
    const name = `Flow on row ${row(i)}`
    const missing = ['source', 'target', 'carrier'].filter(k => blank(l[k]))
    if (missing.length) add('error', `link-missing-${l._uid}`, `${name} has no ${missing.join(', ')}.`, t)
    const unknown = ['source', 'target'].filter(k => !blank(l[k]) && !nodeIds.has(l[k]))
    if (unknown.length) add('error', `link-unknown-${l._uid}`, `${name} points to ${unknown.map(k => `${k} "${l[k]}"`).join(' and ')}, which is not a node.`, t)
    if (!blank(l.carrier) && !carrierIds.has(l.carrier)) add('warning', `link-carrier-${l._uid}`, `${name} uses carrier "${l.carrier}", which has no colour in the carriers sheet. It is drawn black.`, t)
    if (!isFiniteNumber(l.value)) add('error', `link-value-${l._uid}`, `${name} (${l.source} → ${l.target}) has no numeric value${blank(l.value) ? '' : ` ("${l.value}")`}.`, t)
    else if (l.value < 0) add('warning', `link-negative-${l._uid}`, `${name} (${l.source} → ${l.target}) has a negative value. It is drawn as zero.`, t)
    if (!blank(l.source) && l.source === l.target) add('warning', `link-self-${l._uid}`, `${name} starts and ends at "${l.source}".`, t)
    if (!blank(l.type) && l.type !== 0) {
      const key = `${l.source}\u0000${l.target}\u0000${l.type}`
      if (!pairCount.has(key)) pairCount.set(key, [])
      pairCount.get(key).push({ l, i })
    }
  })
  pairCount.forEach(list => {
    if (list.length < 2) return
    const { l } = list[0]
    add('error', `link-dup-${l._uid}`, `${list.length} flows from "${l.source}" to "${l.target}" share type "${l.type}" (rows ${list.map(x => row(x.i)).join(', ')}). Give each a different type.`,
      list.map(x => ({ kind: 'link', uid: x.l._uid })))
  })

  doc.links.forEach((l, i) => {
    if (blank(l.iconposition)) return
    const p = toNumber(l.iconposition)
    if (!isFiniteNumber(p) || p < 0 || p > 100) add('warning', `link-iconposition-${l._uid}`, `Flow on row ${row(i)}: the icon position "${l.iconposition}" is not a percentage from 0 to 100.`, [{ kind: 'link', uid: l._uid }])
  })

  // Carriers
  const carrierCount = new Map()
  doc.carriers.forEach(c => carrierCount.set(c.id, (carrierCount.get(c.id) || 0) + 1))
  doc.carriers.forEach((c, i) => {
    if (blank(c.id)) add('error', `carrier-noid-${c._uid}`, `Carrier on row ${row(i)} has no ID.`, [{ kind: 'carrier', uid: c._uid }])
    else if (carrierCount.get(c.id) > 1) add('error', `carrier-dup-${c._uid}`, `Carrier "${c.id}" is defined ${carrierCount.get(c.id)} times.`, [{ kind: 'carrier', uid: c._uid }])
  })

  // Balance
  const totals = nodeTotals(doc)
  unbalancedNodes(doc, totals).forEach(b => {
    add('warning', `balance-${b.node._uid}`,
      `"${b.node.title || b.node.id}" is out of balance by ${formatNumber(b.diff, 2)}: in ${formatNumber(b.in, 2)}, out ${formatNumber(b.out, 2)}.`,
      [{ kind: 'node', uid: b.node._uid }])
  })

  // Unused
  const usedNodes = new Set()
  doc.links.forEach(l => { usedNodes.add(l.source); usedNodes.add(l.target) })
  const unusedNodes = doc.nodes.filter(n => !usedNodes.has(n.id))
  if (unusedNodes.length) {
    add('info', 'unused-nodes', `${unusedNodes.length} node(s) have no flows: ${unusedNodes.slice(0, 4).map(n => `"${n.title || n.id}"`).join(', ')}${unusedNodes.length > 4 ? ', …' : ''}. They are left out of exports.`,
      unusedNodes.map(n => ({ kind: 'node', uid: n._uid })), { label: 'Remove them', action: 'purgeUnusedNodes' })
  }
  const usedCarriers = new Set(doc.links.map(l => l.carrier))
  const unusedCarriers = doc.carriers.filter(c => !usedCarriers.has(c.id))
  if (unusedCarriers.length) {
    add('info', 'unused-carriers', `${unusedCarriers.length} carrier(s) are not used by any flow: ${unusedCarriers.slice(0, 4).map(c => `"${c.id}"`).join(', ')}${unusedCarriers.length > 4 ? ', …' : ''}.`,
      unusedCarriers.map(c => ({ kind: 'carrier', uid: c._uid })), { label: 'Remove them', action: 'purgeUnusedCarriers' })
  }

  issues.push(...patternIssues(doc.carriers, 'carrier', c => `carrier "${c.id}"`), ...patternIssues(doc.links, 'link', l => `the flow from "${l.source}" to "${l.target}"`))
  return issues
}

const ORDER = { error: 0, warning: 1, info: 2 }
export function sortIssues (issues) {
  return [...issues].sort((a, b) => ORDER[a.severity] - ORDER[b.severity])
}
