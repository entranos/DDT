// Runs the d3-sankey-diagram layout (vendor/, upstream 0.7.0, unmodified) on a
// document. Nodes sit at their stored x/y; link thickness = value × multiplier ×
// pixels per unit. Only the layout and link-path generator of the library are
// used; drawing happens in diagram.js.

import { lib } from '../../../shared/src/lib.js'
import { getSetting, isLeftDirection, isFiniteNumber, toNumber } from '../model/schema.js'
import { fillOf } from '../../../shared/src/patterns.js'

const blank = v => v === undefined || v === null || String(v).trim() === ''

// `positions`: optional Map uid → {x, y} used while dragging, before the move is committed.
export function computeLayout (doc, positions = null) {
  const d3 = lib.d3
  const multiplier = getSetting(doc, 'scaleDataValue')
  const pxPerUnit = getSetting(doc, 'scaleHeight')
  const co2Divisor = toNumber(doc.settings.scaleDataValueCO2flow) // legacy setting, only used when present
  const colors = new Map(doc.carriers.map(c => [c.id, c.color]))
  const carriers = new Map(doc.carriers.map(c => [c.id, c]))

  const seen = new Set()
  const nodes = []
  doc.nodes.forEach(n => {
    if (blank(n.id) || seen.has(n.id)) return
    seen.add(n.id)
    const pos = (positions && positions.get(n._uid)) || n
    nodes.push({
      id: n.id,
      uid: n._uid,
      title: n.title === undefined || n.title === null ? n.id : String(n.title),
      x: isFiniteNumber(pos.x) ? pos.x : 0,
      y: isFiniteNumber(pos.y) ? pos.y : 0,
      left: isLeftDirection(n.direction),
      labelLeft: typeof n.labelposition === 'string' && n.labelposition.trim().toLowerCase() === 'left'
    })
  })

  const pairTypes = new Map()
  doc.links.forEach(l => {
    if (blank(l.type) || l.type === 0) return
    const key = `${l.source}\u0000${l.target}\u0000${l.type}`
    pairTypes.set(key, (pairTypes.get(key) || 0) + 1)
  })

  const links = []
  doc.links.forEach(l => {
    if (!seen.has(l.source) || !seen.has(l.target)) return
    const raw = isFiniteNumber(l.value) ? Math.max(0, l.value) : 0
    const value = l.carrier === 'co2flow' && isFiniteNumber(co2Divisor) && co2Divisor > 0 ? raw / co2Divisor : raw * multiplier
    const key = `${l.source}\u0000${l.target}\u0000${l.type}`
    // Flows between the same nodes need distinct types; untyped or clashing ones get one per row.
    const type = !blank(l.type) && l.type !== 0 && pairTypes.get(key) === 1 ? String(l.type) : `auto_${l._uid}`
    links.push({
      uid: l._uid,
      source: l.source,
      target: l.target,
      type,
      value,
      carrier: l.carrier,
      color: colors.get(l.carrier) || '#000000',
      ...fillOf(l, carriers.get(l.carrier)), // pattern, mark
      annotate: l.annotate
    })
  })

  const width = getSetting(doc, 'canvasWidth')
  const height = getSetting(doc, 'canvasHeight')
  let error = null
  try {
    d3.sankey()
      // Zero width: flows leave from the same x where they arrive, which is the
      // right edge of the drawn node bar (diagram.js), so there is no gap.
      .nodeWidth(0)
      .nodePosition(d => [d.x, d.y])
      .nodeBackwards(d => d.left)
      .linkType(d => d.type)
      .scale(pxPerUnit)
      .extent([[0, 0], [width, height]])({ nodes, links })
    const path = d3.sankeyLink()
    links.forEach(l => { l.path = path(l) || '' })
  } catch (e) {
    error = e
    links.forEach(l => { l.path = '' })
  }

  nodes.forEach(n => {
    if (!isFiniteNumber(n.y0)) { n.x0 = n.x; n.y0 = n.y; n.y1 = n.y; n.value = 0 }
    n.dy = Math.max(0, n.y1 - n.y0)
  })

  return {
    nodes,
    links,
    error,
    nodeByUid: new Map(nodes.map(n => [n.uid, n])),
    nodeById: new Map(nodes.map(n => [n.id, n])),
    linkByUid: new Map(links.map(l => [l.uid, l]))
  }
}
