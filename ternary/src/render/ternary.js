// Draws the ternary diagram (title, triangle with grid and arrows, trajectories,
// legend) into an SVG <g>. The editor canvas and the image export both use it, so
// what you see is what you export. Styling is set as attributes, never through page
// CSS. Look after the energy-mix ternary diagram this editor is modelled on.

import { lib } from '../../../shared/src/lib.js'
import { getSetting, isFiniteNumber } from '../model/schema.js'
import { fontStack, textWidth } from '../../../shared/src/svgText.js'
import { SHARES, computeDomain, makeGeometry, gridStep, tickValues, clipSegment } from './geometry.js'

export { fontStack }

// Darken/lighten a hex colour; used for the outline.
function tint (hex, t) {
  const c = /^#[0-9a-f]{6}$/i.test(hex) ? hex.slice(1) : 'E0DCD4'
  const rgb = [0, 2, 4].map(i => parseInt(c.slice(i, i + 2), 16))
  return `#${rgb.map(v => Math.max(0, Math.min(255, Math.round(v * (1 + t)))).toString(16).padStart(2, '0')).join('')}`
}

// Texts around the triangle and the direction arrows, for a given geometry.
function surroundings (geo, model, k, showArrows) {
  const { x0, x1, y0, y1 } = geo.bbox
  const tip = geo.polygon.reduce((a, b) => (b[1] > a[1] ? b : a), geo.polygon[0])
  const axis = corner => model.axes[corner] || {}
  const texts = []
  const arrows = []
  const add = (corner, part, x, y, anchor, extra) => { const str = axis(corner)[part]; if (str) texts.push({ corner, part, x, y, anchor, str, ...extra }) }
  const name = { size: 12.5, weight: 700, opacity: 1 }
  add('left', 'label', x0 - 22 * k, y0 - 12 * k, 'end', name)
  add('right', 'label', x1 + 22 * k, y0 - 12 * k, 'start', name)
  add('bottom', 'label', tip[0], tip[1] + 44 * k, 'middle', name)
  if (showArrows) {
    const hint = { size: 10, weight: 400, opacity: 0.5 }
    const w = x1 - x0
    const h = y1 - y0
    const arrow = (corner, from, to, anchor, lowShift, highShift) => {
      if (![...from, ...to].every(Number.isFinite)) return
      arrows.push({ from, to })
      add(corner, 'low', from[0] + lowShift[0] * k, from[1] + lowShift[1] * k, anchor, hint)
      add(corner, 'high', to[0] + highShift[0] * k, to[1] + highShift[1] * k, anchor, hint)
    }
    arrow('right', [x0 + 0.2 * w, y0 - 50 * k], [x0 + 0.8 * w, y0 - 50 * k], 'middle', [0, -10], [0, -10])
    // Side arrows run parallel to the edges, outside the region's outermost point.
    const sideLine = (from, to, outwardRight) => {
      const [p, q] = [geo.toScreen(from), geo.toScreen(to)]
      let nx = q[1] - p[1]
      let ny = -(q[0] - p[0])
      if ((nx > 0) !== outwardRight) { nx = -nx; ny = -ny }
      const len = Math.hypot(nx, ny) || 1
      nx /= len
      ny /= len
      const reach = Math.max(...geo.polygon.map(v => v[0] * nx + v[1] * ny)) + 44 * k
      return y => [(reach - y * ny) / nx, y]
    }
    const ya = y0 + 0.2 * h
    const yb = y0 + 0.8 * h
    const right = sideLine([1, 0], [0, 1], true)
    const left = sideLine([0, 1], [0, 0], false)
    arrow('bottom', right(ya), right(yb), 'start', [8, -6], [8, 18])
    arrow('left', left(yb), left(ya), 'end', [-8, 18], [-8, -6])
  }
  return { texts, arrows }
}

// The shown series by legend group, in table order.
function legendGroups (shown) {
  const groups = []
  shown.slice().sort((a, b) => a.index - b.index).forEach(ser => {
    const name = ser.group || ''
    let entry = groups.find(e => e.name === name)
    if (!entry) { entry = { name, items: [] }; groups.push(entry) }
    entry.items.push(ser)
  })
  return groups
}

