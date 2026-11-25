// Figures derived from a document: per-node totals and balance.

import { isFiniteNumber } from './schema.js'

export const BALANCE_TOLERANCE = 1
export const BALANCE_CRITICAL = 10

export function nodeTotals (doc) {
  const totals = new Map(doc.nodes.map(n => [n.id, { in: 0, out: 0, inCount: 0, outCount: 0 }]))
  doc.links.forEach(l => {
    const v = isFiniteNumber(l.value) ? l.value : 0
    if (v === 0) return
    const s = totals.get(l.source)
    const t = totals.get(l.target)
    if (s) { s.out += v; s.outCount += 1 }
    if (t) { t.in += v; t.inCount += 1 }
  })
  return totals
}

// Nodes whose inflow and outflow differ by more than the tolerance. Sources and
// sinks (no inflow or no outflow) are unbalanced by design and skipped.
export function unbalancedNodes (doc, totals = nodeTotals(doc)) {
  const result = []
  doc.nodes.forEach(node => {
    const t = totals.get(node.id)
    if (!t || t.in === 0 || t.out === 0) return
    const diff = t.out - t.in
    if (Math.abs(diff) > BALANCE_TOLERANCE) {
      result.push({ node, in: t.in, out: t.out, diff, critical: Math.abs(diff) > BALANCE_CRITICAL })
    }
  })
  return result.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff))
}

export function flowsOf (doc, nodeId) {
  return {
    incoming: doc.links.filter(l => l.target === nodeId),
    outgoing: doc.links.filter(l => l.source === nodeId)
  }
}
