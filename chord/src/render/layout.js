// Shapes and places: ribbons, how large the circle can be, and where the labels go.

const f = v => Math.round(v * 100) / 100
const TAU = Math.PI * 2

// A point at radius r and angle a (clockwise from the top).
export const polar = (r, a) => [r * Math.sin(a), -r * Math.cos(a)]

// A ribbon between two stretches of the circle, narrowing towards the middle.
// sr, tr: radius of its ends; head: length of the arrow head, 0 for none; bend: 0…1.
export function ribbonPath ({ s0, s1, t0, t1 }, { sr, tr, head = 0, bend = 1 }) {
  const te = tr - head
  const sm = (s0 + s1) / 2
  const tm = (t0 + t1) / 2
  // Both sides share a control point: the centre, or short of it for a smaller bend.
  let d = ((tm - sm) % TAU + TAU) % TAU
  if (d > Math.PI) d -= TAU
  const [cx, cy] = polar(Math.min(sr, te) * (1 - bend) * Math.max(0, Math.cos(d / 2)), sm + d / 2)
  const p = (r, a) => { const [x, y] = polar(r, a); return `${f(x)},${f(y)}` }
  const large = s1 - s0 > Math.PI ? 1 : 0
  const c = `${f(cx)},${f(cy)}`
  const end = head > 0
    ? `Q${c} ${p(te, t0)}L${p(tr, tm)}L${p(te, t1)}`
    : `Q${c} ${p(te, t0)}A${f(te)},${f(te)} 0 ${t1 - t0 > Math.PI ? 1 : 0} 1 ${p(te, t1)}`
  return `M${p(sr, s0)}A${f(sr)},${f(sr)} 0 ${large} 1 ${p(sr, s1)}${end}Q${c} ${p(sr, s0)}Z`
}

// Part of a ring, for hit areas and selection.
export function ringPath (a0, a1, r0, r1) {
  const p = (r, a) => { const [x, y] = polar(r, a); return `${f(x)},${f(y)}` }
  if (a1 - a0 >= TAU - 1e-6) return `M${p(r1, 0)}A${f(r1)},${f(r1)} 0 1 1 ${p(r1, Math.PI)}A${f(r1)},${f(r1)} 0 1 1 ${p(r1, 0)}Z`
  const large = a1 - a0 > Math.PI ? 1 : 0
  return `M${p(r1, a0)}A${f(r1)},${f(r1)} 0 ${large} 1 ${p(r1, a1)}L${p(r0, a1)}A${f(r0)},${f(r0)} 0 ${large} 0 ${p(r0, a0)}Z`
}

// The path a curved text follows; on the lower half it runs the other way, so texts are
// never upside down.
export function textArc (a0, a1, r) {
  const mid = (a0 + a1) / 2
  const flip = Math.cos(mid) < -1e-9
  const p = a => { const [x, y] = polar(r, a); return `${f(x)},${f(y)}` }
  const large = Math.abs(a1 - a0) > Math.PI ? 1 : 0
  return flip ? `M${p(a1)}A${f(r)},${f(r)} 0 ${large} 0 ${p(a0)}` : `M${p(a0)}A${f(r)},${f(r)} 0 ${large} 1 ${p(a1)}`
}

// How far labels and rings reach from the centre, for a circle of radius r.
// labels: [{ a, ring, w, h }] ring: distance from the circle to the label.
export function reach (r, labels, ring) {
  const out = { left: r + ring, right: r + ring, up: r + ring, down: r + ring }
  labels.forEach(l => {
    const x = (r + l.ring) * Math.sin(l.a)
    const y = -(r + l.ring) * Math.cos(l.a)
    if (x >= 0) out.right = Math.max(out.right, x + l.w); else out.left = Math.max(out.left, -x + l.w)
    if (y < 0) out.up = Math.max(out.up, -y + l.h); else out.down = Math.max(out.down, y + l.h)
  })
  return out
}

// The largest circle that fits a box with its labels, and where its centre is.
export function fitCircle (box, labels, ring, radius = 0) {
  const w = box.x1 - box.x0
  const h = box.y1 - box.y0
  const fits = r => { const e = reach(r, labels, ring); return e.left + e.right <= w && e.up + e.down <= h }
  let r = radius
  if (!(r > 0)) {
    let lo = 20
    let hi = Math.max(20, Math.min(w, h) / 2)
    for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (fits(m)) lo = m; else hi = m }
    r = lo
  }
  const e = reach(r, labels, ring)
  return { r, cx: box.x0 + e.left + (w - e.left - e.right) / 2, cy: box.y0 + e.up + (h - e.up - e.down) / 2, fits: fits(r - 0.5) }
}

// Moves the labels of one side apart. items: [{ y (middle), h }] get `at` (their new middle).
export function spreadLabels (items, { top, bottom, gap = 6 }) {
  const list = [...items].sort((a, b) => a.y - b.y)
  list.forEach(l => { l.at = l.y })
  const room = (a, b) => (a.h + b.h) / 2 + gap
  for (let pass = 0; pass < 60; pass++) {
    let moved = 0
    for (let i = 0; i < list.length - 1; i++) {
      const over = list[i].at + room(list[i], list[i + 1]) - list[i + 1].at
      if (over > 0.01) { list[i].at -= over / 2; list[i + 1].at += over / 2; moved += over }
    }
    list.forEach(l => { const y = Math.max(top + l.h / 2, Math.min(bottom - l.h / 2, l.at)); moved += Math.abs(y - l.at); l.at = y })
    if (moved < 0.1) break
  }
  // Whatever still overlaps runs on past the bottom rather than through each other.
  for (let i = 0; i < list.length - 1; i++) list[i + 1].at = Math.max(list[i + 1].at, list[i].at + room(list[i], list[i + 1]))
  return list
}
