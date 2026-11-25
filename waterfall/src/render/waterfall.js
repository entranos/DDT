// Draws the waterfall diagrams (title, legend, axes, totals, steps, labels) into an SVG
// <g>. The editor canvas and the image export both use it, so what you see is what you
// export. Styling is set as attributes, never through page CSS.
// After the waterfall diagrams of the viewer this editor is modelled on.

import { lib } from '../../../shared/src/lib.js'
import { getSetting } from '../model/schema.js'
import { inkOn, isDark, mixColor, readableColor } from '../../../shared/src/color.js'
import { formatAuto, formatNumber } from '../../../shared/src/format.js'
import { fontStack, textWidth, drawIcon, round1 } from '../../../shared/src/svgText.js'
import { drawHeading } from '../../../shared/src/heading.js'
import { createPaint, drawPlate } from '../../../shared/src/patterns.js'
import { layoutColumns, layoutRows } from './layout.js'

export { fontStack }

const BASE = 13 // text size all other sizes relate to
const MINUS = '−'

export const unitOf = doc => String(getSetting(doc, 'unit') || '').trim()

export function formatAmount (doc, value, { unit = true } = {}) {
  const n = formatAuto(value, getSetting(doc, 'decimals')).replace(/^-/, MINUS)
  return unit && unitOf(doc) ? `${n} ${unitOf(doc)}` : n
}

// With its sign; '' when it rounds to nothing.
export function formatChange (doc, value, { unit = false } = {}) {
  const n = formatAuto(Math.abs(value), getSetting(doc, 'decimals'))
  if (!/[1-9]/.test(n)) return ''
  return `${value < 0 ? MINUS : '+'}${n}${unit && unitOf(doc) ? ` ${unitOf(doc)}` : ''}`
}

export const formatPercent = share => `${share < 0 ? MINUS : '+'}${formatNumber(Math.abs(share) * 100, 0)}%`

// Words wrapped to a width, at most `max` lines.
function wrap (str, width, px, weight, font, max = 4) {
  const lines = []
  let line = ''
  String(str).split(/\s+/).filter(Boolean).forEach(word => {
    const next = line ? `${line} ${word}` : word
    if (line && textWidth(next, px, weight, font) > width) { lines.push(line); line = word } else line = next
  })
  if (line) lines.push(line)
  return lines.slice(0, max)
}

