// Turns the document into what is drawn: groups of nodes around the circle, and a ribbon for
// every source, target and carrier in the scenario that is shown.

import { softColor } from '../../../shared/src/color.js'
import { iconOf, namedIcon } from '../../../shared/src/icons.js'
import { fillOf } from '../../../shared/src/patterns.js'
import { getSetting, isFiniteNumber, isVisible, hasLabel, carrierColor, hexColor, shownScenario } from './schema.js'

const trim = v => String(v ?? '').trim()
const NONE = { uid: null, id: '', title: '', color: '#B9B2A6', pattern: '', mark: null, icon: null }

// What an amount adds up to per scenario, of the flows that can be drawn.
function totals (doc, drawn) {
  return Object.fromEntries(doc.scenarios.map(s => [s.id, doc.flows.reduce((t, f) => t + (drawn(f) && isFiniteNumber(f[s.id]) && f[s.id] > 0 ? f[s.id] : 0), 0)]))
}

export function buildModel (doc, { scenario = shownScenario(doc) } = {}) {
  const multiply = getSetting(doc, 'multiply') || 1
  const soft = c => (getSetting(doc, 'softenColors') ? softColor(c) : c)
  const softMark = f => ({ ...f, mark: f.mark ? soft(f.mark) : null })
  const rowById = new Map(doc.nodes.filter(isVisible).filter(n => n.id).map(n => [n.id, n]))
  const known = new Set(doc.nodes.map(n => n.id))
  const carriers = new Map(doc.carriers.map(c => [c.id, { uid: c._uid, id: c.id, title: c.title || c.id, color: soft(carrierColor(doc, c)), row: c, ...softMark(fillOf(c)), icon: iconOf({ id: c.id, icon: c.icon }), visible: isVisible(c) }]))
  const shownCarrier = id => !carriers.has(id) || carriers.get(id).visible

  // Rows for the same source, target and carrier are parts of one ribbon.
  const cells = new Map()
  const unplaced = []
  const drawable = f => rowById.has(f.source) && rowById.has(f.target) && shownCarrier(f.carrier)
  doc.flows.forEach(f => {
    const raw = scenario ? f[scenario.id] : undefined
    if (!known.has(f.source) || !known.has(f.target)) { unplaced.push(f); return }
    if (!drawable(f) || !isFiniteNumber(raw) || raw <= 0) return
    const key = `${f.source}\u0000${f.target}\u0000${f.carrier || ''}`
    if (!cells.has(key)) cells.set(key, { key, source: f.source, target: f.target, carrierId: f.carrier || '', value: 0, uids: [], parts: [], pattern: '', patterncolor: '', icon: '' })
    const c = cells.get(key)
    c.value += raw * multiply
    c.uids.push(f._uid)
    if (!c.pattern) c.pattern = trim(f.pattern)
    if (!c.patterncolor) c.patterncolor = trim(f.patterncolor)
    if (!c.icon) c.icon = trim(f.icon)
    c.parts.push({ uid: f._uid, label: trim(f.part), value: raw * multiply, note: f.note })
  })

  const order = new Map(doc.carriers.map((c, i) => [c.id, i]))
  const ribbons = [...cells.values()].map(c => {
    const carrier = carriers.get(c.carrierId) || NONE
    return { ...c, carrier, carrierIndex: order.get(c.carrierId) ?? 1e6, color: carrier.color, ...softMark(fillOf(c, carrier.row)), icon: c.icon ? namedIcon(c.icon) : carrier.icon, parts: [...c.parts].sort((a, b) => b.value - a.value) }
  })

  const flowsOf = id => ribbons.filter(r => r.source === id || r.target === id)
  const makeNode = row => {
    const own = flowsOf(row.id)
    const out = own.filter(r => r.source === row.id).reduce((t, r) => t + r.value, 0)
    const into = own.filter(r => r.target === row.id).reduce((t, r) => t + r.value, 0)
    const kinds = [...new Set(own.map(r => r.carrier))]
    const only = kinds.length === 1 && kinds[0].uid ? kinds[0] : null
    return {
      uid: row._uid, id: row.id, title: row.title || row.id, group: row.group || '', labelled: hasLabel(row), note: row.note, empty: !own.length,
      dx: isFiniteNumber(row.labelx) ? row.labelx : 0, dy: isFiniteNumber(row.labely) ? row.labely : 0,
      icon: iconOf({ id: row.id, icon: row.icon }), out, into, total: out + into, amount: { larger: Math.max(out, into), sum: out + into, out, in: into }[getSetting(doc, 'nodeAmount')],
      carrier: only,
      color: hexColor(row.color) ? soft(hexColor(row.color)) : only ? only.color : getSetting(doc, 'nodeColor'),
      pattern: hexColor(row.color) || !only ? '' : only.pattern,
      mark: only ? only.mark : null,
      details: scenario ? doc.details.filter(d => d.node === row.id && isFiniteNumber(d[scenario.id]) && d[scenario.id] !== 0).map(d => ({ uid: d._uid, title: d.title, value: d[scenario.id] * multiply })) : []
    }
  }

  // Groups in the order of their table; nodes without one come where their first stands.
  const names = []
  doc.groups.forEach(g => { if (!names.includes(g.id)) names.push(g.id) })
  const loose = doc.nodes.some(n => isVisible(n) && n.id && !n.group)
  const firstLoose = doc.nodes.findIndex(n => isVisible(n) && n.id && !n.group)
  if (loose) names.splice(doc.nodes.slice(0, firstLoose).some(n => n.group) ? names.length : 0, 0, '')
  const groupRow = new Map(doc.groups.map(g => [g.id, g]))
  const groups = names.map(id => {
    const row = groupRow.get(id)
    const nodes = doc.nodes.filter(n => isVisible(n) && n.id && (n.group || '') === id).filter((n, i, all) => all.findIndex(o => o.id === n.id) === i).map(makeNode)
    const place = row && ['inside', 'outside'].includes(trim(row.place).toLowerCase()) ? trim(row.place).toLowerCase() : getSetting(doc, 'groupPlace')
    return { uid: row ? row._uid : null, id, title: row ? row.title || row.id : '', color: row && hexColor(row.color) ? hexColor(row.color) : getSetting(doc, 'groupColor'), place, nodes, total: nodes.reduce((t, n) => t + n.total, 0) }
  }).filter(g => g.nodes.length)

  const nodes = groups.flatMap(g => g.nodes)
  const nodeById = new Map(nodes.map(n => [n.id, n]))
  const sums = totals(doc, drawable)
  const used = new Set(ribbons.map(r => r.carrier.uid).filter(Boolean))
  return {
    scenario,
    multiply,
    groups,
    nodes,
    nodeById,
    nodeByUid: new Map(nodes.map(n => [n.uid, n])),
    ribbons: ribbons.filter(r => nodeById.has(r.source) && nodeById.has(r.target)),
    total: ribbons.reduce((t, r) => t + r.value, 0),
    largest: Math.max(0, ...Object.values(sums)) * multiply,
    unplaced,
    legend: doc.carriers.filter(c => used.has(c._uid)).map(c => { const k = carriers.get(c.id); return { uid: k.uid, label: k.title, icon: k.icon, color: k.color, pattern: k.pattern, mark: k.mark } }),
    ribbonByUid: new Map(ribbons.flatMap(r => r.uids.map(u => [u, r])))
  }
}