// The legend's size and arrangement, or null without one. On the right it is one
// column `width` wide. At the top or bottom each group is a block under its heading,
// with its entries in columns of `rows`; blocks sit side by side in bands that fit
// the width, and the legend is `height` tall.
function legendPlan (doc, model, { W, k, margin, font }) {
  const shown = model.series.filter(x => x.visible && x.points.length)
  if (!getSetting(doc, 'showLegend') || !shown.length) return null
  const plan = { groups: legendGroups(shown), itemH: 18 * k, headH: 16 * k, groupGap: 10 * k, swatch: 27 * k }
  const position = getSetting(doc, 'legendPosition')
  if (position === 'right') {
    return { ...plan, position, width: Math.min(getSetting(doc, 'legendWidth'), W * 0.4), height: 0 }
  }
  const avail = Math.max(60, W - 2 * margin)
  const colGap = 22 * k
  const blockGap = 40 * k
  const bandGap = 14 * k
  const itemW = ser => plan.swatch + textWidth(ser.title, 11.5 * k, ser.highlight ? 700 : 400, font) + 2 * k
  const headW = name => (name ? textWidth(name.toUpperCase(), 9.5 * k, 400, font) + name.length * 0.08 * 9.5 * k : 0)
  const blocksFor = rows => plan.groups.map(g => {
    const cols = []
    for (let i = 0; i < g.items.length; i += rows) cols.push(g.items.slice(i, i + rows))
    const widths = cols.map(c => Math.min(avail, Math.max(...c.map(itemW))))
    const width = Math.min(avail, Math.max(headW(g.name), widths.reduce((a, b) => a + b, 0) + colGap * (widths.length - 1)))
    return { name: g.name, cols, widths, width }
  })
  const span = blocks => blocks.reduce((sum, b) => sum + b.width, 0) + blockGap * (blocks.length - 1)
  const most = Math.max(...plan.groups.map(g => g.items.length))
  const asked = Math.round(getSetting(doc, 'legendRows'))
  let rows = asked > 0 ? asked : most
  if (!(asked > 0)) {
    for (let r = 1; r < most; r++) if (span(blocksFor(r)) <= avail) { rows = r; break }
  }
  // Blocks that do not fit next to each other continue in a band below.
  const bands = []
  blocksFor(rows).forEach(block => {
    const band = bands[bands.length - 1]
    if (band && band.width + blockGap + block.width <= avail) { band.blocks.push(block); band.width += blockGap + block.width } else bands.push({ blocks: [block], width: block.width })
  })
  bands.forEach(band => {
    band.head = band.blocks.some(b => b.name) ? plan.headH : 0
    band.height = band.head + Math.max(...band.blocks.flatMap(b => b.cols.map(c => c.length))) * plan.itemH
  })
  const height = bands.reduce((sum, b, i) => sum + (i ? bandGap : 0) + b.height, 0)
  return { ...plan, position, width: 0, rows, bands, colGap, blockGap, bandGap, height }
}

