// Patterned fills: stripes, hatching, dots and so on over a colour. A row of a table (a
// carrier, a series, a flow) names one in its `pattern` column, and optionally a second
// colour for it in `patterncolor`. Drawn as SVG <pattern>s, whose size and strength are
// settings of the diagram.

import { lib } from './lib.js'
import { mixColor, isDark } from './color.js'

// Each gives a tile of w × h for a spacing s and a line width t: lines (`d`) or shapes (`fill`).
const circle = (x, y, r) => `M${x - r},${y}a${r},${r} 0 1 0 ${2 * r},0a${r},${r} 0 1 0 ${-2 * r},0Z`
const line = (turn, d) => (s, t) => ({ w: s, h: s, turn, stroke: t, d: d(s) })
const TILES = {
  // Bands of two colours, equally wide.
  stripes: s => { const w = s * 1.6; return { w, h: w, turn: 45, fill: true, d: `M0,-1H${w / 2}V${w + 1}H0Z` } },
  diagonal: line(45, s => `M${s / 2},-1V${s + 1}`),
  'diagonal-down': line(-45, s => `M${s / 2},-1V${s + 1}`),
  crosshatch: line(45, s => `M${s / 2},-1V${s + 1}M-1,${s / 2}H${s + 1}`),
  vertical: line(0, s => `M${s / 2},-1V${s + 1}`),
  horizontal: line(0, s => `M-1,${s / 2}H${s + 1}`),
  grid: line(0, s => `M${s / 2},-1V${s + 1}M-1,${s / 2}H${s + 1}`),
  dots: (s, t) => ({ w: s, h: s, turn: 45, fill: true, d: circle(s / 2, s / 2, Math.min(s * 0.46, t * 0.85)) }),
  rings: (s, t) => ({ w: s * 1.2, h: s * 1.2, turn: 45, stroke: t * 0.7, d: circle(s * 0.6, s * 0.6, s * 0.32) }),
  dashes: (s, t) => { const w = s * 2; const h = s * 1.2; return { w, h, turn: 0, stroke: t, d: `M${w * 0.06},${h * 0.25}H${w * 0.56}M${-w * 0.44},${h * 0.75}H${w * 0.06}M${w * 0.56},${h * 0.75}H${w * 1.06}` } },
  zigzag: (s, t) => { const w = s * 1.5; const h = s * 1.1; const y = [h * 0.75, h * 0.25]; return { w, h, turn: 0, stroke: t * 0.9, d: `M${-w / 2},${y[1]}L0,${y[0]}L${w / 2},${y[1]}L${w},${y[0]}L${w * 1.5},${y[1]}` } },
  waves: (s, t) => { const w = s * 2; const h = s; const m = h / 2; return { w, h, turn: 0, stroke: t * 0.9, d: `M${-w / 2},${m}Q${-w / 4},${m + h * 0.55} 0,${m}T${w / 2},${m}T${w},${m}T${w * 1.5},${m}` } },
  checks: s => { const c = s * 0.7; return { w: c * 2, h: c * 2, turn: 0, fill: true, d: `M0,0h${c}v${c}h${-c}ZM${c},${c}h${c}v${c}h${-c}Z` } }
}

export const PATTERN_NAMES = Object.keys(TILES)
const LABELS = { stripes: 'Two-colour stripes', diagonal: 'Diagonal', 'diagonal-down': 'Diagonal, down', crosshatch: 'Crosshatch', vertical: 'Vertical', horizontal: 'Horizontal', grid: 'Grid', dots: 'Dots', rings: 'Rings', dashes: 'Dashes', zigzag: 'Zigzag', waves: 'Waves', checks: 'Checks' }
export const patternLabel = name => LABELS[name] || name

