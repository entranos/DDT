// Draws the chord diagram (title, legend, circle, flows, nodes, groups, labels) into an SVG
// <g>. The editor canvas and the image export both use it, so what you see is what you
// export. Styling is set as attributes, never through page CSS.
// After the chord diagrams of the viewer this editor is modelled on.

import { lib } from '../../../shared/src/lib.js'
import { getSetting } from '../model/schema.js'
import { layoutChords } from '../model/chords.js'
import { inkOn, mixColor, readableColor } from '../../../shared/src/color.js'
import { formatAuto, formatNumber } from '../../../shared/src/format.js'
import { fontStack, textWidth, fitText, drawIcon, round1 } from '../../../shared/src/svgText.js'
import { drawHeading } from '../../../shared/src/heading.js'
import { createPaint, drawPlate } from '../../../shared/src/patterns.js'
import { createShadow } from '../../../shared/src/shadow.js'
import { polar, ribbonPath, textArc, fitCircle, spreadLabels } from './layout.js'

export { fontStack }

const BASE = 14 // text size all other sizes relate to
const RAD = Math.PI / 180

export const unitOf = doc => String(getSetting(doc, 'unit') || '').trim()

export function formatAmount (doc, value, { unit = true } = {}) {
  const n = formatAuto(value, getSetting(doc, 'decimals')).replace(/^-/, '−')
  return unit && unitOf(doc) ? `${n} ${unitOf(doc)}` : n
}
export const formatShare = share => `${formatNumber(share * 100, share > 0 && share < 0.0995 ? 1 : 0)}%`

// Words wrapped to a width; a word that doesn't fit is shortened.
function wrap (str, width, px, weight, font, max = 3) {
  const lines = []
  let line = ''
  String(str).split(/\s+/).filter(Boolean).forEach(word => {
    const next = line ? `${line} ${word}` : word
    if (line && textWidth(next, px, weight, font) > width) { lines.push(line); line = word } else line = next
  })
  if (line) lines.push(line)
  const shown = lines.slice(0, max)
  if (lines.length > max) shown[max - 1] = `${shown[max - 1]}…`
  return shown.map(l => fitText(l, width, px, weight, font, 1) || l)
}

// What a subtitle says: its own text, and which scenario is shown.
export function subtitleText (doc, model) {
  const name = getSetting(doc, 'showScenario') && doc.scenarios.length > 1 && model.scenario ? model.scenario.title || model.scenario.id : ''
  return [getSetting(doc, 'subtitle'), name].filter(Boolean).join(' | ')
}

// The options of the layout, from the settings.
export function layoutOptions (doc, model) {
  const s = key => getSetting(doc, key)
  return {
    spacing: s('spacing'),
    groupGap: s('groupGap') * RAD,
    nodeGap: s('nodeGap') * RAD,
    rotation: s('rotation') * RAD,
    order: s('ribbonOrder'),
    full: { shown: null, largest: model.largest, fixed: s('fullCircle') }[s('scaleMode')]
  }
}

