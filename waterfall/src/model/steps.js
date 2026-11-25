// Turns the document into what is drawn: for every visible diagram the totals per moment,
// stacked by carrier, and between two moments a step per carrier from one total to the next.

import { softColor } from '../../../shared/src/color.js'
import { iconOf } from '../../../shared/src/icons.js'
import { fillOf } from '../../../shared/src/patterns.js'
import { getSetting, isFiniteNumber, isVisible, carrierColor } from './schema.js'

const EPS = 1e-9

export function buildModel (doc) {
  const multiply = getSetting(doc, 'multiply') || 1
  const soften = getSetting(doc, 'softenColors')
  const onlyChanging = getSetting(doc, 'columns') === 'changing'
  const diagrams = doc.diagrams.filter(isVisible)
  const moments = doc.moments.filter(m => isVisible(m) && m.id)
  const carrierById = new Map(doc.carriers.map(c => [c.id, c]))
  const diagramIds = new Set(doc.diagrams.map(d => d.id))

  // Amounts per diagram and carrier; rows for the same pair add up.
  const cells = new Map()
  const unplaced = []
  doc.values.forEach(v => {
    if (!diagramIds.has(v.diagram) || !carrierById.has(v.carrier)) { unplaced.push(v); return }
    const key = `${v.diagram}\u0000${v.carrier}`
    if (!cells.has(key)) cells.set(key, { uids: [], amounts: {}, pattern: '', patterncolor: '' })
    const c = cells.get(key)
    if (!c.pattern) c.pattern = String(v.pattern ?? '').trim()
    if (!c.patterncolor) c.patterncolor = String(v.patterncolor ?? '').trim()
    c.uids.push(v._uid)
    moments.forEach(m => { if (isFiniteNumber(v[m.id])) c.amounts[m.id] = (c.amounts[m.id] || 0) + v[m.id] * multiply })
  })
  const amount = (d, c, m) => { const x = cells.get(`${d.id}\u0000${c.id}`); return (x && x.amounts[m.id]) || 0 }
  // A row of values can have a pattern of its own, in its diagram only.
  const softMark = f => ({ ...f, mark: f.mark && soften ? softColor(f.mark) : f.mark })
  const fill = (d, c) => softMark(fillOf(cells.get(`${d.id}\u0000${c.id}`), c)) // pattern, mark
  const uidsOf = (d, c) => { const x = cells.get(`${d.id}\u0000${c.id}`); return x ? x.uids : [] }

  // Carriers with a row in any visible diagram, in the order of their table; with only
  // changing carriers shown, those with an amount.
  const carriers = doc.carriers
    .filter(c => diagrams.some(d => (onlyChanging ? moments.some(m => Math.abs(amount(d, c, m)) > EPS) : uidsOf(d, c).length > 0)))
    .map(c => ({ uid: c._uid, id: c.id, title: c.title || c.id, color: soften ? softColor(carrierColor(doc, c)) : carrierColor(doc, c), icon: iconOf(c), ...softMark(fillOf(c)) }))
  const rowOf = new Map(doc.carriers.map(c => [c._uid, c]))

  const drawn = diagrams.map(d => {
    const totals = moments.map(m => {
      let up = 0
      let down = 0
      const segments = []
      carriers.forEach(c => {
        const value = amount(d, rowOf.get(c.uid), m)
        if (Math.abs(value) <= EPS) return
        const from = value > 0 ? up : down
        const to = from + value
        if (value > 0) up = to
        else down = to
        segments.push({ carrier: c, value, from, to, ...fill(d, rowOf.get(c.uid)), uids: uidsOf(d, c) })
      })
      return { moment: m, total: up + down, up, down, segments }
    })
    const periods = moments.slice(1).map((m, i) => {
      const start = totals[i].total
      let level = start
      const steps = carriers.map(c => {
        const before = amount(d, rowOf.get(c.uid), moments[i])
        const after = amount(d, rowOf.get(c.uid), m)
        const step = { carrier: c, before, after, change: after - before, from: level, to: level + after - before, ...fill(d, rowOf.get(c.uid)), uids: uidsOf(d, c) }
        level = step.to
        return step
      })
      return { from: moments[i], to: m, start, end: totals[i + 1].total, change: totals[i + 1].total - start, steps }
    })
    const levels = [0, ...totals.flatMap(t => [t.up, t.down, t.total]), ...periods.flatMap(p => p.steps.flatMap(s => [s.from, s.to]))]
    return { uid: d._uid, id: d.id, title: d.title || '', subtitle: d.subtitle || '', totals, periods, max: Math.max(...levels), min: Math.min(...levels) }
  })

  // The columns between two totals are shared by all diagrams.
  const columns = moments.slice(1).map((_, i) => carriers.filter(c => !onlyChanging || drawn.some(d => Math.abs(d.periods[i].steps.find(s => s.carrier === c).change) > EPS)))

  return {
    moments: moments.map(m => ({ uid: m._uid, id: m.id, title: m.title || m.id })),
    carriers,
    diagrams: drawn,
    columns,
    multiply,
    unplaced,
    legend: carriers.map(c => ({ uid: c.uid, label: c.title, icon: c.icon, color: c.color, pattern: c.pattern, mark: c.mark })),
    uidsOf: (diagramId, carrierId) => { const x = cells.get(`${diagramId}\u0000${carrierId}`); return x ? x.uids : [] }
  }
}
