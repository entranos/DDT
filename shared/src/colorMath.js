// Colour arithmetic for making and checking palettes: OKLab and OKLCH (Björn Ottosson),
// differences between colours, and how they look to colour-blind people (Machado et al. 2009).
// No libraries, so it also runs under Node.

const clamp = (v, a, b) => Math.max(a, Math.min(b, v))

export function hexToRgb (hex) {
  const v = String(hex).trim().replace(/^#/, '')
  const full = v.length === 3 ? v.split('').map(c => c + c).join('') : v
  return [0, 2, 4].map(i => parseInt(full.slice(i, i + 2), 16) / 255)
}
export const rgbToHex = rgb => '#' + rgb.map(v => Math.round(clamp(v, 0, 1) * 255).toString(16).padStart(2, '0')).join('').toUpperCase()
export const isHex = v => /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.test(String(v ?? '').trim())
export const toHex = v => rgbToHex(hexToRgb(v))

const toLinear = v => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
const fromLinear = v => (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055)

function linearToOklab ([r, g, b]) {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s]
}
function oklabToLinear ([L, a, b]) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s]
}

// Remembered, as palettes compare the same colours over and over.
const seen = new Map()
export function oklab (hex) {
  let v = seen.get(hex)
  if (v) return v
  v = linearToOklab(hexToRgb(hex).map(toLinear))
  if (seen.size > 20000) seen.clear()
  seen.set(hex, v)
  return v
}

// { l: 0…1, c: 0…0.37, h: degrees }
export function oklch (hex) {
  const [l, a, b] = oklab(hex)
  return { l, c: Math.hypot(a, b), h: ((Math.atan2(b, a) * 180 / Math.PI) % 360 + 360) % 360 }
}

// The nearest colour that can be shown: chroma is lowered until it fits.
export function fromOklch ({ l, c, h }) {
  const L = clamp(l, 0, 1)
  const rad = h * Math.PI / 180
  const at = k => oklabToLinear([L, k * Math.cos(rad), k * Math.sin(rad)])
  const fits = rgb => rgb.every(v => v >= -0.0005 && v <= 1.0005)
  let k = Math.max(0, c)
  if (!fits(at(k))) {
    let lo = 0
    let hi = k
    for (let i = 0; i < 18; i++) { const m = (lo + hi) / 2; if (fits(at(m))) lo = m; else hi = m }
    k = lo
  }
  return rgbToHex(at(k).map(v => fromLinear(clamp(v, 0, 1))))
}

// Somewhere between two colours, in OKLab.
export function mixOklab (a, b, t) {
  const x = oklab(a)
  const y = oklab(b)
  return rgbToHex(oklabToLinear(x.map((v, i) => v + (y[i] - v) * t)).map(v => fromLinear(clamp(v, 0, 1))))
}

// How different two colours look: below 8 they are hard to tell apart in a diagram.
export function difference (a, b) {
  const x = oklab(a)
  const y = oklab(b)
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]) * 100
}

// Matrices on linear RGB.
export const VISION = {
  protan: { label: 'Red-blind', matrix: [0.152286, 1.052583, -0.204868, 0.114503, 0.786281, 0.099216, -0.003882, -0.048116, 1.051998] },
  deutan: { label: 'Green-blind', matrix: [0.367322, 0.860646, -0.227968, 0.280085, 0.672501, 0.047413, -0.01182, 0.04294, 0.968881] },
  tritan: { label: 'Blue-blind', matrix: [1.255528, -0.076749, -0.178779, -0.078411, 0.930809, 0.147602, 0.004733, 0.691367, 0.3039] },
  grey: { label: 'Greys', matrix: [0.2126, 0.7152, 0.0722, 0.2126, 0.7152, 0.0722, 0.2126, 0.7152, 0.0722] }
}
export function seenAs (hex, kind) {
  const m = VISION[kind].matrix
  const rgb = hexToRgb(hex).map(toLinear)
  return rgbToHex([0, 1, 2].map(r => fromLinear(clamp(rgb[0] * m[r * 3] + rgb[1] * m[r * 3 + 1] + rgb[2] * m[r * 3 + 2], 0, 1))))
}

const luminance = hex => { const [r, g, b] = hexToRgb(hex).map(toLinear); return 0.2126 * r + 0.7152 * g + 0.0722 * b }
export function contrastOf (a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

// The pair that is hardest to tell apart: { difference, i, j, kind } (kind: null for normal vision).
export function closestPair (colors, kinds = ['protan', 'deutan']) {
  let worst = { difference: Infinity, i: -1, j: -1, kind: null }
  ;[null, ...kinds].forEach(kind => {
    const seen = kind ? colors.map(c => seenAs(c, kind)) : colors
    for (let i = 0; i < seen.length; i++) {
      for (let j = i + 1; j < seen.length; j++) {
        // Colour-blind readers get help from texts and order, so a difference counts a bit higher.
        const d = difference(seen[i], seen[j]) * (kind ? 1.5 : 1)
        if (d < worst.difference) worst = { difference: d, i, j, kind }
      }
    }
  })
  return worst
}
