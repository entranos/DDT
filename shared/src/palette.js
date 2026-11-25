// Makes palettes: random ones in many styles, gradients, and fixed sets. Pure functions of
// their options and a seed, so every palette can be made again.

import { fromOklch, oklch, mixOklab, difference, seenAs, closestPair, contrastOf, toHex, isHex } from './colorMath.js'
import { STANDARD_COLORS, standardColorOf } from './standardPalette.js'

export function random (seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
export const newSeed = () => Math.floor(Math.random() * 2 ** 31)

const between = (rnd, a, b) => a + rnd() * (b - a)
const GOLDEN = 137.508
const turn = h => ((h % 360) + 360) % 360

// n hues spread over a stretch of the circle, in an order that keeps neighbours apart.
function hues (n, rnd, { from = null, width = 360, jitter = 0.35 } = {}) {
  const start = from === null ? rnd() * 360 : from
  const full = width >= 359
  const step = full ? width / n : n > 1 ? width / (n - 1) : 0
  const list = Array.from({ length: n }, (_, i) => turn(start + i * step + (rnd() - 0.5) * step * jitter))
  if (n < 4) return list
  // Every other one first: hues next to each other in the list are far apart on the circle.
  const jump = [5, 3, 2].find(j => n % j && (j < n)) || 1
  return list.map((_, i) => list[(i * jump) % n])
}

// Lightness that goes up and down, so neighbours differ in that too.
const wave = (n, rnd, lo, hi) => { const flip = rnd() < 0.5; return Array.from({ length: n }, (_, i) => { const k = (i % 2 === 0) !== flip ? 0.22 : 0.78; return lo + (hi - lo) * Math.max(0, Math.min(1, k + (rnd() - 0.5) * 0.4)) }) }

const scheme = (n, rnd, { l, c, ...hue }) => {
  const hs = hues(n, rnd, hue)
  const ls = wave(n, rnd, l[0], l[1])
  return hs.map((h, i) => ({ l: ls[i], c: between(rnd, c[0], c[1]), h }))
}

// A few families of one hue each, with steps of lightness within them.
function families (n, rnd, hs, { l = [0.46, 0.8], c = [0.07, 0.14] } = {}) {
  const per = Math.ceil(n / hs.length)
  return Array.from({ length: n }, (_, i) => {
    const f = i % hs.length
    const step = Math.floor(i / hs.length)
    const t = per > 1 ? step / (per - 1) : 0.4
    return { l: l[0] + (l[1] - l[0]) * t + (rnd() - 0.5) * 0.03, c: c[1] - (c[1] - c[0]) * t, h: turn(hs[f] + (rnd() - 0.5) * 10) }
  })
}

// Points along colours, in OKLab.
export function along (stops, n) {
  if (n === 1) return [toHex(stops[Math.floor((stops.length - 1) / 2)])]
  return Array.from({ length: n }, (_, i) => {
    const x = i / (n - 1) * (stops.length - 1)
    const k = Math.min(stops.length - 2, Math.floor(x))
    return mixOklab(stops[k], stops[k + 1], x - k)
  })
}

// The same through hue and strength, so the middle stays colourful.
function through (a, b, n) {
  const x = oklch(a)
  const y = oklch(b)
  const turnBy = x.c < 0.02 || y.c < 0.02 ? 0 : ((y.h - x.h + 540) % 360) - 180
  return Array.from({ length: n }, (_, i) => { const t = n > 1 ? i / (n - 1) : 0.5; return fromOklch({ l: x.l + (y.l - x.l) * t, c: x.c + (y.c - x.c) * t, h: x.h + turnBy * t }) })
}

// Light to dark in one hue: the hue drifts a little, as pigments do, and the ends calm down.
function ramp (base, n, { from = 0.88, to = 0.34, drift = 12 } = {}) {
  const b = oklch(base)
  return Array.from({ length: n }, (_, i) => {
    const t = n > 1 ? i / (n - 1) : 0.5
    const l = from + (to - from) * t
    return { l, c: Math.max(0.018, b.c * (0.42 + 0.9 * Math.sin(Math.PI * Math.min(1, 0.22 + t * 0.62)))) * (b.c < 0.03 ? 0.4 : 1), h: turn(b.h + drift * (t - 0.5)) }
  })
}

const OKABE = ['#0072B2', '#E69F00', '#009E73', '#CC79A7', '#56B4E9', '#D55E00', '#F0E442', '#000000']
const TOL_BRIGHT = ['#4477AA', '#EE6677', '#228833', '#CCBB44', '#66CCEE', '#AA3377', '#BBBBBB']
const TOL_MUTED = ['#332288', '#88CCEE', '#44AA99', '#117733', '#999933', '#DDCC77', '#CC6677', '#882255', '#AA4499']

// The colours of the Rijkshuisstijl, the visual identity of the Dutch central government.
const RIJK = {
  hemelblauw: '#007BC7', donkergeel: '#FFB612', donkergroen: '#275937', robijnrood: '#CA005D', lichtblauw: '#8FCAE7', oranje: '#E17000', paars: '#42145F', mintgroen: '#76D2B6', rood: '#D52B1E',
  mosgroen: '#777C00', roze: '#F092CD', logoblauw: '#154273', bruin: '#94710A', groen: '#39870C', violet: '#A90061', donkerblauw: '#01689B', geel: '#F9E11E', donkerbruin: '#673327'
}
const rijk = names => names.split(' ').map(n => RIJK[n])
// Its tints are mixes with white: 30% and 15% of the colour.
const tints = (hex, n) => along([hex, mixSrgb(hex, 0.3), mixSrgb(hex, 0.15)], Math.max(1, n))
const mixSrgb = (hex, part) => toHex('#' + [1, 3, 5].map(i => Math.round(255 - (255 - parseInt(hex.slice(i, i + 2), 16)) * part).toString(16).padStart(2, '0')).join(''))

const shuffled = (list, rnd) => { const a = [...list]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]] } return a }

