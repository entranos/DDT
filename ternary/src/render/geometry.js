// Geometry of the triangle, after the energy-mix ternary diagram this editor is
// modelled on. Corners: left = top left, right = top right, bottom.
//
// Inside, points are handled as (e, f): e is the right corner's share, f the bottom
// corner's share, and the left corner gets the rest (1 − e − f). On screen the
// triangle points down: the right corner sits at (1, 0), the bottom at (0, 1) and the
// left at (0, 0) before scaling.

const SQRT3_2 = Math.sqrt(3) / 2
export const SHARES = ['left', 'right', 'bottom']

export const toEF = shares => [shares.right, shares.bottom]
export const fromEF = ([e, f]) => ({ left: 1 - e - f, right: e, bottom: f })

const MIN_SPAN = 0.25

// Bounds per share. Zoomed: each lower bound just below the lowest value any point
// reaches (5% steps), leaving at least MIN_SPAN in view. Full: 0–100%.
export function computeDomain (points, zoomed) {
  const lo = { left: 0, right: 0, bottom: 0 }
  const hi = { left: 1, right: 1, bottom: 1 }
  if (zoomed && points.length) {
    SHARES.forEach(k => {
      const min = Math.min(...points.map(p => p[k]))
      lo[k] = Math.max(0, Math.floor((min - 0.01) * 20) / 20)
    })
    const span = () => 1 - SHARES.reduce((s, k) => s + lo[k], 0)
    while (span() < MIN_SPAN - 1e-9) SHARES.forEach(k => { lo[k] = Math.max(0, Math.round((lo[k] - 0.05) * 20) / 20) })
  }
  return { lo, hi }
}

// Grid spacing for a visible span, unless one is set explicitly.
export function gridStep (domain, setting) {
  if (setting !== 'auto' && Number(setting) > 0) return Number(setting)
  const span = Math.max(...SHARES.map(k => Math.min(domain.hi[k], 1 - SHARES.filter(j => j !== k).reduce((s, j) => s + domain.lo[j], 0)) - domain.lo[k]))
  return span > 0.75 ? 0.2 : span > 0.35 ? 0.1 : 0.05
}

export function tickValues (domain, share, step) {
  const out = []
  const top = 1 - SHARES.filter(j => j !== share).reduce((s, j) => s + domain.lo[j], 0)
  const hi = Math.min(domain.hi[share], top)
  for (let v = Math.ceil(domain.lo[share] / step - 1e-9) * step; v <= hi + 1e-9; v += step) out.push(Math.round(v * 1000) / 1000)
  return out
}

// The bounds as half-planes a·e + c·f + d ≥ 0, where left = 1 − e − f.
function constraints ({ lo, hi }) {
  return [
    [1, 0, -lo.right], [-1, 0, hi.right],
    [0, 1, -lo.bottom], [0, -1, hi.bottom],
    [-1, -1, 1 - lo.left], [1, 1, -(1 - hi.left)]
  ]
}

// The visible region: the full triangle clipped to every bound (up to six sides).
export function domainPolygon (domain) {
  let poly = [[0, 0], [1, 0], [0, 1]]
  constraints(domain).forEach(([a, c, d]) => {
    const val = p => a * p[0] + c * p[1] + d
    const out = []
    poly.forEach((p, i) => {
      const q = poly[(i + 1) % poly.length]
      const vp = val(p)
      const vq = val(q)
      if (vp >= -1e-12) out.push(p)
      if ((vp > 1e-12 && vq < -1e-12) || (vp < -1e-12 && vq > 1e-12)) {
        const t = vp / (vp - vq)
        out.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])])
      }
    })
    poly = out
  })
  return poly
}

// The part of a segment (in e, f) inside the bounds, or null.
export function clipSegment (domain, p0, p1) {
  let t0 = 0
  let t1 = 1
  for (const [a, c, d] of constraints(domain)) {
    const g0 = a * p0[0] + c * p0[1] + d
    const g1 = a * p1[0] + c * p1[1] + d
    if (g0 < -1e-9 && g1 < -1e-9) return null
    if (g0 < -1e-9) t0 = Math.max(t0, g0 / (g0 - g1))
    else if (g1 < -1e-9) t1 = Math.min(t1, g0 / (g0 - g1))
  }
  if (t1 - t0 < 1e-6) return null
  const at = t => [p0[0] + t * (p1[0] - p0[0]), p0[1] + t * (p1[1] - p0[1])]
  return [at(t0), at(t1)]
}

const abstract = ([e, f]) => [e + f / 2, f * SQRT3_2]

// Fits the visible region into a box and returns the mapping both ways.
export function makeGeometry (domain, box, { stretch = 1 } = {}) {
  const region = domainPolygon(domain)
  const pts = region.map(abstract)
  const xs = pts.map(p => p[0])
  const ys = pts.map(p => p[1])
  const x0 = Math.min(...xs)
  const x1 = Math.max(...xs)
  const y0 = Math.min(...ys)
  const y1 = Math.max(...ys)
  const bw = Math.max(1e-6, x1 - x0)
  const bh = Math.max(1e-6, y1 - y0)
  let sx = box.w / bw
  let sy = box.h / bh
  if (sx > sy * stretch) sx = sy * stretch
  if (sx < sy) sy = sx
  const ox = box.x + (box.w - bw * sx) / 2
  const oy = box.y
  const toScreen = ef => {
    const [X, Y] = abstract(ef)
    return [ox + (X - x0) * sx, oy + (Y - y0) * sy]
  }
  const fromScreen = ([x, y]) => {
    const f = ((y - oy) / sy + y0) / SQRT3_2
    const e = (x - ox) / sx + x0 - f / 2
    return [e, f]
  }
  return {
    domain,
    toScreen,
    fromScreen,
    at: shares => toScreen(toEF(shares)),
    sharesAt: (x, y) => fromEF(fromScreen([x, y])),
    polygon: region.map(toScreen),
    bbox: { x0: ox, x1: ox + bw * sx, y0: oy, y1: oy + bh * sy }
  }
}

// The nearest shares inside the full triangle (all three between 0 and 1).
export function clampShares ({ left, right, bottom }) {
  let v = [left, right, bottom].map(x => (Number.isFinite(x) ? x : 0))
  // Project onto the simplex: clip negatives, then spread the remainder.
  for (let k = 0; k < 3; k++) {
    const neg = v.filter(x => x < 0).length
    if (!neg) break
    v = v.map(x => Math.max(0, x))
    const sum = v.reduce((a, b) => a + b, 0)
    v = sum > 0 ? v.map(x => x / sum) : [1 / 3, 1 / 3, 1 / 3]
  }
  const sum = v.reduce((a, b) => a + b, 0)
  if (!(sum > 0)) return { left: 1 / 3, right: 1 / 3, bottom: 1 / 3 }
  v = v.map(x => x / sum)
  return { left: v[0], right: v[1], bottom: v[2] }
}

// Straight-line distance from a point to the line through a and b.
export function distanceToLine (p, a, b) {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const len = Math.hypot(dx, dy) || 1
  return Math.abs((p[0] - a[0]) * dy - (p[1] - a[1]) * dx) / len
}