// editor: also draw nodes without flows, dashed. labelPreview: { uid, dx, dy } while a label is dragged.
// Returns every drawn item for the editor's overlay, with positions relative to the centre (cx, cy):
//   { paint, layout, cx, cy, r, ribbons, nodes, groups, subtitle, legend, full, overflow, fits, k }
export function drawChord (gNode, doc, model, { editor = false, labelPreview = null } = {}) {
  const d3 = lib.d3
  const s = key => getSetting(doc, key)
  const sc = s('scaleCanvas')
  const W = s('canvasWidth') / sc
  const H = s('canvasHeight') / sc
  const k = s('fontSize') / BASE
  const margin = s('margin')
  const ink = s('textColor')
  const muted = s('mutedTextColor')
  const background = s('transparentBackground') ? '#FFFFFF' : s('backgroundColor')
  const font = fontStack(s('font'))
  const root = d3.select(gNode).attr('font-family', font)
  root.selectAll(':scope > *').remove()
  const defs = root.append('defs')
  const paint = createPaint(defs, s)
  const out = { paint, layout: null, cx: W / 2, cy: H / 2, r: 0, ribbons: [], nodes: [], groups: [], subtitle: null, legend: [], full: 0, overflow: false, fits: true, k }

  const get = key => (key === 'subtitle' ? subtitleText(doc, model) : s(key))
  const heading = drawHeading(root, { get, W, H, k, margin, ink, muted, font, items: model.legend, paint })
  out.subtitle = heading.subtitle
  out.legend = heading.legend
  if (!model.nodes.length) return out
  const layout = layoutChords(model, layoutOptions(doc, model))
  out.layout = layout
  out.full = layout.full
  out.overflow = layout.overflow

  // ---- rings: flows, nodes, groups ----
  const nodeWidth = s('nodeWidth')
  const nodeFrom = nodeWidth > 0 ? 5 : 0
  const nodeTo = nodeFrom + nodeWidth
  const showGroups = s('showGroups')
  const groupWidth = s('groupWidth')
  const isOutside = g => showGroups && g.id !== '' && g.place === 'outside'
  const isInside = g => showGroups && g.id !== '' && g.place === 'inside'
  const ringOf = g => (isOutside(g) ? nodeTo + 8 + groupWidth : nodeTo)
  const groupOf = new Map(model.groups.flatMap(g => g.nodes.map(n => [n.id, g])))

  // ---- labels ----
  const namePx = 14 * k
  const valuePx = 15 * k
  const detailPx = 11 * k
  const lineH = namePx * 1.25
  const detailH = detailPx * 1.36
  const iconSize = 22 * k
  const labelWidth = s('labelWidth')
  const labels = model.nodes.filter(n => n.labelled && (!n.empty || editor)).map(n => {
    const at = layout.nodes.get(n.id)
    const a = (at.a0 + at.a1) / 2
    const value = !n.empty && s('showValues') ? formatAmount(doc, n.amount) : ''
    const title = s('showNames') || n.empty ? wrap(n.title, labelWidth, namePx, 400, font) : []
    const details = s('showDetails') && !n.empty ? n.details.map(d => `${d.title}: ${formatAmount(doc, d.value)}`) : []
    const columns = details.length > 4 ? 2 : 1
    const rows = Math.ceil(details.length / columns)
    const colW = Array.from({ length: columns }, (_, c) => Math.max(0, ...details.filter((__, i) => i % columns === c).map(t => textWidth(t, detailPx, 400, font))))
    const detailW = colW.reduce((x, y) => x + y, 0) + (columns - 1) * 14 * k
    const icon = s('nodeIcons') && n.icon && !n.empty && (value || title.length) ? n.icon : null
    const textW = Math.max(value ? textWidth(value, valuePx, 500, font) : 0, ...title.map(t => textWidth(t, namePx, 400, font)), details.length ? detailW : 0)
    const headH = (value ? valuePx * 1.3 : 0) + title.length * lineH
    const h = headH + (rows ? rows * detailH + 3 * k : 0)
    const lead = icon ? iconSize + 8 * k : 0
    return { n, a, side: Math.sin(a) >= 0 ? 1 : -1, ring: ringOf(groupOf.get(n.id)) + s('labelDistance'), value, title, details, columns, colW, icon, lead, textW, headH, w: lead + textW, h }
  }).filter(l => l.w > 0)

  const area = { x0: margin, y0: heading.top, x1: W - margin, y1: heading.bottom }
  const maxRing = Math.max(nodeTo, ...model.groups.map(ringOf))
  const circle = fitCircle(area, labels, maxRing, s('radius'))
  const R = circle.r
  const cx = circle.cx + s('offsetX')
  const cy = circle.cy + s('offsetY')
  Object.assign(out, { cx, cy, r: R, fits: circle.fits || s('radius') > 0 })
  const g0 = root.append('g').attr('class', 'circle').attr('transform', `translate(${round1(cx)},${round1(cy)})`)

  const arc = (a0, a1, r0, r1, corner) => d3.arc().innerRadius(r0).outerRadius(r1).startAngle(a0).endAngle(a1).cornerRadius(Math.min(corner, (r1 - r0) / 2))()
  const shadow = s('dropShadow') ? createShadow(g0, defs, { x: -cx, y: -cy, width: W, height: H }, { blur: 5 }) : null

  // ---- disc ----
  if (s('showDisc')) {
    g0.append('circle').attr('class', 'disc').attr('r', round1(R)).attr('fill', s('discColor'))
    if (shadow) shadow.layer.append('circle').attr('r', round1(R))
  }

  // ---- flows: the largest at the back ----
  const insideTo = R - 14 * k
  const endRadius = id => { const g = groupOf.get(id); return !model.nodeById.get(id).labelled && isInside(g) ? insideTo - groupWidth - 2 : R - 1 }
  const ribbonLayer = g0.append('g').attr('class', 'ribbons')
  const bend = s('bend') / 100
  ;[...layout.ribbons].sort((a, b) => b.ribbon.value - a.ribbon.value).forEach(p => {
    const r = p.ribbon
    const sr = endRadius(r.source)
    const tr = endRadius(r.target)
    const width = (p.t1 - p.t0) * tr
    const head = s('arrows') ? Math.min(16 * k, Math.max(Math.min(7 * k, width * 2.2), width * 0.32)) : 0
    const d = ribbonPath(p, { sr, tr, head, bend })
    const stroke = lib.d3.rgb(r.color).darker(0.5).formatHex()
    const node = ribbonLayer.append('path').attr('class', 'ribbon').attr('data-key', r.key).attr('d', d).attr('fill', paint(r.color, r.pattern, r.mark)).attr('fill-opacity', s('flowOpacity'))
      .attr('stroke', stroke).attr('stroke-width', 0.6).attr('stroke-opacity', 0.7).attr('stroke-linejoin', 'round')
    out.ribbons.push({ key: r.key, ribbon: r, place: p, d, node: node.node(), color: r.color, pattern: r.pattern, mark: r.mark })
  })

  // ---- values or icons on flows, near where they start ----
  const flowLabels = s('flowLabels')
  if (flowLabels !== 'none') {
    const layer = g0.append('g').attr('class', 'flow-labels')
    const px = 11 * k
    layout.ribbons.forEach(p => {
      const r = p.ribbon
      const rr = isInside(groupOf.get(r.source)) ? (insideTo - groupWidth) * 0.93 : endRadius(r.source) * 0.86
      const [x, y] = polar(rr, (p.s0 + p.s1) / 2)
      const len = (p.s1 - p.s0) * rr
      const ground = mixColor(s('showDisc') ? s('discColor') : background, r.color, s('flowOpacity'))
      const fill = inkOn(ground, { text: true })
      if (flowLabels === 'values') {
        const str = formatAmount(doc, r.value, { unit: false })
        const w = textWidth(str, px, 400, font)
        if (len < w * 0.8 + 6 * k) return
        if (r.pattern) drawPlate(layer, x - w / 2 - 3 * k, y - px * 0.75, x + w / 2 + 3 * k, y + px * 0.75, ground)
        layer.append('text').attr('x', round1(x)).attr('y', round1(y + px * 0.35)).attr('font-size', round1(px)).attr('font-weight', 400).attr('text-anchor', 'middle').attr('fill', fill).text(str)
      } else if (r.icon) {
        const size = Math.min(20 * k, len * 0.62)
        if (size < 10) return
        if (r.pattern) drawPlate(layer, x - size * 0.66, y - size * 0.66, x + size * 0.66, y + size * 0.66, ground)
        drawIcon(layer, r.icon.path, x - size / 2, y - size / 2, size, fill, 1.3 * k)
      }
    })
  }

  // ---- arcs of groups and nodes ----
  const groupLayer = g0.append('g').attr('class', 'groups')
  const nodeLayer = g0.append('g').attr('class', 'nodes')
  const corner = s('cornerRadius')
  const groupPx = 12.5 * k
  layout.groups.forEach((lg, gi) => {
    const g = lg.group
    const outside = isOutside(g)
    if (!outside && !isInside(g)) return
    const r1 = outside ? R + nodeTo + 8 + groupWidth : insideTo
    const r0 = r1 - groupWidth
    const pad = lg.a1 - lg.a0 < 0.03 ? (0.03 - (lg.a1 - lg.a0)) / 2 : 0
    const a0 = lg.a0 - pad
    const a1 = lg.a1 + pad
    const d = arc(a0, a1, r0, r1, corner)
    const border = s('groupBorder') ? mixColor(g.color, ink, g.color.toLowerCase() === '#ffffff' ? 0.45 : 0.6) : null
    const node = groupLayer.append('path').attr('class', 'group').attr('d', d).attr('fill', g.color).attr('fill-opacity', outside ? 1 : 0.86).attr('stroke', border).attr('stroke-width', border ? 1 : null)
    if (shadow && outside) shadow.path(d)
    let textNode = null
    let span = null
    if (s('showGroupNames') && g.title) {
      const rm = (r0 + r1) / 2
      const room = (a1 - a0) * rm - 12 * k
      // A name that would lose its better half is left out: the labels say it too.
      const fitted = fitText(g.title, room, groupPx, 500, font, 2)
      const str = fitted === g.title || fitted.length - 1 >= g.title.length * 0.65 ? fitted : ''
      const half = (a1 - a0) / 2
      const mid = (a0 + a1) / 2
      if (str && groupWidth >= groupPx) {
        const id = `group-path-${gi}`
        // The path is longer than the text needs, so nothing is cut off at its ends.
        const reachA = Math.min(Math.PI * 0.95, half + 0.06)
        defs.append('path').attr('id', id).attr('d', textArc(mid - reachA, mid + reachA, rm))
        const t = groupLayer.append('text').attr('class', 'group-name').attr('font-size', round1(groupPx)).attr('font-weight', 500).attr('fill', inkOn(g.color, { text: true })).attr('dy', '0.35em')
        t.append('textPath').attr('href', `#${id}`).attr('startOffset', '50%').attr('text-anchor', 'middle').text(str)
        textNode = t.node()
        const ta = textWidth(str, groupPx, 500, font) / rm / 2 + 0.01
        span = [mid - ta, mid + ta]
      }
    }
    out.groups.push({ uid: g.uid, group: g, a0, a1, r0, r1, node: node.node(), textNode, span })
  })
  const nodeItem = new Map()
  model.nodes.forEach(n => {
    const at = layout.nodes.get(n.id)
    const g = groupOf.get(n.id)
    const item = { uid: n.uid, node: n, group: g, a0: at.a0, a1: at.a1, r0: R + nodeFrom, r1: R + nodeTo, arc: null, label: null, color: n.color, pattern: n.pattern, mark: n.mark }
    if (n.labelled && !n.empty && nodeWidth > 0) {
      const d = arc(at.a0, at.a1, R + nodeFrom, R + nodeTo, Math.min(corner, nodeWidth / 2))
      item.arc = nodeLayer.append('path').attr('class', 'node-arc').attr('d', d).attr('fill', paint(n.color, n.pattern, n.mark)).node()
      if (shadow) shadow.path(d)
    } else if (n.empty && editor) {
      const [x, y] = polar(R + nodeFrom + Math.max(3, nodeWidth / 2), at.a0)
      nodeLayer.append('circle').attr('cx', round1(x)).attr('cy', round1(y)).attr('r', 4).attr('fill', 'none').attr('stroke', '#9a948a').attr('stroke-dasharray', '2 2')
    }
    out.nodes.push(item)
    nodeItem.set(n.id, item)
  })

  // ---- labels beside the circle ----
  const labelLayer = root.append('g').attr('class', 'labels')
  labels.forEach(l => {
    const rl = R + l.ring
    l.y = -rl * Math.cos(l.a) - Math.cos(l.a) * l.h / 2
    l.ideal = l.y
  })
  ;[-1, 1].forEach(side => spreadLabels(labels.filter(l => l.side === side), { top: area.y0 - cy - 2, bottom: area.y1 - cy + 2, gap: 5 * k }))
  const mode = s('markerLines')
  labels.forEach(l => {
    const { n } = l
    const item = nodeItem.get(n.id)
    const rl = R + l.ring
    const near = l.at - l.h / 2 > 0 ? l.at - l.h / 2 : l.at + l.h / 2 < 0 ? l.at + l.h / 2 : 0
    let x = l.side * Math.sqrt(Math.max(0, rl * rl - near * near))
    let y = l.at
    const own = labelPreview && labelPreview.uid === n.uid ? labelPreview : n
    const dragged = Math.abs(own.dx) + Math.abs(own.dy) > 0.5
    x += own.dx
    y += own.dy
    const left = cx + (l.side > 0 ? x : x - l.w)
    const top = cy + y - l.h / 2
    const g = labelLayer.append('g').attr('class', 'node-label').attr('data-uid', n.uid)
    const textX = l.side > 0 ? left + l.lead : left + l.textW
    const anchor = l.side > 0 ? 'start' : 'end'
    const put = (str, px, weight, fill, yy, xx = textX) => g.append('text').attr('x', round1(xx)).attr('y', round1(yy)).attr('font-size', round1(px)).attr('font-weight', weight).attr('text-anchor', anchor).attr('fill', fill).text(str)

    const moved = Math.hypot(0, l.at - l.ideal) > 12 * k || dragged
    if (!n.empty && (mode === 'always' || (mode === 'auto' && moved))) {
      const [px0, py0] = polar(R + ringOf(item.group) + 3, l.a)
      const [px1, py1] = polar(R + ringOf(item.group) + Math.max(6, l.ring - ringOf(item.group)) * 0.6, l.a)
      const ey = cy + y - l.h / 2 + Math.min(l.h / 2, (l.headH || l.h) / 2)
      const ex = cx + x - l.side * 5 * k
      g.append('polyline').attr('class', 'marker').attr('points', `${round1(cx + px0)},${round1(cy + py0)} ${round1(cx + px1)},${round1(cy + py1)} ${round1(ex)},${round1(ey)}`)
        .attr('fill', 'none').attr('stroke', mixColor(background, ink, 0.38)).attr('stroke-width', 0.9).attr('stroke-linejoin', 'round')
    }
    let yy = top
    let valueNode = null
    let titleNode = null
    let valueBox = null
    let titleBox = null
    const box = (w, y0, y1) => ({ x0: l.side > 0 ? textX : textX - w, y0, x1: l.side > 0 ? textX + w : textX, y1 })
    if (l.value) {
      const fill = s('colorValues') && (n.carrier || n.color !== s('nodeColor')) ? readableColor(n.color, background, 3.4) : ink
      valueNode = put(l.value, valuePx, 500, fill, yy + valuePx * 0.98).attr('class', 'node-value')
      valueBox = box(textWidth(l.value, valuePx, 500, font), yy, yy + valuePx * 1.25)
      yy += valuePx * 1.3
    }
    if (l.title.length) {
      titleBox = box(Math.max(...l.title.map(t => textWidth(t, namePx, 400, font))), yy, yy + l.title.length * lineH)
      l.title.forEach((t, i) => { const el = put(t, namePx, 400, n.empty ? '#8a857d' : ink, yy + namePx * 0.95 + i * lineH).attr('class', 'node-title').attr('font-style', n.empty ? 'italic' : null); titleNode = titleNode || el })
      yy += l.title.length * lineH
    }
    if (l.details.length) {
      yy += 3 * k
      l.details.forEach((t, i) => {
        const c = i % l.columns
        const xx = l.side > 0 ? textX + (c ? l.colW[0] + 14 * k : 0) : textX - (c === 0 && l.columns > 1 ? l.colW[1] + 14 * k : 0)
        put(t, detailPx, 400, muted, yy + detailPx + Math.floor(i / l.columns) * detailH, xx).attr('class', 'node-detail')
      })
    }
    if (l.icon) drawIcon(g, l.icon.path, l.side > 0 ? left : left + l.w - iconSize, top + Math.max(0, (Math.max(l.headH, iconSize) - iconSize) / 2), iconSize, ink, 1.3 * k)
    item.label = {
      box: { x0: left, y0: top, x1: left + l.w, y1: top + l.h }, titleBox, titleNode: titleNode && titleNode.node(), valueBox, valueNode: valueNode && valueNode.node(), side: l.side, lines: l.title.length
    }
    item.ringTo = R + ringOf(item.group)
  })
  return out
}