// More colours than a set has: lighter and darker versions of it.
export function extend (list, n) {
  const out = list.slice(0, n)
  for (let round = 1; out.length < n; round++) {
    const shift = (round % 2 ? 1 : -1) * 0.12 * Math.ceil(round / 2)
    list.forEach(hex => { if (out.length < n) { const c = oklch(hex); out.push(fromOklch({ ...c, l: Math.max(0.2, Math.min(0.92, c.l + shift)), c: c.c * 0.85 })) } })
  }
  return out
}
const fixedSet = list => (n, rnd) => extend(shuffled(list, rnd), n)
const randomBase = (rnd, { l = [0.5, 0.62], c = [0.1, 0.16] } = {}) => fromOklch({ l: between(rnd, ...l), c: between(rnd, ...c), h: rnd() * 360 })
const other = (rnd, base) => { const b = oklch(base); return fromOklch({ l: between(rnd, 0.5, 0.66), c: between(rnd, 0.1, 0.16), h: b.h + between(rnd, 90, 270) }) }

// Every style: make(n, rnd, o) returns n colours, as hex codes or { l, c, h }.
//   base: how many colours can be chosen for it      gradient: its colours have an order
//   distinct: several are made and the one whose colours differ most is taken
//   exact: its colours are used as they are, so no shades of them within groups
export const STYLES = [
  { id: 'standard', exact: true, group: 'Sets', label: 'Standard', text: 'The colours of the suite: by meaning, otherwise in order', fixed: true, make: (n, rnd, o) => standardFor(o.names || Array.from({ length: n }, () => '')) },
  { id: 'okabe', exact: true, group: 'Sets', label: 'Okabe–Ito', text: 'A set made for colour-blind readers', make: fixedSet(OKABE) },
  { id: 'tolBright', exact: true, group: 'Sets', label: 'Tol bright', text: 'A set made for colour-blind readers', make: fixedSet(TOL_BRIGHT) },
  { id: 'tolMuted', exact: true, group: 'Sets', label: 'Tol muted', text: 'A set made for colour-blind readers', make: fixedSet(TOL_MUTED) },

  { id: 'rijk', exact: true, group: 'Rijkshuisstijl', label: 'All colours', text: 'The colours of the Dutch central government', distinct: true, make: fixedSet(Object.values(RIJK)) },
  { id: 'rijkCool', exact: true, group: 'Rijkshuisstijl', label: 'Cool', text: 'Its blues and greens', distinct: true, make: fixedSet(rijk('hemelblauw lichtblauw logoblauw mintgroen donkergroen donkerblauw groen mosgroen')) },
  { id: 'rijkWarm', exact: true, group: 'Rijkshuisstijl', label: 'Warm', text: 'Its yellows, reds and purples', distinct: true, make: fixedSet(rijk('donkergeel robijnrood oranje paars roze rood violet geel bruin donkerbruin')) },
  { id: 'rijkBlue', group: 'Rijkshuisstijl', label: 'Blues', text: 'From logoblauw to lichtblauw', gradient: true, make: n => along(rijk('logoblauw donkerblauw hemelblauw lichtblauw').concat('#DDEFF8'), n + (n > 3 ? 0 : 1)).slice(0, n) },
  { id: 'rijkTints', group: 'Rijkshuisstijl', label: 'One colour', text: 'One of its colours in tints; which one is up to chance', gradient: true, make: (n, rnd) => { const pool = rijk('hemelblauw logoblauw donkerblauw donkergroen groen mosgroen robijnrood violet paars oranje rood bruin donkerbruin'); return tints(pool[Math.floor(rnd() * pool.length)], n) } },

  { id: 'balanced', group: 'Many colours', label: 'Balanced', text: 'All hues, at an even strength', distinct: true, make: (n, rnd) => scheme(n, rnd, { l: [0.52, 0.76], c: [0.1, 0.14] }) },
  { id: 'muted', group: 'Many colours', label: 'Muted', text: 'Calm, a little greyed', distinct: true, make: (n, rnd) => scheme(n, rnd, { l: [0.5, 0.78], c: [0.045, 0.08] }) },
  { id: 'pastel', group: 'Many colours', label: 'Pastel', text: 'Light and soft', distinct: true, make: (n, rnd) => scheme(n, rnd, { l: [0.78, 0.91], c: [0.045, 0.085] }) },
  { id: 'vivid', group: 'Many colours', label: 'Vivid', text: 'Strong and bright', distinct: true, make: (n, rnd) => scheme(n, rnd, { l: [0.54, 0.8], c: [0.16, 0.24] }) },
  { id: 'deep', group: 'Many colours', label: 'Deep', text: 'Dark, for a light background', distinct: true, make: (n, rnd) => scheme(n, rnd, { l: [0.3, 0.52], c: [0.07, 0.13] }) },
  { id: 'earth', group: 'Many colours', label: 'Earth', text: 'Ochre, clay, moss and slate', distinct: true, make: (n, rnd) => hues(n, rnd, { from: between(rnd, 25, 45), width: 120, jitter: 0.6 }).map((h, i) => ({ l: between(rnd, 0.4, 0.78), c: between(rnd, 0.03, 0.095), h: i % 4 === 3 ? between(rnd, 210, 250) : h })) },
  { id: 'jewel', group: 'Many colours', label: 'Jewel', text: 'Saturated and rich', distinct: true, make: (n, rnd) => scheme(n, rnd, { l: [0.4, 0.6], c: [0.13, 0.2] }) },
  { id: 'warm', group: 'Many colours', label: 'Warm', text: 'Reds, oranges and yellows', distinct: true, make: (n, rnd) => scheme(n, rnd, { l: [0.45, 0.84], c: [0.08, 0.16], from: between(rnd, 340, 360), width: 110 }) },
  { id: 'cool', group: 'Many colours', label: 'Cool', text: 'Greens, blues and purples', distinct: true, make: (n, rnd) => scheme(n, rnd, { l: [0.42, 0.82], c: [0.07, 0.14], from: between(rnd, 150, 170), width: 150 }) },
  { id: 'random', group: 'Many colours', label: 'Anything', text: 'No rules at all', distinct: true, make: (n, rnd) => Array.from({ length: n }, () => ({ l: between(rnd, 0.35, 0.85), c: between(rnd, 0.02, 0.2), h: rnd() * 360 })) },

  { id: 'analogous', group: 'Around a colour', label: 'Neighbours', text: 'Hues close to one colour', base: 1, distinct: true, make: (n, rnd, o) => { const b = oklch(o.base || randomBase(rnd)); return scheme(n, rnd, { l: [0.42, 0.82], c: [Math.max(0.05, b.c * 0.7), Math.max(0.08, b.c * 1.1)], from: b.h - 40, width: 80 }) } },
  { id: 'complement', group: 'Around a colour', label: 'Opposites', text: 'One colour and the one across', base: 1, distinct: true, make: (n, rnd, o) => { const b = oklch(o.base || randomBase(rnd)); return families(n, rnd, [b.h, b.h + 180]) } },
  { id: 'split', group: 'Around a colour', label: 'Split opposites', text: 'One colour and the two beside its opposite', base: 1, distinct: true, make: (n, rnd, o) => { const b = oklch(o.base || randomBase(rnd)); return families(n, rnd, [b.h, b.h + 150, b.h + 210]) } },
  { id: 'triad', group: 'Around a colour', label: 'Triad', text: 'Three hues, evenly apart', base: 1, distinct: true, make: (n, rnd, o) => { const b = oklch(o.base || randomBase(rnd)); return families(n, rnd, [b.h, b.h + 120, b.h + 240]) } },
  { id: 'paired', group: 'Around a colour', label: 'Pairs', text: 'A dark and a light version of every hue', base: 1, distinct: true, make: (n, rnd, o) => { const b = oklch(o.base || randomBase(rnd)); const hs = hues(Math.ceil(n / 2), rnd, { from: b.h }); return Array.from({ length: n }, (_, i) => ({ l: i % 2 ? between(rnd, 0.76, 0.82) : between(rnd, 0.48, 0.55), c: i % 2 ? between(rnd, 0.07, 0.09) : between(rnd, 0.12, 0.15), h: hs[Math.floor(i / 2)] })) } },
  { id: 'accent', group: 'Around a colour', label: 'Accent', text: 'Greys, with colour for what matters', base: 1, accents: true, make: (n, rnd, o) => { const base = o.base || randomBase(rnd, { l: [0.52, 0.64], c: [0.13, 0.18] }); const k = Math.min(n, Math.max(1, o.accents || 1)); const b = oklch(base); const greys = along([fromOklch({ l: 0.5, c: 0.008, h: b.h }), fromOklch({ l: 0.86, c: 0.008, h: b.h })], Math.max(1, n - k)); return [...Array.from({ length: k }, (_, i) => fromOklch({ ...b, h: b.h + i * 24, l: b.l + (i % 2 ? 0.1 : 0) })), ...greys].slice(0, n) } },

  { id: 'mono', group: 'Gradients', label: 'One colour', text: 'From light to dark in one colour', base: 1, gradient: true, make: (n, rnd, o) => ramp(o.base || randomBase(rnd), n, { drift: between(rnd, -18, 18) }) },
  { id: 'duo', group: 'Gradients', label: 'Two colours', text: 'From one colour to another', base: 2, gradient: true, make: (n, rnd, o) => { const a = o.base || randomBase(rnd); return through(a, o.base2 || other(rnd, a), n) } },
  { id: 'fade', group: 'Gradients', label: 'Dark to light', text: 'From a dark colour to a light other one', base: 2, gradient: true, make: (n, rnd, o) => { const a = o.base || randomBase(rnd); const b = o.base2 || other(rnd, a); const x = oklch(a); const y = oklch(b); return along([fromOklch({ ...x, l: 0.33, c: Math.min(x.c, 0.12) }), fromOklch({ l: 0.6, c: (x.c + y.c) / 2 + 0.02, h: x.h + ((y.h - x.h + 540) % 360 - 180) / 2 }), fromOklch({ ...y, l: 0.9, c: Math.min(y.c, 0.09) })], n) } },
  { id: 'sweep', group: 'Gradients', label: 'Hue sweep', text: 'Through many hues, from dark to light', base: 1, gradient: true, make: (n, rnd, o) => { const b = oklch(o.base || randomBase(rnd)); const way = rnd() < 0.5 ? 1 : -1; const span = between(rnd, 130, 220) * way; return Array.from({ length: n }, (_, i) => { const t = n > 1 ? i / (n - 1) : 0.5; return { l: 0.36 + 0.5 * t, c: 0.08 + 0.08 * Math.sin(Math.PI * t), h: b.h + span * t } }) } },
  { id: 'diverging', group: 'Gradients', label: 'Diverging', text: 'Two colours with a light middle', base: 2, gradient: true, make: (n, rnd, o) => { const a = o.base || randomBase(rnd); const b = o.base2 || other(rnd, a); const x = oklch(a); const y = oklch(b); return along([fromOklch({ ...x, l: 0.42 }), fromOklch({ ...x, l: 0.66, c: x.c * 0.85 }), '#E6E2DA', fromOklch({ ...y, l: 0.66, c: y.c * 0.85 }), fromOklch({ ...y, l: 0.42 })], n) } },
  { id: 'greys', group: 'Gradients', label: 'Greys', text: 'With a hint of a colour', base: 1, gradient: true, make: (n, rnd, o) => { const b = oklch(o.base || randomBase(rnd)); return Array.from({ length: n }, (_, i) => ({ l: 0.34 + 0.52 * (n > 1 ? i / (n - 1) : 0.5), c: 0.012, h: b.h })) } },

  { id: 'own', exact: true, group: 'Your own', label: 'Your colours', text: 'A list of hex codes', own: true, make: (n, rnd, o) => ownList(o.own, n) },
  { id: 'picture', exact: true, group: 'Your own', label: 'From a picture', text: 'The main colours of an image', picture: true, make: (n, rnd, o) => (o.picture && o.picture.length ? extend(o.picture, n) : extend(STANDARD_COLORS, n)) }
]
export const STYLE = Object.fromEntries(STYLES.map(s => [s.id, s]))
export const STYLE_GROUPS = [...new Set(STYLES.map(s => s.group))]