// ---- angles: clockwise from the top, in radians ----

const TAU = Math.PI * 2
const turn = a => ((a % TAU) + TAU) % TAU

// Returns { groups: [{ group, a0, a1 }], nodes: Map id → { node, a0, a1 }, ribbons: [{ ribbon, s0, s1, t0, t1 }], perUnit, full }.
export function layoutChords (model, { spacing = 'spread', groupGap = 0.12, nodeGap = 0.02, rotation = 0, full = null, order = 'untangled' } = {}) {
  const { groups, total } = model
  const size = Math.max(full || 0, total, 1e-12)
  const within = groups.reduce((n, g) => n + g.nodes.length - 1, 0)
  // With a single group there is one gap, and none at all without named groups.
  const between = groups.length > 1 ? groups.length : 1
  const gap = groups.length > 1 || (groups[0] && groups[0].id) ? groupGap : nodeGap
  const gaps = Math.min(TAU * 0.8, between * gap + within * nodeGap)
  const squeeze = gaps / Math.max(1e-12, between * gap + within * nodeGap)
  const perUnit = (TAU - gaps) / (2 * size)
  const free = TAU - gaps - total * 2 * perUnit
  const groupSpace = gap * squeeze + (spacing === 'spread' ? free / between : 0)

  const nodes = new Map()
  let a = rotation + groupSpace / 2
  const outGroups = groups.map((g, gi) => {
    if (gi) a += groupSpace
    const start = a
    g.nodes.forEach((n, ni) => {
      if (ni) a += nodeGap * squeeze
      const a1 = a + n.total * perUnit
      nodes.set(n.id, { node: n, a0: a, a1 })
      a = a1
    })
    return { group: g, a0: start, a1: a }
  })

  const mid = id => { const n = nodes.get(id); return (n.a0 + n.a1) / 2 }
  const position = new Map([...nodes.keys()].map((id, i) => [id, i]))
  const ends = new Map([...nodes.keys()].map(id => [id, []]))
  const placed = model.ribbons.map(r => ({ ribbon: r, s0: 0, s1: 0, t0: 0, t1: 0 }))
  placed.forEach(p => {
    const { source, target } = p.ribbon
    ends.get(source).push({ p, side: 's', other: target })
    ends.get(target).push({ p, side: 't', other: source })
  })
  ends.forEach((list, id) => {
    // Clockwise along the arc, partners come counter-clockwise: so ribbons don't cross here.
    const away = e => (e.other === id ? (e.side === 's' ? TAU : TAU + 1) : turn(mid(e.other) - mid(id)))
    const pair = e => e.p.ribbon.carrierIndex * 2 + (position.get(e.p.ribbon.source) < position.get(e.p.ribbon.target) ? 0 : 1)
    // Ribbons between the same two nodes keep their order at both ends.
    const lane = (x, y) => { const d = pair(x) - pair(y); return position.get(id) < position.get(x.other) ? d : -d }
    const untangled = (x, y) => away(y) - away(x) || lane(x, y)
    list.sort(order === 'size' ? (x, y) => y.p.ribbon.value - x.p.ribbon.value || untangled(x, y) : order === 'carrier' ? (x, y) => x.p.ribbon.carrierIndex - y.p.ribbon.carrierIndex || untangled(x, y) : untangled)
    let at = nodes.get(id).a0
    list.forEach(e => {
      const to = at + e.p.ribbon.value * perUnit
      e.p[`${e.side}0`] = at
      e.p[`${e.side}1`] = to
      at = to
    })
  })
  return { groups: outGroups, nodes, ribbons: placed, perUnit, full: size, overflow: !!full && total > full * 1.000001 }
}

