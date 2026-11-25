// Where the bars go. Everything is worked out along two directions, whichever way the bars
// run: across (u, the bars side by side) and along the values (v).

// Slots for the bars, from u0 on: groups have a gap between them, and a heading when `head`
// gives room for one (horizontal bars).
// groups: from buildModel. Returns { groups: [{ u0, u1, bars: [{ u0, u1, cu }] }], slot }.
export function layoutSlots (groups, { u0, u1, groupGap, head = () => 0 }) {
  const count = groups.reduce((n, g) => n + g.bars.length, 0)
  const heads = groups.reduce((n, g) => n + head(g), 0)
  const slot = count ? Math.max(1, (u1 - u0 - groupGap * Math.max(0, groups.length - 1) - heads) / count) : 0
  let u = u0
  return {
    slot,
    groups: groups.map(g => {
      const start = u
      u += head(g)
      const bars = g.bars.map(() => { const b = { u0: u, u1: u + slot, cu: u + slot / 2 }; u += slot; return b })
      const out = { u0: start, u1: u, bars }
      u += groupGap
      return out
    })
  }
}

// Pixels per unit so that everything fits a length: bars, and the labels beyond their ends.
// ends: [{ up, down, roomUp, roomDown }] levels in values, room in pixels.
const needs = (per, min, max, ends) => ({
  up: Math.max(max * per, 0, ...ends.map(e => e.up * per + e.roomUp)),
  down: Math.max(-min * per, 0, ...ends.map(e => -e.down * per + e.roomDown))
})

export function layoutScale ({ length, min, max, ends, pxPerUnit = null }) {
  if (pxPerUnit) {
    const n = needs(pxPerUnit, min, max, ends)
    return { per: pxPerUnit, down: n.down, fits: n.up + n.down <= length + 1 }
  }
  let lo = 0
  let hi = length / Math.max(1e-12, max - min)
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2
    const n = needs(mid, min, max, ends)
    if (n.up + n.down <= length) lo = mid
    else hi = mid
  }
  return { per: lo, down: needs(lo, min, max, ends).down, fits: lo > 0 }
}

// A box with its own radius per corner.
export function roundedBox ({ x0, y0, x1, y1 }, { tl = 0, tr = 0, br = 0, bl = 0 }) {
  const f = v => Math.round(v * 100) / 100
  return `M${f(x0 + tl)},${f(y0)}L${f(x1 - tr)},${f(y0)}Q${f(x1)},${f(y0)} ${f(x1)},${f(y0 + tr)}L${f(x1)},${f(y1 - br)}Q${f(x1)},${f(y1)} ${f(x1 - br)},${f(y1)}L${f(x0 + bl)},${f(y1)}Q${f(x0)},${f(y1)} ${f(x0)},${f(y1 - bl)}L${f(x0)},${f(y0 + tl)}Q${f(x0)},${f(y0)} ${f(x0 + tl)},${f(y0)}Z`
}
