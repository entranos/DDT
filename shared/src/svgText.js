// Text and icons in a diagram's SVG, shared by every editor's drawing code.

export const DEFAULT_FONT_STACK = 'Roboto, "Helvetica Neue", Helvetica, Arial, sans-serif'

export function fontStack (font) {
  const name = String(font || '').trim()
  if (!name) return DEFAULT_FONT_STACK
  const quoted = /\s/.test(name) && !/^["'].*["']$/.test(name) ? `"${name}"` : name
  return `${quoted}, ${DEFAULT_FONT_STACK}`
}

let measureCtx = null
export function textWidth (str, px, weight, font) {
  if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d')
  measureCtx.font = `${weight} ${px}px ${font}`
  return measureCtx.measureText(str).width
}

// The longest start of `str` that fits, with an ellipsis; '' when not even `min` letters do.
export function fitText (str, width, px, weight, font, min = 2) {
  if (textWidth(str, px, weight, font) <= width) return str
  let lo = 0
  let hi = str.length
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2)
    if (textWidth(`${str.slice(0, mid).trimEnd()}…`, px, weight, font) <= width) lo = mid
    else hi = mid - 1
  }
  return lo >= min ? `${str.slice(0, lo).trimEnd()}…` : ''
}

export const round1 = v => Math.round(v * 10) / 10

// A line icon from a 24×24 path, drawn `size` wide with strokes of `width`.
export function drawIcon (parent, path, x, y, size, stroke, width) {
  return parent.append('path').attr('d', path).attr('transform', `translate(${round1(x)},${round1(y)}) scale(${Math.round(size / 24 * 1000) / 1000})`)
    .attr('fill', 'none').attr('stroke', stroke).attr('stroke-width', round1(width * 24 / size)).attr('stroke-linecap', 'round').attr('stroke-linejoin', 'round')
}
