// Where everything goes: one set of columns shared by all diagrams, and a row per diagram.

// ---- columns ----

// The totals, and between every two of them the steps and (optionally) the net change.
// columns: for each period, the carriers that get a step (from buildModel).
export function layoutColumns (moments, columns, { x0, x1, totalWidth, periodGap, stepGap, netWidth, minStep = 5, maxStep = 64 }) {
  const n = moments.length
  if (!n) return { totals: [], periods: [], stepWidth: 0, x0, x1: x0, overflow: false }
  const steps = columns.reduce((s, c) => s + c.length, 0)
  const stepGaps = columns.reduce((s, c) => s + Math.max(0, c.length - 1), 0)
  const fixed = n * totalWidth + columns.reduce((s, c) => s + (c.length || netWidth ? 2 * periodGap : periodGap) + (netWidth ? netWidth + (c.length ? stepGap * 2 : 0) : 0), 0) + stepGaps * stepGap
  const stepWidth = steps ? Math.max(minStep, Math.min(maxStep, (x1 - x0 - fixed) / steps)) : 0
  let x = x0
  const totals = []
  const periods = []
  moments.forEach((m, i) => {
    totals.push({ x0: x, x1: x + totalWidth, cx: x + totalWidth / 2 })
    x += totalWidth
    if (i === n - 1) return
    const carriers = columns[i]
    const start = x + periodGap
    x = start
    const list = carriers.map((c, j) => {
      const s = { carrier: c, x0: x, x1: x + stepWidth, cx: x + stepWidth / 2 }
      x += stepWidth + (j < carriers.length - 1 ? stepGap : 0)
      return s
    })
    let net = null
    if (netWidth) {
      if (carriers.length) x += stepGap * 2
      net = { x0: x, x1: x + netWidth, cx: x + netWidth / 2 }
      x += netWidth
    }
    periods.push({ x0: start, x1: x, steps: list, net })
    x += carriers.length || netWidth ? periodGap : 0
  })
  return { totals, periods, stepWidth, x0, x1: x, overflow: x > x1 + 0.5 }
}

// ---- rows ----

// Blocks from top to bottom: diagrams, and the rows with column headings.
export function blockOrder (count, place) {
  const out = []
  for (let i = 0; i < count; i++) {
    if (place === 'top' && i === 0) out.push({ axis: true })
    out.push({ diagram: i })
    if (place === 'each' || (place === 'bottom' && i === count - 1) || (place === 'auto' && i === 0)) out.push({ axis: true })
  }
  return out
}

// extents: [{ min, max }] per diagram. heads: free height above the highest value of each
// diagram, for labels. Returns { rows: [{ y0, y1, top, perUnit, min, max, y(v), v(y) }], axes: [{ y0, y1, below }], perUnit, height, overflow }
//   y0…y1 the whole block, top: where the highest value is drawn
export function layoutRows (extents, { top, bottom, sync, gap, place, axisHeight, heads, foot, pxPerUnit = null }) {
  const n = extents.length
  const order = blockOrder(n, place)
  const axes = order.filter(b => b.axis).length
  // Between two diagrams there is the gap, whether or not a heading row sits there.
  const gaps = Math.max(0, n - 1) * gap
  const fixed = gaps + axes * axisHeight + heads.reduce((s, h) => s + h, 0) + n * foot
  const room = Math.max(20 * n, bottom - top - fixed)
  const all = { min: Math.min(0, ...extents.map(e => e.min)), max: Math.max(0, ...extents.map(e => e.max)) }
  const own = extents.map(e => ({ min: Math.min(0, e.min), max: Math.max(0, e.max) }))
  const domains = sync === 'same' ? extents.map(() => all) : own
  const span = d => Math.max(1e-9, d.max - d.min)
  let scales
  if (pxPerUnit > 0) scales = domains.map(() => pxPerUnit)
  else if (sync === 'own') scales = domains.map(d => room / n / span(d))
  else {
    const total = domains.reduce((s, d) => s + span(d), 0)
    scales = domains.map(() => room / total)
  }
  const rows = []
  const axisRows = []
  let y = top
  order.forEach((b, i) => {
    if (b.axis) {
      axisRows.push({ y0: y, y1: y + axisHeight, below: i > 0 && order[i - 1].diagram !== undefined })
      y += axisHeight
      return
    }
    const d = domains[b.diagram]
    const perUnit = scales[b.diagram]
    const y0 = y
    const topY = y0 + heads[b.diagram]
    const y1 = topY + span(d) * perUnit + foot
    rows.push({ y0, y1, top: topY, perUnit, min: d.min, max: d.max, y: v => topY + (d.max - v) * perUnit, v: py => d.max - (py - topY) / perUnit })
    y = y1
    if (b.diagram < n - 1) y += gap
  })
  // The gap comes after a heading row between two diagrams, not before it.
  order.forEach((b, i) => {
    if (!b.axis || !(i > 0) || order[i - 1].diagram === undefined || order[i - 1].diagram >= n - 1) return
    const axis = axisRows[order.slice(0, i).filter(x => x.axis).length]
    const above = rows[order[i - 1].diagram]
    const h = axis.y1 - axis.y0
    axis.y0 = above.y1
    axis.y1 = above.y1 + h
  })
  return { rows, axes: axisRows, perUnit: scales[0] || 0, height: y - top, bottom: y, overflow: y > bottom + 1 }
}