// ---- an order with few crossings ----

// Cost of crossing ribbons for nodes in this order around the circle.
export function crossings (order, links) {
  const at = new Map(order.map((id, i) => [id, i]))
  const list = links.filter(l => l.source !== l.target && at.has(l.source) && at.has(l.target)).map(l => { const a = at.get(l.source); const b = at.get(l.target); return a < b ? [a, b, l.value] : [b, a, l.value] })
  let cost = 0
  for (let i = 0; i < list.length; i++) {
    const [a, b, v] = list[i]
    for (let j = i + 1; j < list.length; j++) {
      const [c, d, w] = list[j]
      if (a === c || a === d || b === c || b === d) continue
      if ((a < c && c < b) !== (a < d && d < b)) cost += Math.min(v, w)
    }
  }
  return cost
}

// groups: [[id, …], …] in order. links: [{ source, target, value }]. Returns them reordered:
// nodes within their groups, and (withGroups) the groups as well.
export function untangle (groups, links, { withGroups = false } = {}) {
  let best = groups.map(g => [...g])
  const cost = gs => crossings(gs.flat(), links)

  // Towards what they are connected to, as on the circle.
  const weight = new Map()
  const add = (a, b, v) => { if (!weight.has(a)) weight.set(a, []); weight.get(a).push([b, v]) }
  links.forEach(l => { if (l.source !== l.target) { add(l.source, l.target, l.value); add(l.target, l.source, l.value) } })
  const barycentre = gs => {
    const flat = gs.flat()
    const angle = new Map(flat.map((id, i) => [id, TAU * i / flat.length]))
    return gs.map(g => {
      const c = Math.atan2(g.reduce((s, id) => s + Math.sin(angle.get(id)), 0), g.reduce((s, id) => s + Math.cos(angle.get(id)), 0))
      // Seen from the middle of the group: partners further clockwise belong earlier.
      const key = id => {
        const list = weight.get(id) || []
        if (!list.length) return 0
        const x = list.reduce((s, [o, v]) => s + Math.cos(angle.get(o) ?? c) * v, 0)
        const y = list.reduce((s, [o, v]) => s + Math.sin(angle.get(o) ?? c) * v, 0)
        return turn(Math.atan2(y, x) - c)
      }
      return [...g].sort((a, b) => key(b) - key(a))
    })
  }
  const nodesOnly = start => {
    let cur = start.map(g => [...g])
    let curCost = cost(cur)
    let trial = cur
    for (let i = 0; i < 12; i++) {
      trial = barycentre(trial)
      const c = cost(trial)
      if (c < curCost) { cur = trial.map(g => [...g]); curCost = c }
    }
    for (let improved = true, rounds = 0; improved && rounds < 30; rounds++) {
      improved = false
      cur.forEach(g => {
        for (let i = 0; i < g.length - 1; i++) {
          ;[g[i], g[i + 1]] = [g[i + 1], g[i]]
          const c = cost(cur)
          if (c < curCost - 1e-12) { curCost = c; improved = true } else [g[i], g[i + 1]] = [g[i + 1], g[i]]
        }
      })
    }
    return { groups: cur, cost: curCost }
  }

  if (!withGroups || groups.length < 4) return nodesOnly(best).groups
  // The circle has no beginning, so the first group stays first. Few groups: every order.
  const perms = list => (list.length < 2 ? [list] : list.flatMap((x, i) => perms([...list.slice(0, i), ...list.slice(i + 1)]).map(p => [x, ...p])))
  const rest = best.slice(1)
  const orders = rest.length <= 6 ? perms(rest) : [rest, ...rest.flatMap((_, i) => rest.slice(i + 1).map((__, j) => { const r = [...rest]; const k = i + 1 + j; [r[i], r[k]] = [r[k], r[i]]; return r }))]
  const ranked = orders.map(o => ({ o: [best[0], ...o], c: cost([best[0], ...o]) })).sort((a, b) => a.c - b.c).slice(0, 6)
  let found = nodesOnly(best)
  ranked.forEach(r => { const t = nodesOnly(r.o); if (t.cost < found.cost - 1e-12) found = t })
  return found.groups
}