// Where things go on the canvas: the triangle takes the space its title, texts,
// legend and the margin leave. Returns the geometry that fits.
function fitPlot (doc, model, domain, font) {
  const sc = getSetting(doc, 'scaleCanvas')
  const W = getSetting(doc, 'canvasWidth') / sc
  const H = getSetting(doc, 'canvasHeight') / sc
  const k = getSetting(doc, 'fontSize') / 13
  const margin = Math.max(0, getSetting(doc, 'margin'))
  const legend = legendPlan(doc, model, { W, k, margin, font })
  const legendW = legend?.position === 'right' ? legend.width + 24 * k : 0
  const below = legend?.position === 'bottom' ? legend.height + 16 * k : 0
  const arrows = getSetting(doc, 'showArrows')
  const stretch = getSetting(doc, 'zoom') === 'auto' && getSetting(doc, 'stretch') ? 2 : 1
  const title = getSetting(doc, 'title')
  const titleBottom = title ? getSetting(doc, 'titlePositionY') + getSetting(doc, 'titleFontSize') * 0.3 : 0
  const above = (arrows ? 72 : 32) * k
  // Below the title (when it is at the top) come the legend, if it goes on top, then the triangle.
  let start = title && titleBottom < H * 0.3 ? titleBottom + 30 * k : margin
  if (legend?.position === 'top') {
    legend.y = start
    start += legend.height + 38 * k
  }
  const top = Math.max(margin + above, start + above)
  const x0 = margin
  const x1 = W - legendW - margin
  let left = x0 + 30 * k
  let right = x1 - 30 * k
  const boxH = Math.max(80, H - top - 50 * k - margin - below)
  let geo
  for (let i = 0; i < 4; i++) {
    geo = makeGeometry(domain, { x: left, y: top, w: Math.max(80, right - left), h: boxH }, { stretch })
    // Give way to texts that would leave the canvas or run into the legend.
    let overLeft = 0
    let overRight = 0
    surroundings(geo, model, k, arrows).texts.forEach(t => {
      const w = textWidth(t.str, t.size * k, t.weight, font)
      const from = t.anchor === 'end' ? t.x - w : t.anchor === 'middle' ? t.x - w / 2 : t.x
      overLeft = Math.max(overLeft, x0 - from)
      overRight = Math.max(overRight, from + w - x1)
    })
    if (overLeft < 0.5 && overRight < 0.5) break
    left += overLeft
    right -= overRight
  }
  return { geo, layout: { W, H, k, top, margin, legend } }
}