// The standard colours: what has a known meaning gets its own, the others the rest in order.
function standardFor (names) {
  const out = names.map(n => standardColorOf(...[].concat(n)))
  const taken = new Set()
  const result = out.map(c => { if (!c || taken.has(c)) return null; taken.add(c); return c })
  const rest = STANDARD_COLORS.filter(c => !taken.has(c))
  const fill = extend(rest.length ? rest : STANDARD_COLORS, result.filter(c => !c).length)
  return result.map(c => c || fill.shift())
}

export const parseColors = text => (String(text || '').match(/#?\b(?:[0-9a-f]{6}|[0-9a-f]{3})\b/gi) || []).filter(isHex).map(toHex)
function ownList (text, n) {
  const list = parseColors(text)
  return list.length ? extend(list, n) : extend(STANDARD_COLORS, n)
}

export const DEFAULTS = { style: 'standard', seed: 1, variation: 0, base: null, base2: null, accents: 1, own: '', picture: null, hue: 0, chroma: 1, light: 0, contrast: 1, order: 'listed', reverse: false, apart: true, grouped: true, background: 'keep', patterns: 'keep' }

// Hue, strength, lightness and contrast, and small random changes ("variations").
function tone (color, o, rnd) {
  const c = typeof color === 'string' ? oklch(color) : color
  const vary = o.variation ? { h: (rnd() - 0.5) * 18, c: 1 + (rnd() - 0.5) * 0.24, l: (rnd() - 0.5) * 0.07 } : { h: 0, c: 1, l: 0 }
  if (typeof color === 'string' && !o.variation && !o.hue && o.chroma === 1 && !o.light && o.contrast === 1) return toHex(color)
  return fromOklch({
    h: turn(c.h + o.hue + vary.h),
    c: c.c * o.chroma * vary.c,
    l: Math.max(0.14, Math.min(0.97, 0.62 + (c.l - 0.62) * o.contrast + o.light + vary.l))
  })
}

// How well a palette can be told apart; the neighbours count double.
function score (colors) {
  const pair = closestPair(colors)
  let beside = Infinity
  for (let i = 0; i < colors.length - 1; i++) beside = Math.min(beside, difference(colors[i], colors[i + 1]), difference(seenAs(colors[i], 'deutan'), seenAs(colors[i + 1], 'deutan')) * 1.5)
  return pair.difference + (Number.isFinite(beside) ? beside * 0.5 : 0)
}

// n colours in the order they are to be used.
// locked: colours that are kept, which new ones should differ from.
export function makeColors (n, options, { names = null, locked = [] } = {}) {
  const o = { ...DEFAULTS, ...options }
  const style = STYLE[o.style] || STYLE.standard
  if (n <= 0) return []
  const make = seed => {
    const rnd = random(seed)
    const list = style.make(n, rnd, { ...o, names: names || undefined })
    const nudge = random(seed + 7919 * (o.variation || 0))
    const colors = list.map(c => tone(c, o, nudge))
    return style.gradient && o.reverse ? colors.reverse() : colors
  }
  if (!style.distinct || !o.apart) return make(o.seed)
  // Of a number of palettes, the one whose colours differ most.
  let best = null
  for (let i = 0; i < 28; i++) {
    const colors = make(o.seed + i * 104729)
    const s = score([...locked, ...colors])
    if (!best || s > best.s) best = { s, colors }
  }
  return best.colors
}

// ---- who gets which colour ----

// targets: [{ uid, names, group, weight }]. locked: Map uid → hex. Returns Map uid → hex.
export function assignColors (targets, options, locked = new Map()) {
  const o = { ...DEFAULTS, ...options }
  const free = targets.filter(t => !locked.has(t.uid))
  const style = STYLE[o.style] || STYLE.standard
  const keep = [...locked.values()]
  const out = new Map([...locked])
  const inOrder = m => new Map(targets.filter(t => m.has(t.uid)).map(t => [t.uid, m.get(t.uid)]))

  // One colour per group, with shades of it inside: for targets that belong together.
  const groups = [...new Set(free.map(t => t.group || t.uid))]
  const useGroups = o.grouped && !style.gradient && !style.exact && groups.length < free.length
  if (useGroups) {
    const first = groups.map(g => free.find(t => (t.group || t.uid) === g))
    const base = assignColors(first.map(t => ({ ...t, uid: t.group || t.uid, group: null, weight: free.filter(x => (x.group || x.uid) === (t.group || t.uid)).reduce((s, x) => s + (x.weight || 0), 0), names: t.group ? [t.group] : t.names })), { ...o, grouped: false })
    groups.forEach(g => {
      const members = free.filter(t => (t.group || t.uid) === g)
      const c = oklch(base.get(g))
      members.forEach((t, i) => {
        const at = members.length > 1 ? i / (members.length - 1) - 0.5 : 0
        out.set(t.uid, members.length > 1 ? fromOklch({ l: Math.max(0.25, Math.min(0.9, c.l + at * Math.min(0.3, 0.1 * members.length))), c: c.c * (1 - Math.abs(at) * 0.25), h: c.h + at * 14 }) : base.get(g))
      })
    })
    return inOrder(out)
  }

  const colors = makeColors(free.length, o, { names: style.fixed ? free.map(t => t.names) : null, locked: keep })
  const order = free.map((_, i) => i)
  if (!style.fixed) {
    if (o.order === 'size') order.sort((a, b) => (free[b].weight || 0) - (free[a].weight || 0))
    else if (o.order === 'shuffle') { const s = shuffled(order, random(o.seed + 31)); s.forEach((v, i) => { order[i] = v }) }
  }
  // By size, the largest get the strongest colours of what isn't a gradient.
  const strength = hex => { const c = oklch(hex); return c.c * 2 + (0.75 - c.l) }
  const list = o.order === 'size' && !style.gradient && !style.accents ? [...colors].sort((a, b) => strength(b) - strength(a)) : o.order === 'size' && style.gradient && !o.reverse ? [...colors].sort((a, b) => oklch(a).l - oklch(b).l) : colors
  order.forEach((ti, i) => out.set(free[ti].uid, list[i]))
  return inOrder(out)
}

// ---- the background, with texts and lines that go with it ----

export const BACKGROUNDS = [{ value: 'keep', label: 'Keep as it is' }, { value: 'paper', label: 'Warm white' }, { value: 'white', label: 'White' }, { value: 'tint', label: 'A tint of the palette' }, { value: 'dark', label: 'Dark' }]

// Settings of any editor that go with a background; only those it has are used.
export function backgroundSettings (kind, colors) {
  if (kind === 'keep') return {}
  const light = { textColor: '#2B2B2B', titleColor: '#2B2B2B', mutedTextColor: '#827D75', labelTextColor: '#000000', labelFillColor: '#FFFFFF', discColor: '#FFFFFF', groupColor: '#FFFFFF' }
  if (kind === 'paper') return { ...light, backgroundColor: '#F5F3EF', gridColor: '#E3DFD7' }
  if (kind === 'white') return { ...light, backgroundColor: '#FFFFFF', gridColor: '#E6E6E4' }
  const h = colors.length ? oklch(colors[0]).h : 80
  if (kind === 'tint') return { ...light, backgroundColor: fromOklch({ l: 0.958, c: 0.014, h }), gridColor: fromOklch({ l: 0.9, c: 0.016, h }), mutedTextColor: fromOklch({ l: 0.56, c: 0.02, h }) }
  return {
    backgroundColor: fromOklch({ l: 0.24, c: 0.014, h }),
    textColor: '#ECE8E1', titleColor: '#F5F2EC', mutedTextColor: '#A8A298', gridColor: fromOklch({ l: 0.36, c: 0.012, h }),
    labelTextColor: '#F1EEE8', labelFillColor: fromOklch({ l: 0.3, c: 0.014, h }),
    discColor: fromOklch({ l: 0.29, c: 0.014, h }), groupColor: fromOklch({ l: 0.36, c: 0.014, h })
  }
}

// ---- how good it is ----

// { level: 'good' | 'fair' | 'poor', difference, i, j, kind, faint } for colours on a background.
export function review (colors, background = '#F5F3EF') {
  if (colors.length < 2) return { level: 'good', difference: Infinity, i: -1, j: -1, kind: null, faint: 0 }
  const pair = closestPair(colors)
  const faint = colors.filter(c => contrastOf(c, background) < 1.35).length
  return { ...pair, level: pair.difference >= 9 ? 'good' : pair.difference >= 5 ? 'fair' : 'poor', faint }
}

// The main colours of an image, from its pixels (RGBA): clusters in OKLab, largest first.
export function mainColors (pixels, count = 10) {
  const points = []
  for (let i = 0; i < pixels.length; i += 4) if (pixels[i + 3] > 128) points.push([pixels[i], pixels[i + 1], pixels[i + 2]])
  if (!points.length) return []
  const hex = p => '#' + p.map(v => Math.round(v).toString(16).padStart(2, '0')).join('')
  const step = Math.max(1, Math.floor(points.length / 2500))
  const list = points.filter((_, i) => i % step === 0).map(p => { const { l, c, h } = oklch(hex(p)); return [l, c * Math.cos(h * Math.PI / 180), c * Math.sin(h * Math.PI / 180)] })
  const d2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2
  // Start far apart, so small but distinct colours are found too.
  const centres = [list[Math.floor(list.length / 2)]]
  while (centres.length < Math.min(count, list.length)) {
    let far = list[0]
    let most = -1
    list.forEach(p => { const d = Math.min(...centres.map(c => d2(p, c))); if (d > most) { most = d; far = p } })
    if (most < 0.0006) break
    centres.push(far)
  }
  let sizes = []
  for (let round = 0; round < 12; round++) {
    const sums = centres.map(() => [0, 0, 0, 0])
    list.forEach(p => { let k = 0; let m = Infinity; centres.forEach((c, i) => { const d = d2(p, c); if (d < m) { m = d; k = i } }); const s = sums[k]; s[0] += p[0]; s[1] += p[1]; s[2] += p[2]; s[3]++ })
    sums.forEach((s, i) => { if (s[3]) centres[i] = [s[0] / s[3], s[1] / s[3], s[2] / s[3]] })
    sizes = sums.map(s => s[3])
  }
  // Colourful ones first, as greys and browns tend to cover most of a photo.
  return centres.map((c, i) => ({ l: c[0], c: Math.hypot(c[1], c[2]), h: turn(Math.atan2(c[2], c[1]) * 180 / Math.PI), n: sizes[i] }))
    .filter(c => c.n > 0).sort((a, b) => (b.c * 6 + b.n / list.length) - (a.c * 6 + a.n / list.length)).map(c => fromOklch(c))
}