const ALIASES = {
  '': 'none plain solid geen effen nee no false',
  stripes: 'striped stripe strepen gestreept tweekleurig two-colour two-color',
  diagonal: 'hatch hatched hatching arcering gearceerd lines diagonaal',
  crosshatch: 'cross cross-hatch kruisarcering gekruist',
  horizontal: 'horizontaal',
  vertical: 'verticaal',
  grid: 'raster ruit',
  dots: 'dotted stippen gestippeld punten',
  rings: 'circles cirkels ringen',
  dashes: 'dashed streepjes',
  waves: 'wave golven',
  checks: 'checker checkerboard blokjes'
}
const BY_NAME = new Map(PATTERN_NAMES.map(n => [n, n]))
Object.entries(ALIASES).forEach(([name, words]) => words.split(' ').forEach(w => BY_NAME.set(w, name)))

const text = v => String(v ?? '').trim()
const normal = v => text(v).toLowerCase().replace(/[\s_]+/g, '-')

// The pattern a value names; '' for a plain fill, null when there is no such pattern.
export function patternName (value) {
  const v = normal(value)
  if (!v) return ''
  return BY_NAME.has(v) ? BY_NAME.get(v) : null
}

// The first of these values that says anything, e.g. a flow's own pattern, then its carrier's.
export const patternOf = (...values) => patternName(values.find(v => text(v) !== '')) || ''