// frozen: the vertical layout of an earlier drawing, so axes stay put while a bar is dragged.
// Returns every drawn item with its box in diagram units, for the editor's overlay:
//   { paint, columns, vertical, bars, segments, totals, moments, heads, texts, subtitle, legend, perUnit, fits, area }
export function drawWaterfall (gNode, doc, model, { frozen = null } = {}) {
  const d3 = lib.d3
  const s = key => getSetting(doc, key)
  const sc = s('scaleCanvas')
  const W = s('canvasWidth') / sc
  const H = s('canvasHeight') / sc
  const k = s('fontSize') / BASE
  const margin = s('margin')
  const ink = s('textColor')
  const muted = s('mutedTextColor')
  const gridColor = s('gridColor')
  const background = s('transparentBackground') ? '#FFFFFF' : s('backgroundColor')
  const font = fontStack(s('font'))
  const root = d3.select(gNode).attr('font-family', font)
  root.selectAll(':scope > *').remove()
  const defs = root.append('defs')
  const paint = createPaint(defs, s)

  const text = (parent, x, y, str, { px = 11 * k, weight = 400, anchor = 'start', fill = ink } = {}) =>
    parent.append('text').attr('x', round1(x)).attr('y', round1(y)).attr('font-size', round1(px)).attr('font-weight', weight)
      .attr('text-anchor', anchor).attr('fill', fill).text(str)
  const line = (parent, x0, y0, x1, y1, stroke, { width = 1, opacity = 1 } = {}) =>
    parent.append('line').attr('x1', round1(x0)).attr('y1', round1(y0)).attr('x2', round1(x1)).attr('y2', round1(y1)).attr('stroke', stroke).attr('stroke-width', width).attr('stroke-opacity', opacity)
  const out = { paint, columns: null, vertical: null, bars: [], segments: [], totals: [], moments: [], heads: [], texts: [], subtitle: null, legend: [], perUnit: null, fits: true, area: null, k }

  const heading = drawHeading(root, { get: s, W, H, k, margin, ink, muted, font, items: model.legend, paint })
  const { top, bottom } = heading
  out.subtitle = heading.subtitle
  out.legend = heading.legend
  const n = model.diagrams.length
  if (!n || !model.moments.length) return out

  // ---- columns ----
  const axisPx = 11 * k
  const tickTexts = model.diagrams.flatMap(d => d3.scaleLinear().domain([Math.min(0, d.min), Math.max(d.max, 1e-9)]).ticks(5)).map(v => formatAuto(v).replace(/^-/, MINUS))
  const tickW = s('showAxis') ? Math.max(...tickTexts.map(t => textWidth(t, axisPx, 400, font))) + 10 * k : 0
  const headPx = 14 * k
  const notePx = 11.5 * k
  // Names of the diagrams stand in the column of the axis, above its numbers.
  const unit = s('showAxis') ? unitOf(doc) : ''
  const nameMax = Math.max(tickW - 10 * k, 104 * k)
  const nameTexts = model.diagrams.map(d => ({
    title: d.title ? wrap(d.title, nameMax, headPx, 500, font, 3) : [],
    subtitle: wrap([d.subtitle, unit].filter(Boolean).join(d.subtitle && unit ? ', ' : ''), nameMax, notePx, 400, font, 3)
  }))
  const nameWidth = Math.max(0, ...nameTexts.flatMap(g => [...g.title.map(t => textWidth(t, headPx, 500, font)), ...g.subtitle.map(t => textWidth(t, notePx, 400, font))]))
  const netPx = 11 * k
  const allNet = s('showNet') ? model.diagrams.flatMap(d => d.periods.map(p => formatChange(doc, p.change))) : []
  const netWidth = allNet.length ? Math.max(34 * k, Math.max(...allNet.map(t => textWidth(t, netPx, 500, font))) + 12 * k) : 0
  const columns = layoutColumns(model.moments, model.columns, {
    x0: margin + Math.max(nameWidth ? nameWidth + 14 * k : 0, tickW),
    x1: W - margin,
    totalWidth: s('totalWidth'),
    periodGap: s('periodGap'),
    stepGap: s('barGap'),
    netWidth,
    maxStep: 64 * k
  })
  out.columns = columns

  // ---- labels on the steps: horizontal when they all fit their column ----
  const changePx = 11 * k
  const changeTexts = model.diagrams.map(d => d.periods.map(p => new Map(p.steps.map(st => [st.carrier.uid, s('showChanges') ? formatChange(doc, st.change) : '']))))
  const widestChange = Math.max(0, ...changeTexts.flat().flatMap(m => [...m.values()].map(t => textWidth(t, changePx, 500, font))))
  const direction = s('changeLabels')
  const vertical = direction === 'vertical' || (direction === 'auto' && widestChange > columns.stepWidth + s('barGap') - 1)
  const changeHeight = t => (vertical ? textWidth(t, changePx, 500, font) : changePx * 0.75) + 5 * k

  // ---- heading rows ----
  const heads = s('columnHeads')
  const chip = Math.min(19 * k, columns.stepWidth)
  const headKind = heads === 'icons' && (chip < 12 * k || !model.carriers.some(c => c.icon)) ? 'tabs' : heads
  const namePx = 11 * k
  const nameDrop = headKind === 'names' ? Math.max(0, ...model.carriers.map(c => textWidth(c.title, namePx, 400, font))) * 0.72 + 22 * k : 0
  const axisHeight = Math.max(34 * k, nameDrop + 8 * k)

  // ---- rows: the free height above each diagram is what its labels need ----
  const foot = 3 * k
  const extents = model.diagrams.map(d => ({ min: d.min, max: d.max }))
  let rows = frozen
  if (!rows) {
    let free = model.diagrams.map(() => 22 * k)
    for (let i = 0; i < 5; i++) {
      rows = layoutRows(extents, {
        top, bottom, sync: s('axisSync'), gap: s('diagramGap'), place: s('axisPlace'), axisHeight, heads: free, foot,
        pxPerUnit: s('scaleMode') === 'fixed' ? s('pxPerUnit') : null
      })
      const need = model.diagrams.map((d, di) => {
        const row = rows.rows[di]
        const above = (level, height) => height - (row.max - level) * row.perUnit
        let h = 8 * k
        if (s('showTotals')) d.totals.forEach(t => { h = Math.max(h, above(t.up, 21 * k)) })
        d.periods.forEach((p, pi) => {
          p.steps.forEach(st => {
            const str = changeTexts[di][pi].get(st.carrier.uid)
            if (str && st.change > 0) h = Math.max(h, above(st.to, changeHeight(str) + 3 * k))
          })
          if (netWidth && formatChange(doc, p.change)) h = Math.max(h, above(Math.max(p.start, p.end), (s('netPercent') ? 46 : 32) * k))
        })
        return h
      })
      if (need.every((h, j) => Math.abs(h - free[j]) < 0.5)) break
      free = need
    }
  }
  out.vertical = rows
  out.perUnit = rows.perUnit
  out.fits = !rows.overflow && !columns.overflow
  const areaTop = rows.rows[0].y0
  const areaBottom = rows.rows[n - 1].y1
  const axisTop = Math.min(areaTop, ...rows.axes.map(a => a.y0))
  const axisBottom = Math.max(areaBottom, ...rows.axes.map(a => a.y1))
  out.area = { x0: columns.x0, x1: columns.x1, y0: axisTop, y1: axisBottom }

  // ---- panels behind the steps: one per period, through all diagrams ----
  if (s('showBands')) {
    const bands = root.append('g').attr('class', 'bands')
    const pad = Math.min(8 * k, s('periodGap') * 0.45)
    columns.periods.forEach(p => {
      if (p.x1 <= p.x0) return
      bands.append('rect').attr('x', round1(p.x0 - pad)).attr('y', round1(axisTop - 2 * k)).attr('width', round1(p.x1 - p.x0 + pad * 2)).attr('height', round1(axisBottom - axisTop + 4 * k))
        .attr('rx', 8).attr('fill', '#FFFFFF').attr('fill-opacity', s('transparentBackground') ? 0 : isDark(background) ? 0.05 : 0.62)
    })
  }

  // ---- axes and grid ----
  const axisLayer = root.append('g').attr('class', 'axes')
  model.diagrams.forEach((d, di) => {
    const row = rows.rows[di]
    const height = (row.max - row.min) * row.perUnit
    const ticks = d3.scaleLinear().domain([row.min, row.max]).ticks(Math.max(2, Math.min(8, Math.round(height / (44 * k))))).filter(v => v >= row.min - 1e-9 && v <= row.max + 1e-9)
    const names = nameTexts[di]
    const nameTop = row.y0 + 11 * k
    const nameBottom = nameTop + (names.title.length ? (names.title.length - 1) * headPx * 1.28 + names.subtitle.length * notePx * 1.28 + (names.subtitle.length ? headPx * 1.28 - notePx * 1.28 : 0) : Math.max(0, names.subtitle.length - 1) * notePx * 1.28) + 4 * k
    const hasName = names.title.length + names.subtitle.length > 0
    ticks.forEach(v => {
      const y = row.y(v)
      if (s('showGrid') && v !== 0) line(axisLayer, columns.x0 - 4 * k, y, columns.x1, y, gridColor)
      // A number gives way to the diagram's name.
      if (s('showAxis') && !(hasName && y - axisPx * 0.6 < nameBottom)) text(axisLayer, columns.x0 - 10 * k, y + axisPx * 0.35, formatAuto(v).replace(/^-/, MINUS), { px: axisPx, anchor: 'end', fill: muted })
    })
    line(axisLayer, columns.x0 - 4 * k, row.y(0), columns.x1, row.y(0), mixColor(gridColor, ink, 0.28))

    let y = nameTop
    const put = (lines, part, px, weight, fill) => {
      if (!lines.length) return
      const y0 = y - px * 0.8
      let node = null
      let w = 0
      lines.forEach(t => {
        const el = text(axisLayer, margin, y, t, { px, weight, fill }).attr('class', `diagram-name diagram-name-${part}`)
        node = node || el.node()
        w = Math.max(w, textWidth(t, px, weight, font))
        y += px * 1.28
      })
      out.texts.push({ uid: d.uid, part, node, box: { x0: margin, y0, x1: margin + w, y1: y - px * 0.95 } })
    }
    put(names.title, 'title', headPx, 500, ink)
    put(names.subtitle, 'subtitle', notePx, 400, muted)
  })

  // ---- headings of the columns ----
  const headLayer = root.append('g').attr('class', 'heads')
  rows.axes.forEach((a, ai) => {
    const mid = headKind === 'names' ? a.y0 + 19 * k : (a.y0 + a.y1) / 2
    columns.totals.forEach((t, i) => {
      const m = model.moments[i]
      const px = 14 * k
      const node = text(headLayer, t.cx, (a.below || headKind !== 'names' ? mid : a.y1 - 12 * k) + px * 0.35, m.title, { px, weight: 500, anchor: 'middle' }).attr('class', 'moment-title')
      const w = textWidth(m.title, px, 500, font)
      const y = (a.below || headKind !== 'names' ? mid : a.y1 - 12 * k)
      out.moments.push({ uid: m.uid, index: i, row: ai, node: node.node(), box: { x0: t.cx - w / 2 - 3 * k, y0: y - px * 0.8, x1: t.cx + w / 2 + 3 * k, y1: y + px * 0.8 } })
    })
    if (headKind === 'none') return
    columns.periods.forEach((p, pi) => p.steps.forEach(st => {
      const c = st.carrier
      let node
      let box
      if (headKind === 'icons') {
        const x = st.cx - chip / 2
        const y = mid - chip / 2
        node = headLayer.append('rect').attr('x', round1(x)).attr('y', round1(y)).attr('width', round1(chip)).attr('height', round1(chip)).attr('rx', round1(chip * 0.28)).attr('fill', c.color)
        if (c.icon) drawIcon(headLayer, c.icon.path, st.cx - chip * 0.34, mid - chip * 0.34, chip * 0.68, inkOn(c.color), 1.2 * k)
        box = { x0: st.x0, y0: a.y0, x1: st.x1, y1: a.y1 }
      } else {
        const tabY = headKind === 'names' ? (a.below ? a.y0 + 7 * k : a.y1 - 11 * k) : mid - 2.5 * k
        node = headLayer.append('rect').attr('x', round1(st.x0)).attr('y', round1(tabY)).attr('width', round1(st.x1 - st.x0)).attr('height', round1(5 * k)).attr('rx', round1(Math.min(2.5 * k, (st.x1 - st.x0) / 2))).attr('fill', c.color)
        if (headKind === 'names') {
          const y = a.below ? a.y0 + 20 * k : a.y1 - 17 * k
          const x = st.cx + (a.below ? 4 * k : -2 * k)
          text(headLayer, x, y, c.title, { px: namePx, anchor: a.below ? 'end' : 'start' }).attr('transform', `rotate(-45 ${round1(x)},${round1(y)})`)
        }
        box = { x0: st.x0, y0: a.y0, x1: st.x1, y1: headKind === 'names' ? a.y0 + 26 * k : a.y1 }
        if (headKind === 'names' && !a.below) box = { x0: st.x0, y0: a.y1 - 26 * k, x1: st.x1, y1: a.y1 }
      }
      out.heads.push({ uid: c.uid, carrier: c, period: pi, row: ai, node: node.node(), box })
    }))
  })

  // ---- totals and steps ----
  const lineLayer = root.append('g').attr('class', 'connectors')
  const barLayer = root.append('g').attr('class', 'bars')
  const labelLayer = root.append('g').attr('class', 'labels')
  const radius = s('cornerRadius')
  const connect = s('showConnectors')
  const connector = mixColor(ink, background, 0.32)
  let clip = 0

  model.diagrams.forEach((d, di) => {
    const row = rows.rows[di]

    d.totals.forEach((t, ti) => {
      const c = columns.totals[ti]
      const yUp = row.y(t.up)
      const yDown = row.y(t.down)
      const g = barLayer.append('g').attr('class', 'total').attr('data-moment', t.moment._uid)
      if (t.segments.length) {
        const r = Math.max(0, Math.min(radius, (c.x1 - c.x0) / 2, (yDown - yUp) / 2))
        const a = t.up > 0 ? r : 0
        const b = t.down < 0 ? r : 0
        const id = `waterfall-clip-${clip++}`
        defs.append('clipPath').attr('id', id).append('path').attr('d', `M${c.x0},${yUp + a}Q${c.x0},${yUp} ${c.x0 + a},${yUp}L${c.x1 - a},${yUp}Q${c.x1},${yUp} ${c.x1},${yUp + a}L${c.x1},${yDown - b}Q${c.x1},${yDown} ${c.x1 - b},${yDown}L${c.x0 + b},${yDown}Q${c.x0},${yDown} ${c.x0},${yDown - b}Z`)
        g.attr('clip-path', `url(#${id})`)
      }
      t.segments.forEach((seg, si) => {
        const y0 = row.y(Math.max(seg.from, seg.to))
        const y1 = row.y(Math.min(seg.from, seg.to))
        const node = g.append('rect').attr('class', 'segment').attr('x', c.x0).attr('y', y0).attr('width', c.x1 - c.x0).attr('height', Math.max(0, y1 - y0)).attr('fill', paint(seg.carrier.color, seg.pattern, seg.mark))
        // A hair of background between segments keeps similar colours apart.
        if (si > 0 && seg.value > 0 && y1 - y0 > 2) g.append('line').attr('x1', c.x0).attr('x2', c.x1).attr('y1', y1).attr('y2', y1).attr('stroke', background).attr('stroke-width', 0.8)
        const label = s('segmentLabels')
        const h = y1 - y0
        const ground = paint.ground(seg.carrier.color, seg.pattern, seg.mark)
        const fill = inkOn(ground, { text: label === 'values' })
        const plate = (w, hh) => { if (seg.pattern) drawPlate(g, c.cx - w / 2 - 3 * k, (y0 + y1) / 2 - hh / 2 - 2 * k, c.cx + w / 2 + 3 * k, (y0 + y1) / 2 + hh / 2 + 2 * k, ground) }
        if (label === 'values' && h >= 14 * k) {
          const str = formatAmount(doc, seg.value, { unit: false })
          const w = textWidth(str, 10.5 * k, 400, font)
          if (w <= c.x1 - c.x0 - 6) {
            plate(w, 9 * k)
            text(g, c.cx, (y0 + y1) / 2 + 3.7 * k, str, { px: 10.5 * k, anchor: 'middle', fill })
          }
        } else if (label === 'icons' && seg.carrier.icon && h >= 18 * k && c.x1 - c.x0 >= 20 * k) {
          const size = Math.min(22 * k, h * 0.6, (c.x1 - c.x0) * 0.5)
          plate(size, size)
          drawIcon(g, seg.carrier.icon.path, c.cx - size / 2, (y0 + y1) / 2 - size / 2, size, fill, 1.3 * k)
        }
        out.segments.push({ diagram: d, carrier: seg.carrier, moment: model.moments[ti], value: seg.value, total: t.total, uids: seg.uids, box: { x0: c.x0, y0, x1: c.x1, y1 }, node: node.node(), color: seg.carrier.color, pattern: seg.pattern, mark: seg.mark, edge: seg.value > 0 ? y0 : y1, row: di })
      })
      const box = { x0: c.x0, y0: yUp, x1: c.x1, y1: yDown }
      if (s('showTotals')) text(labelLayer, c.cx, yUp - 7 * k, formatAmount(doc, t.total, { unit: false }), { px: 13 * k, weight: 500, anchor: 'middle' }).attr('class', 'total-label')
      out.totals.push({ diagram: d, moment: model.moments[ti], total: t.total, box, row: di })
    })

    d.periods.forEach((p, pi) => {
      const cols = columns.periods[pi]
      const left = columns.totals[pi]
      const right = columns.totals[pi + 1]
      const byCarrier = new Map(p.steps.map(st => [st.carrier.uid, st]))
      if (connect) {
        const level = (x0, x1, v) => line(lineLayer, x0, row.y(v), x1, row.y(v), connector).attr('shape-rendering', 'crispEdges')
        if (!cols.steps.length) level(left.x1, cols.net ? right.x0 : right.x0, p.end)
        cols.steps.forEach((c, ci) => {
          const st = byCarrier.get(c.carrier.uid)
          if (ci === 0) level(left.x1, c.x1, st.from)
          const next = cols.steps[ci + 1]
          level(c.x0, next ? next.x1 : right.x0, st.to)
        })
      }
      cols.steps.forEach(c => {
        const st = byCarrier.get(c.carrier.uid)
        const yFrom = row.y(st.from)
        const yTo = row.y(st.to)
        let y0 = Math.min(yFrom, yTo)
        let y1 = Math.max(yFrom, yTo)
        const nothing = Math.abs(st.change) < 1e-9
        const color = c.carrier.color
        let node = null
        if (!nothing) {
          if (y1 - y0 < 1.6) { const m = (y0 + y1) / 2; y0 = m - 0.8; y1 = m + 0.8 }
          const outlined = st.change < 0 && s('decreases') === 'light' && y1 - y0 > 3.5
          const inset = outlined ? 0.6 : 0
          node = barLayer.append('rect').attr('class', 'step').attr('x', round1(c.x0 + inset)).attr('y', Math.round((y0 + inset) * 100) / 100).attr('width', round1(Math.max(0.5, c.x1 - c.x0 - inset * 2))).attr('height', Math.round((y1 - y0 - inset * 2) * 100) / 100)
            .attr('rx', Math.min(2, (y1 - y0) / 2)).attr('fill', outlined ? paint.light(color, st.pattern, 0.72, st.mark) : paint(color, st.pattern, st.mark))
          if (outlined) node.attr('stroke', color).attr('stroke-width', 1.2)
        }
        const str = changeTexts[di][pi].get(c.carrier.uid)
        let labelNode = null
        let labelBox = null
        if (str) {
          const h = changeHeight(str)
          const w = textWidth(str, changePx, 500, font)
          // Increases are labelled above, decreases below (or above, near the axis).
          const above = st.change > 0 || y1 + h + 3 * k > row.y(row.min)
          const fill = readableColor(color, isDark(background) ? background : '#FFFFFF', 4)
          const gap = 4 * k
          if (vertical) {
            const x = c.cx + changePx * 0.36
            const y = above ? y0 - gap : y1 + gap
            labelNode = text(labelLayer, x, y, str, { px: changePx, weight: 500, anchor: above ? 'start' : 'end', fill }).attr('transform', `rotate(-90 ${round1(x)},${round1(y)})`)
            labelBox = { x0: c.cx - changePx * 0.6, x1: c.cx + changePx * 0.6, y0: above ? y - w : y, y1: above ? y : y + w }
          } else {
            const y = above ? y0 - gap : y1 + gap + changePx * 0.75
            labelNode = text(labelLayer, c.cx, y, str, { px: changePx, weight: 500, anchor: 'middle', fill })
            labelBox = { x0: c.cx - w / 2, x1: c.cx + w / 2, y0: y - changePx * 0.85, y1: y + changePx * 0.2 }
          }
          labelNode.attr('class', 'change-label')
        }
        out.bars.push({
          diagram: d, carrier: c.carrier, period: pi, from: model.moments[pi], to: model.moments[pi + 1], step: st, uids: st.uids, row: di,
          box: { x0: c.x0, y0, x1: c.x1, y1 }, edge: yTo, node: node && node.node(), color, pattern: st.pattern, mark: st.mark, fill: node ? node.attr('fill') : null, stroke: node ? node.attr('stroke') : null, labelNode: labelNode && labelNode.node(), labelBox
        })
      })

      // Net change: an arrow from one total to the next, with the difference above it.
      const str = cols.net ? formatChange(doc, p.change) : ''
      if (str) {
        const g = labelLayer.append('g').attr('class', 'net')
        const x = cols.net.cx
        const yA = row.y(p.start)
        const yB = row.y(p.end)
        const size = 4 * k
        if (Math.abs(yA - yB) > size * 2.2) {
          const up = yB < yA
          g.append('line').attr('x1', round1(x)).attr('x2', round1(x)).attr('y1', round1(yA)).attr('y2', round1(up ? yB + size * 1.4 : yB - size * 1.4)).attr('stroke', muted).attr('stroke-width', 1.2).attr('stroke-dasharray', '2.5 2.5')
          g.append('path').attr('d', up ? `M${round1(x - size)},${round1(yB + size * 1.7)}L${round1(x + size)},${round1(yB + size * 1.7)}L${round1(x)},${round1(yB + 1)}Z` : `M${round1(x - size)},${round1(yB - size * 1.7)}L${round1(x + size)},${round1(yB - size * 1.7)}L${round1(x)},${round1(yB - 1)}Z`).attr('fill', muted)
        }
        const topY = Math.min(yA, yB) - 7 * k
        const percent = s('netPercent') && p.start > 0 ? formatPercent(p.change / p.start) : ''
        if (percent) text(g, x, topY - 1 * k, percent, { px: 10 * k, anchor: 'middle', fill: muted })
        const pillBottom = topY - (percent ? 13 * k : 0)
        const w = textWidth(str, netPx, 500, font) + 11 * k
        const h = 18 * k
        g.append('rect').attr('x', round1(x - w / 2)).attr('y', round1(pillBottom - h)).attr('width', round1(w)).attr('height', round1(h)).attr('rx', round1(h / 2)).attr('fill', mixColor(background, ink, 0.09))
        text(g, x, pillBottom - h / 2 + netPx * 0.36, str, { px: netPx, weight: 500, anchor: 'middle' })
      }
    })
  })
  return out
}
