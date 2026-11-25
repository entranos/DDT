// Colours derived from other colours.

import { lib } from './lib.js'

// Icons are white on all but light fills; texts need more contrast, so they turn dark sooner.
export function inkOn (fill, { text = false } = {}) {
  const c = lib.d3.rgb(fill)
  if (!text) return (0.299 * c.r + 0.587 * c.g + 0.114 * c.b) / 255 > 0.72 ? '#2B2B2B' : '#FFFFFF'
  return contrast('#FFFFFF', fill) >= 3 ? '#FFFFFF' : '#2B2B2B'
}

// Softer version of a strong colour: less chroma, and lightness pulled into a middle
// band so near-blacks become soft greys and brights lose their glare. Done in HCL so
// hue and the relative order of colours are kept.
const SOFT = { chroma: 0.7, lightFloor: 30, lightSpan: 0.58 }
export function softColor (color) {
  const c = lib.d3.hcl(color)
  if (Number.isNaN(c.h)) c.h = 0
  c.c = (c.c || 0) * SOFT.chroma
  c.l = SOFT.lightFloor + c.l * SOFT.lightSpan
  return c.formatHex()
}

// A richer version of a colour, for highlighting: more chroma and a touch darker;
// greys, which have no chroma to add, just get darker.
export function vividColor (color) {
  const c = lib.d3.hcl(color)
  if (!(c.c > 8)) {
    c.l = Math.max(0, c.l - 12)
    return c.formatHex()
  }
  c.c = Math.min(c.c * 1.7, c.c + 38)
  c.l = Math.max(0, c.l - 5)
  return c.formatHex()
}

const luminance = color => {
  const c = lib.d3.rgb(color)
  const [r, g, b] = [c.r, c.g, c.b].map(v => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4 })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function contrast (a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

export const isDark = color => lib.d3.lab(color).l < 45

// A colour dark enough to read as text on a background (or on a dark one light enough),
// keeping its hue.
export function readableColor (color, background = '#FFFFFF', min = 4.2) {
  const c = lib.d3.hcl(color)
  if (Number.isNaN(c.h)) c.h = 0
  const step = isDark(background) ? 2.5 : -2.5
  for (let i = 0; i < 40 && contrast(c.formatHex(), background) < min && c.l > 4 && c.l < 98; i++) c.l += step
  return c.formatHex()
}

export const mixColor = (a, b, t) => lib.d3.interpolateLab(a, b)(t)
