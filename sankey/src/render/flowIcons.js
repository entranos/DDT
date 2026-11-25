// Icons on flows: which icon a flow shows, and where it sits on the flow.

import { getSetting, isFiniteNumber, toNumber } from '../model/schema.js'
import { iconOf, namedIcon } from '../../../shared/src/icons.js'
import { inkOn } from '../../../shared/src/color.js'

const SVG_NS = 'http://www.w3.org/2000/svg'
const STEPS = 12 // points per piece of a ribbon's edge

// The icon a flow shows: its own, or its carrier's. A carrier without one shows a
// fitting icon for a well-known ID only when icons are on for all flows.
export function flowIcon (doc, link, carrier = doc.carriers.find(c => c.id === link.carrier)) {
  const mode = getSetting(doc, 'flowIcons')
  if (mode === 'none') return null
  const own = String(link.icon ?? '').trim()
  if (own) return namedIcon(own)
  return carrier ? carrierIcon(doc, carrier) : null
}

export function carrierIcon (doc, carrier) {
  return String(carrier.icon ?? '').trim() || getSetting(doc, 'flowIcons') === 'all' ? iconOf(carrier) : null
}

// How many flows leave and reach each node.
export function flowCounts (doc) {
  const counts = { out: new Map(), in: new Map() }
  doc.links.forEach(l => {
    if (!(l.value > 0)) return
    counts.out.set(l.source, (counts.out.get(l.source) || 0) + 1)
    counts.in.set(l.target, (counts.in.get(l.target) || 0) + 1)
  })
  return counts
}

// Place along the flow, 0 (source) to 1 (target): its own, or by the setting. Automatic
// is towards the end where fewer flows meet, so icons of a fan don't pile up.
export function iconPosition (doc, link, counts = flowCounts(doc)) {
  const own = toNumber(link.iconposition)
  if (isFiniteNumber(own) && String(link.iconposition ?? '').trim() !== '') return Math.max(0, Math.min(100, own)) / 100
  const place = getSetting(doc, 'flowIconPosition')
  if (place !== 'auto') return { start: 0.2, middle: 0.5, end: 0.8 }[place]
  const leaving = counts.out.get(link.source) || 0
  const arriving = counts.in.get(link.target) || 0
  return leaving > arriving ? 0.75 : leaving < arriving ? 0.25 : 0.5
}

// ---- centre line ----

function parse (d) {
  const commands = []
  d.replace(/([MLAZ])([^MLAZ]*)/g, (_, letter, rest) => {
    const n = (rest.match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi) || []).map(Number)
    if (letter === 'Z') commands.push({ letter })
    else if (letter === 'A') for (let i = 0; i + 6 < n.length; i += 7) commands.push({ letter, arc: n.slice(i, i + 5), to: [n[i + 5], n[i + 6]] })
    else for (let i = 0; i + 1 < n.length; i += 2) commands.push({ letter, to: [n[i], n[i + 1]] })
    return ''
  })
  return commands
}

const piece = (from, c) => {
  const el = document.createElementNS(SVG_NS, 'path')
  el.setAttribute('d', `M${from.join(',')}${c.letter === 'A' ? `A${c.arc.join(' ')} ` : 'L'}${c.to.join(',')}`)
  return { el, length: el.getTotalLength() }
}

// A ribbon's outline runs along one edge and back along the other, in matching pieces.
// Halfway between matching points is the centre line.
function ribbonCentre (commands) {
  const points = commands.map(c => c.to)
  const n = Math.floor(points.length / 2)
  const out = []
  for (let i = 1; i < n; i++) {
    const a = piece(points[i - 1], commands[i])
    const b = piece(points[2 * n - 1 - i], commands[2 * n - i])
    for (let k = out.length ? 1 : 0; k <= STEPS; k++) {
      const p = a.el.getPointAtLength(a.length * k / STEPS)
      const q = b.el.getPointAtLength(b.length * (1 - k / STEPS))
      out.push([(p.x + q.x) / 2, (p.y + q.y) / 2])
    }
  }
  return out
}

// The centre line of a laid-out flow as points from source to target.
export function centreLine (link) {
  const ribbons = []
  let current = null
  parse(link.path).forEach(c => {
    if (c.letter === 'M') { current = [c]; ribbons.push(current) } else if (c.letter !== 'Z' && current) current.push(c)
  })
  const ends = link.points || []
  const pieces = ribbons.map((commands, i) => {
    const line = ribbonCentre(commands)
    const start = ends[i]
    // Flows that run to the left are drawn from their left end.
    if (start && line.length > 1) {
      const d = p => Math.hypot(p[0] - start.x, p[1] - start.y)
      if (d(line[line.length - 1]) < d(line[0])) line.reverse()
    }
    return line
  })
  return pieces.flat()
}

// { at(t) → [x, y], nearest([x, y]) → t }
export function measure (points) {
  const lengths = [0]
  for (let i = 1; i < points.length; i++) lengths.push(lengths[i - 1] + Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]))
  const total = lengths[lengths.length - 1] || 1
  return {
    at (t) {
      const want = t * total
      let i = 1
      while (i < points.length - 1 && lengths[i] < want) i++
      const span = lengths[i] - lengths[i - 1] || 1
      const f = Math.max(0, Math.min(1, (want - lengths[i - 1]) / span))
      return [points[i - 1][0] + f * (points[i][0] - points[i - 1][0]), points[i - 1][1] + f * (points[i][1] - points[i - 1][1])]
    },
    nearest ([x, y]) {
      let best = { d: Infinity, t: 0 }
      for (let i = 1; i < points.length; i++) {
        const [ax, ay] = points[i - 1]
        const dx = points[i][0] - ax
        const dy = points[i][1] - ay
        const f = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)))
        const d = Math.hypot(ax + f * dx - x, ay + f * dy - y)
        if (d < best.d) best = { d, t: (lengths[i - 1] + f * (lengths[i] - lengths[i - 1])) / total }
      }
      return best.t
    }
  }
}

// Every icon to draw: { uid, x, y, size, r, badge, icon, color, ink, line }.
// preview: { uid, t } while an icon is dragged along its flow.
export function placeFlowIcons (doc, layout, preview = null) {
  if (getSetting(doc, 'flowIcons') === 'none') return []
  const rows = new Map(doc.links.map(l => [l._uid, l]))
  const carriers = new Map(doc.carriers.map(c => [c.id, c]))
  const counts = flowCounts(doc)
  const base = getSetting(doc, 'flowIconSize')
  const thin = getSetting(doc, 'flowIconThin')
  const out = []
  layout.links.forEach(link => {
    const row = rows.get(link.uid)
    if (!row || !link.path || !(link.value > 0)) return
    const icon = flowIcon(doc, row, carriers.get(row.carrier))
    if (!icon) return
    const badge = link.dy < base + 4
    if (badge && thin === 'hide') return
    const points = centreLine(link)
    if (points.length < 2) return
    const line = measure(points)
    const t = preview && preview.uid === link.uid ? preview.t : iconPosition(doc, row, counts)
    const [x, y] = line.at(t)
    // Icons grow with the flow, up to twice their size.
    const size = badge ? base : Math.round(Math.min(base * 2, Math.max(base, link.dy * 0.45)))
    out.push({ uid: link.uid, x, y, t, size, r: badge ? base * 0.5 + 5 : size * 0.5 + 3, badge, icon, color: link.color, pattern: link.pattern, mark: link.mark, ink: inkOn(link.color), line })
  })
  return out
}