// model: buildModel(doc). Returns { geometry, domain, legendItems, layout, seriesShown }.
// domain: keeps the axes as they are while a point is dragged (so nothing re-zooms).
export function drawTernary (gNode, doc, model, { domain: frozenDomain = null } = {}) {
  const d3 = lib.d3
  const s = key => getSetting(doc, key)
  const ink = s('textColor')
  const grid = s('gridColor')
  const halo = s('transparentBackground') ? 'none' : s('backgroundColor') // keeps year labels readable over lines
  const font = fontStack(s('font'))
  const root = d3.select(gNode).attr('font-family', font)
  root.selectAll(':scope > *').remove()

  const shown = model.series.filter(x => x.visible && x.points.length)
  const domain = frozenDomain || computeDomain(shown.flatMap(x => x.points.map(p => p.shares)), s('zoom') === 'auto')
  const { geo, layout } = fitPlot(doc, model, domain, font)
  const { W, k, top, margin, legend } = layout
  const step = gridStep(domain, s('gridStep'))
  const size = f => Math.round(f * k * 10) / 10

  // Arrowhead marker (kept inside the group so exports carry it).
  const defs = root.append('defs')
  defs.append('marker').attr('id', 'ternary-arrow').attr('viewBox', '0 0 10 10').attr('refX', 9).attr('refY', 5)
    .attr('markerWidth', 7).attr('markerHeight', 7).attr('orient', 'auto-start-reverse')
    .append('path').attr('d', 'M0 1.5L9 5L0 8.5').attr('fill', 'none').attr('stroke', ink).attr('stroke-opacity', 0.4).attr('stroke-width', 1.2)

  const text = (parent, x, y, str, { size: fsize = 10, weight = 400, anchor = 'start', opacity = 1 } = {}) =>
    parent.append('text').attr('x', x).attr('y', y).attr('font-size', size(fsize)).attr('font-weight', weight)
      .attr('text-anchor', anchor).attr('fill', ink).attr('fill-opacity', opacity).text(str)

  const titleStr = s('title')
  if (titleStr) {
    root.append('text').attr('class', 'diagram-title').attr('x', s('titlePositionX')).attr('y', s('titlePositionY'))
      .attr('font-size', s('titleFontSize')).attr('font-weight', 400).attr('fill', s('titleColor')).text(titleStr)
  }

  // ---- triangle ----
  const frame = root.append('g').attr('class', 'frame')
  // Lines of constant share, and where each tick label sits on its line.
  const axes = {
    right: { segment: v => [[v, 0], [v, 1 - v]], pick: (a, b) => a[1] <= b[1], anchor: 'middle', dx: 0, dy: -12 * k },
    bottom: { segment: v => [[0, v], [1 - v, v]], pick: (a, b) => a[0] + a[1] / 2 >= b[0] + b[1] / 2, anchor: 'start', dx: 9 * k, dy: 4 * k },
    left: { segment: v => [[1 - v, 0], [0, 1 - v]], pick: (a, b) => a[0] + a[1] / 2 <= b[0] + b[1] / 2, anchor: 'end', dx: -9 * k, dy: 4 * k }
  }
  SHARES.forEach(share => {
    const axis = axes[share]
    tickValues(domain, share, step).forEach(v => {
      const seg = clipSegment(domain, ...axis.segment(v))
      if (!seg) return
      const [p, q] = seg.map(geo.toScreen)
      frame.append('line').attr('x1', p[0]).attr('y1', p[1]).attr('x2', q[0]).attr('y2', q[1]).attr('stroke', grid).attr('stroke-width', 1)
      const end = geo.toScreen(axis.pick(seg[0], seg[1]) ? seg[0] : seg[1])
      text(frame, end[0] + axis.dx, end[1] + axis.dy, String(Math.round(v * 100)), { size: 10, anchor: axis.anchor, opacity: 0.55 })
    })
  })
  const outline = geo.polygon
  frame.append('path').attr('d', `M${outline.map(p => p.join(',')).join('L')}Z`).attr('fill', 'none').attr('stroke', tint(grid, -0.12)).attr('stroke-width', 1)

  const around = surroundings(geo, model, k, s('showArrows'))
  around.arrows.forEach(({ from, to }) => {
    frame.append('line').attr('x1', from[0]).attr('y1', from[1]).attr('x2', to[0]).attr('y2', to[1])
      .attr('stroke', ink).attr('stroke-opacity', 0.28).attr('stroke-width', 1).attr('marker-end', 'url(#ternary-arrow)')
  })
  around.texts.forEach(t => text(frame, t.x, t.y, t.str, t).attr('class', 'axis-text').attr('data-corner', t.corner).attr('data-part', t.part))

  // ---- trajectories ----
  const seriesLayer = root.append('g').attr('class', 'series-layer')
  const lw = s('lineWidth')
  const dot = s('dotSize')
  const line = d3.line().curve(s('curve') === 'straight' ? d3.curveLinear : d3.curveCatmullRom.alpha(0.5))
  const anyHighlight = shown.some(x => x.highlight)
  const ordered = [...shown].sort((a, b) => (b.dashed - a.dashed) || (a.highlight - b.highlight) || (a.index - b.index))
  ordered.forEach(ser => {
    const g = seriesLayer.append('g').attr('class', 'series').attr('data-uid', ser.uid)
    const pos = ser.points.map(p => geo.at(p.shares))
    const width = ser.highlight ? lw * 1.8 : lw
    const opacity = ser.highlight || !anyHighlight ? 0.95 : 0.8
    if (pos.length > 1) {
      g.append('path').attr('class', 'line').attr('d', line(pos)).attr('fill', 'none').attr('stroke', ser.color).attr('stroke-width', width)
        .attr('stroke-opacity', opacity).attr('stroke-linecap', 'round').attr('stroke-linejoin', 'round')
        .attr('stroke-dasharray', ser.dashed ? `${5 * Math.max(1, lw / 1.6)} ${3 * Math.max(1, lw / 1.6)}` : null)
    }
    const dotR = (ser.highlight ? 1.2 : 1) * dot
    ser.points.forEach((p, i) => {
      const last = i === ser.points.length - 1
      const r = last ? dotR * 1.75 : dotR
      if (r <= 0) return
      g.append('circle').attr('class', 'point').attr('cx', pos[i][0]).attr('cy', pos[i][1]).attr('r', r)
        .attr('fill', ser.color).attr('stroke', '#ffffff').attr('stroke-width', last ? 1.5 : 1)
    })
    const ring = s('markYear')
    if (ser.highlight && ring > 0) {
      const i = ser.points.findIndex(p => p.year === ring)
      if (i >= 0) g.append('circle').attr('class', 'ring').attr('cx', pos[i][0]).attr('cy', pos[i][1]).attr('r', 7 * k).attr('fill', 'none').attr('stroke', ser.color).attr('stroke-width', 1.5)
    }
    const labelMode = s('yearLabels')
    if (labelMode === 'all' || (labelMode === 'highlighted' && ser.highlight)) {
      ser.points.forEach((p, i) => {
        const first = i === 0
        const lastP = i === ser.points.length - 1
        if (ser.dashed && !(first || lastP || (isFiniteNumber(p.year) && p.year % 10 === 0))) return
        const ringed = ser.highlight && ring > 0 && p.year === ring
        text(g, pos[i][0] + (ringed ? 10 : 7) * k, pos[i][1] - (ringed ? 8 : 5) * k, p.label, { size: 9.5, opacity: 0.65 })
          .attr('paint-order', 'stroke').attr('stroke', halo).attr('stroke-width', 3 * k).attr('stroke-linejoin', 'round')
      })
    }
  })

  // ---- legend ----
  const legendItems = []
  if (legend) {
    const lg = root.append('g').attr('class', 'legend').attr('data-position', legend.position)
    const { itemH, headH, groupGap, swatch } = legend
    const heading = (name, x, y, width) => {
      const t = text(lg, x, y + 9 * k, name.toUpperCase(), { size: 9.5, weight: 400, opacity: 0.55 }).attr('letter-spacing', '0.08em')
      fitText(t.node(), width)
    }
    const item = (ser, x, y, width) => {
      const cy = y + itemH / 2
      lg.append('line').attr('x1', x).attr('x2', x + 20 * k).attr('y1', cy).attr('y2', cy).attr('stroke', ser.color)
        .attr('stroke-width', ser.highlight ? 3 : 2).attr('stroke-dasharray', ser.dashed ? '4 3' : null).attr('stroke-linecap', 'round')
      lg.append('circle').attr('cx', x + 10 * k).attr('cy', cy).attr('r', 3 * k).attr('fill', ser.color)
      const t = text(lg, x + swatch, cy + 4 * k, ser.title, { size: 11.5, weight: ser.highlight ? 700 : 400, opacity: ser.highlight ? 1 : 0.85 }).attr('class', 'legend-text').attr('data-uid', ser.uid)
      fitText(t.node(), width - swatch)
      legendItems.push({ uid: ser.uid, x, y, w: width, h: itemH })
    }
    if (legend.position !== 'right') {
      // Above the triangle, or under it and its bottom corner name; each band centred
      // on the triangle.
      const centre = (geo.bbox.x0 + geo.bbox.x1) / 2
      let y = legend.position === 'top' ? legend.y : geo.bbox.y1 + 50 * k + 16 * k
      legend.bands.forEach((band, i) => {
        if (i) y += legend.bandGap
        let x = Math.max(margin, Math.min(W - margin - band.width, centre - band.width / 2))
        band.blocks.forEach(block => {
          if (block.name) heading(block.name, x, y, block.width)
          let cx = x
          block.cols.forEach((col, c) => {
            col.forEach((ser, r) => item(ser, cx, y + band.head + r * itemH, block.widths[c]))
            cx += block.widths[c] + legend.colGap
          })
          x += block.width + legend.blockGap
        })
        y += band.height
      })
    } else {
      const x = W - margin - legend.width
      let y = top
      legend.groups.forEach(grp => {
        if (grp.name) { heading(grp.name, x, y, legend.width); y += headH }
        grp.items.forEach(ser => { item(ser, x, y, legend.width); y += itemH })
        y += groupGap
      })
    }
  }

  return { geometry: geo, domain, legendItems, layout, seriesShown: shown }
}

// Shorten text with an ellipsis until it fits the given width.
function fitText (node, width) {
  if (!node || node.getComputedTextLength() <= width) return
  let s = node.textContent
  while (s.length > 1 && node.getComputedTextLength() > width) {
    s = s.slice(0, -1)
    node.textContent = `${s.trimEnd()}…`
  }
}