const hexOf = value => { const v = text(value); return /^#[0-9a-f]{6}$/i.test(v) ? v : /^#[0-9a-f]{3}$/i.test(v) ? '#' + v.slice(1).split('').map(c => c + c).join('') : null }

// The fill of something: { pattern, mark }, from rows that say so, the first one first (e.g. a
// flow, then its carrier). mark: a second colour, or null for the automatic one. A row that
// names a pattern keeps the second colour of the rows after it out.
export function fillOf (...rows) {
  let mark = null
  for (const r of rows) {
    if (!r) continue
    mark = mark || hexOf(r.patterncolor)
    if (text(r.pattern) !== '') return { pattern: patternName(r.pattern) || '', mark: patternName(r.pattern) ? mark : null }
  }
  return { pattern: '', mark: null }
}

export const unknownPatterns = (rows, key = 'pattern') => rows.filter(r => patternName(r[key]) === null)

// Issues about them, for validate.js. describe(row): what the row is, e.g. 'carrier "gas"'.
export const patternIssues = (rows, kind, describe) => [
  ...unknownPatterns(rows).map(r => ({ key: `pattern-${r._uid}`, severity: 'warning', message: `The pattern "${r.pattern}" of ${describe(r)} is not a known pattern.`, targets: [{ kind, uid: r._uid }] })),
  ...rows.filter(r => text(r.patterncolor) !== '' && !hexOf(r.patterncolor)).map(r => ({ key: `patterncolor-${r._uid}`, severity: 'warning', message: `The second colour of ${describe(r)} is not a hex code: "${r.patterncolor}".`, targets: [{ kind, uid: r._uid }] }))
]

export const PATTERN_OPTIONS = { id: 'dl-patterns', options: [...PATTERN_NAMES, 'none'].map(value => ({ value })) }

export const PATTERN_SETTINGS = [
  { key: 'patternStyle', group: 'fills', type: 'select', default: 'light', label: 'Draw patterns as', options: [{ value: 'light', label: 'Light lines on the colour' }, { value: 'dark', label: 'Dark lines on the colour' }, { value: 'ground', label: 'The colour on a light ground' }] },
  { key: 'patternSize', group: 'fills', type: 'number', default: 8, label: 'Spacing', suffix: 'px', min: 3, max: 60, step: 1 },
  { key: 'patternWeight', group: 'fills', type: 'number', default: 28, label: 'Line width', suffix: '%', min: 5, max: 80, step: 1, help: 'Of the spacing.' }
]
export const PATTERN_HELP = `Optional, a patterned fill: ${PATTERN_NAMES.join(', ')}; none`
export const PATTERN_COLOR_HELP = 'Optional: the second colour of the pattern, as a hex code, e.g. of the other carrier in a mix'

const hex = color => lib.d3.color(color).formatHex()

// paper: what tints go towards, white or a dark background.
function inkFor (color, style, mark = null, paper = '#FFFFFF') {
  if (mark) return { ground: color, mark }
  if (style === 'ground') return { ground: mixColor(color, paper, 0.8), mark: color }
  if (style === 'dark') return { ground: color, mark: mixColor(color, '#1F1D1A', 0.42) }
  // On light colours light lines would hardly show: those get dark ones.
  return { ground: color, mark: lib.d3.lab(color).l > 80 ? mixColor(color, '#1F1D1A', 0.34) : mixColor(color, '#FFFFFF', 0.5) }
}

function appendPattern (defs, id, name, { ground, mark }, size, weight) {
  const tile = TILES[name](size, size * weight)
  const p = defs.append('pattern').attr('id', id).attr('patternUnits', 'userSpaceOnUse').attr('width', tile.w).attr('height', tile.h)
  if (tile.turn) p.attr('patternTransform', `rotate(${tile.turn})`)
  p.append('rect').attr('width', tile.w).attr('height', tile.h).attr('fill', ground)
  const path = p.append('path').attr('d', tile.d)
  if (tile.fill) path.attr('fill', mark)
  else path.attr('fill', 'none').attr('stroke', mark).attr('stroke-width', Math.round(tile.stroke * 100) / 100)
}

// What the shapes of a drawing are filled with: paint(color, pattern) is a colour, or a
// reference to a pattern it has added to `defs`.
//   paint(color, pattern, mark)            with a second colour, e.g. for a mix of two carriers
//   paint.light(color, pattern, t, mark)   a tint of the colour, with the pattern in the colour itself
//   paint.ground(color, pattern, mark)     the colour behind the lines, for texts and icons on it
export function createPaint (defs, get) {
  const style = get('patternStyle')
  const size = get('patternSize')
  const weight = get('patternWeight') / 100
  const made = new Set()
  const background = get('backgroundColor')
  const paper = background && !get('transparentBackground') && isDark(background) ? background : '#FFFFFF'
  function use (kind, name, inks) {
    const id = `fill-${kind}-${name}-${hex(inks.ground).slice(1)}-${hex(inks.mark).slice(1)}`
    if (!made.has(id)) {
      made.add(id)
      appendPattern(defs, id, name, { ground: hex(inks.ground), mark: hex(inks.mark) }, size, weight)
    }
    return `url(#${id})`
  }
  const paint = (color, pattern, mark) => (pattern ? use(mark ? 'mix' : style, pattern, inkFor(color, style, mark, paper)) : color)
  paint.light = (color, pattern, t = 0.72, mark = null) => {
    const ground = mixColor(color, paper, t)
    return pattern ? use('tint', pattern, { ground, mark: mixColor(mark || color, paper, mark ? 0.4 : 0.2) }) : ground
  }
  paint.ground = (color, pattern, mark) => (pattern ? inkFor(color, style, mark, paper).ground : color)
  return paint
}

// Behind texts and icons on a patterned fill, so its lines don't run through them.
export function drawPlate (parent, x0, y0, x1, y1, fill, r = 3) {
  return parent.append('rect').attr('x', Math.round(x0 * 10) / 10).attr('y', Math.round(y0 * 10) / 10).attr('width', Math.round((x1 - x0) * 10) / 10).attr('height', Math.round((y1 - y0) * 10) / 10)
    .attr('rx', r).attr('fill', fill).attr('fill-opacity', 0.9)
}

// A small sample of a pattern for buttons and lists, as an <svg> element.
let samples = 0
export function patternSample (name, color, { width = 40, height = 22, style = 'light', size = 7, weight = 0.28, mark = null } = {}) {
  const svg = lib.d3.create('svg').attr('width', width).attr('height', height).attr('class', 'pattern-sample').attr('aria-hidden', 'true')
  let fill = color
  if (name) {
    const id = `sample-${++samples}`
    appendPattern(svg.append('defs'), id, name, inkFor(color, style, mark), size, weight)
    fill = `url(#${id})`
  }
  svg.append('rect').attr('width', width).attr('height', height).attr('fill', fill)
  return svg.node()
}
