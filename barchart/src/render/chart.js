// Draws the bar chart (title, legend, axis, bars, icons, labels) into an SVG <g>. The editor
// canvas and the image export both use it, so what you see is what you export. Styling is
// set as attributes, never through page CSS.

import { lib } from '../../../shared/src/lib.js'
import { getSetting } from '../model/schema.js'
import { inkOn, mixColor } from '../../../shared/src/color.js'
import { formatAuto, formatNumber } from '../../../shared/src/format.js'
import { fontStack, textWidth, fitText, drawIcon, round1 } from '../../../shared/src/svgText.js'
import { drawHeading } from '../../../shared/src/heading.js'
import { createPaint, drawPlate } from '../../../shared/src/patterns.js'
import { createShadow } from '../../../shared/src/shadow.js'
import { layoutSlots, layoutScale, roundedBox } from './layout.js'

export { fontStack }

const BASE = 14 // text size all other sizes relate to
const MINUS = '−'

export const unitOf = doc => String(getSetting(doc, 'unit') || '').trim()

export function formatAmount (doc, value, { unit = true } = {}) {
  const n = formatAuto(value, getSetting(doc, 'decimals')).replace(/^-/, MINUS)
  return unit && unitOf(doc) ? `${n} ${unitOf(doc)}` : n
}

export const formatShare = share => `${formatNumber(share * 100, share > 0 && share < 0.0995 ? 1 : 0).replace(/^-/, MINUS)}%`

// Words wrapped to a width; null when a word doesn't fit or there are too many lines.
function wrap (str, width, px, weight, font, max = 3) {
  const lines = []
  let line = ''
  for (const word of String(str).split(/\s+/).filter(Boolean)) {
    if (textWidth(word, px, weight, font) > width) return null
    const next = line ? `${line} ${word}` : word
    if (line && textWidth(next, px, weight, font) > width) { lines.push(line); line = word } else line = next
  }
  if (line) lines.push(line)
  return lines.length <= max ? lines : null
}

// frozen: the frame of an earlier drawing, so the axis stays put while a bar is dragged.
// Returns every drawn item with its box in diagram units, for the editor's overlay:
//   { paint, horizontal, frame, area, groups, bars, parts, subtitle, legend, axisTitle, perUnit, fits, k }
export function drawChart (gNode, doc, model, { frozen = null } = {}) {
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
  const hz = s('orientation') === 'horizontal'
  const grouped = model.mode === 'grouped'
  const share = model.mode === 'share'
  const root = d3.select(gNode).attr('font-family', font)
  root.selectAll(':scope > *').remove()
  const defs = root.append('defs')
  const paint = createPaint(defs, s)

  const text = (parent, x, y, str, { px = 11 * k, weight = 400, anchor = 'start', fill = ink } = {}) =>
    parent.append('text').attr('x', round1(x)).attr('y', round1(y)).attr('font-size', round1(px)).attr('font-weight', weight)
      .attr('text-anchor', anchor).attr('fill', fill).text(str)
  const line = (parent, x0, y0, x1, y1, stroke) =>
    parent.append('line').attr('x1', round1(x0)).attr('y1', round1(y0)).attr('x2', round1(x1)).attr('y2', round1(y1)).attr('stroke', stroke).attr('stroke-width', 1)
  const out = { paint, horizontal: hz, frame: null, area: null, groups: [], bars: [], parts: [], subtitle: null, legend: [], axisTitle: null, perUnit: null, fits: true, k }

  const heading = drawHeading(root, { get: s, W, H, k, margin, ink, muted, font, items: model.legend, paint, onChip: c => inkOn(c, { text: true }) })
  out.subtitle = heading.subtitle
  out.legend = heading.legend
  const { bars, groups } = model
  if (!bars.length) {
    out.area = { x0: margin, y0: heading.top, x1: W - margin, y1: heading.bottom }
    return out
  }

  // ---- the value axis ----
  const namePx = 14 * k
  const axisPx = 11.5 * k
  const totalPx = 13 * k
  const partPx = 11 * k
  const groupPx = 14 * k
  const top = { min: model.min, max: share ? Math.max(model.max, 1e-9) : Math.max(model.max, s('axisMax')) }
  if (top.max - top.min < 1e-9) top.max = 1
  const domain = frozen ? frozen.domain : top
  const tickText = v => (share ? `${formatNumber(v * 100, 0).replace(/^-/, MINUS)}%` : formatAuto(v).replace(/^-/, MINUS))
  const ticksFor = n => d3.scaleLinear().domain([domain.min, domain.max]).ticks(n).filter(v => v >= domain.min - 1e-9 && v <= domain.max + 1e-9)
  const showAxis = s('showAxis')
  const tickW = showAxis ? Math.max(0, ...[2, 4, 6, 8].flatMap(n => ticksFor(n).map(v => textWidth(tickText(v), axisPx, 400, font)))) : 0
  const axisTitle = showAxis ? String(s('axisTitle') || '').trim() : ''
  const unit = showAxis && !share ? unitOf(doc) : ''
  const titleText = axisTitle || (hz ? '' : unit)

  // ---- names and icons of bars ----
  const iconMode = s('barIcons') === 'none' ? 'none' : grouped ? 'axis' : s('barIcons')
  const iconMax = s('iconSize')
  const showNames = s('showNames')
  const showGroups = s('showGroupNames')
  const titled = g => showGroups && g.title !== ''
  const groupGap = groups.length > 1 ? s('groupGap') : 0
  const axisIcons = iconMode === 'axis' && bars.some(b => b.icon)

  let x0 = margin
  let x1 = W - margin
  let y0 = heading.top
  let y1 = heading.bottom
  let slots
  let names // per bar: lines, or { slanted }
  let slanted = false
  let axisIcon = 0
  let nameW = 0
  if (hz) {
    const widest = Math.max(0, ...bars.map(b => textWidth(b.title, namePx, 400, font)))
    nameW = showNames ? Math.min(widest, Math.max(120 * k, W * 0.26)) : 0
    y0 += 4 * k
    y1 -= showAxis ? (axisTitle ? 42 : 24) * k : 0
    slots = layoutSlots(groups, { u0: y0, u1: y1, groupGap, head: g => (titled(g) ? 30 * k : 0) })
    axisIcon = axisIcons ? Math.min(iconMax, slots.slot * 0.86) : 0
    if (axisIcon < 9) axisIcon = 0
    x0 += nameW + (nameW ? 12 * k : 0) + (axisIcon ? axisIcon + 12 * k : 0)
    names = bars.map(b => (showNames && b.title ? wrap(b.title, nameW + 0.5, namePx, 400, font, slots.slot > namePx * 2.4 ? 2 : 1) || [fitText(b.title, nameW, namePx, 400, font)] : []))
  } else {
    x0 += showAxis ? tickW + 10 * k : 0
    y0 += titleText ? 22 * k : 4 * k
    slots = layoutSlots(groups, { u0: x0, u1: x1, groupGap })
    axisIcon = axisIcons ? Math.min(iconMax, slots.slot * 0.9) : 0
    if (axisIcon < 9) axisIcon = 0
    const angle = s('nameAngle')
    const wrapped = bars.map(b => (showNames && b.title ? wrap(b.title, slots.slot - 4, namePx, 400, font) : []))
    slanted = showNames && (angle === 'slanted' || (angle === 'auto' && wrapped.some(w => w === null)))
    const reach = 0.72 // of a slanted name's width, sideways and down
    if (slanted) {
      const flat = slots.groups.flatMap(g => g.bars)
      names = bars.map((b, i) => [b.title ? fitText(b.title, Math.min(190 * k, (flat[i].cu - 6) / reach), namePx, 400, font, 1) : ''])
    } else names = wrapped.map((w, i) => w || [fitText(bars[i].title, slots.slot - 2, namePx, 400, font, 1)])
    const nameH = !showNames ? 0 : slanted ? Math.max(0, ...names.map(n => textWidth(n[0], namePx, 400, font))) * reach + 14 * k : Math.max(0, ...names.map(n => n.length)) * namePx * 1.25
    y1 -= (axisIcon || nameH ? 9 * k : 0) + (axisIcon ? axisIcon + (nameH ? 5 * k : 0) : 0) + nameH + (groups.some(titled) ? 34 * k : 0)
  }
  const area = { x0, y0, x1, y1: Math.max(y0 + 20, y1) }
  out.area = area
  const length = hz ? x1 - x0 : area.y1 - y0

  // ---- bars across their slot ----
  const n = Math.max(1, model.series.length)
  const gap = s('seriesGap')
  const wide = slots.slot * Math.min(100, s('barSize')) / 100
  const thickness = grouped ? Math.min(wide, s('maxBar') * n + gap * (n - 1)) : Math.min(wide, s('maxBar'))
  const innerGap = grouped ? Math.min(gap, thickness / n * 0.4) : gap
  const each = grouped ? (thickness - innerGap * (n - 1)) / n : thickness

  // ---- labels beyond the ends ----
  const totals = s('showTotals')
  const endIcon = iconMode === 'end' ? Math.min(iconMax, thickness * 1.1) : 0
  const endText = amount => formatAmount(doc, amount, { unit: share }) // the axis has no unit then
  const ends = grouped
    ? bars.flatMap(b => b.parts.map(p => ({ up: Math.max(0, p.to), down: Math.min(0, p.to), text: totals && !p.empty ? endText(p.amount) : '', icon: 0, positive: p.to >= 0 })))
    : bars.map(b => ({ up: b.up, down: b.down, text: totals ? endText(b.total) : '', icon: endIcon && b.icon ? endIcon : 0, positive: b.up > 0 || b.down >= 0 }))
  const endW = t => (t ? textWidth(t, totalPx, 500, font) : 0)
  // Too wide for their bar: turned, and when even that doesn't fit left out.
  const room = grouped ? each + innerGap : slots.slot
  const turned = frozen ? frozen.turned : !hz && ends.some(e => endW(e.text) > room - 2)
  const shown = hz ? each >= totalPx * 0.8 || !grouped : !turned || room >= totalPx * 0.95
  ends.forEach(e => {
    if (!shown) e.text = ''
    const size = (e.text ? (hz || turned ? endW(e.text) : totalPx * 0.78) + 7 * k : 0) + (e.icon ? e.icon + 6 * k : 0)
    e.roomUp = e.positive ? size + 2 * k : 0
    e.roomDown = e.positive ? 0 : size + 2 * k
  })
  const scale = frozen || (() => {
    const fit = layoutScale({ length, min: domain.min, max: domain.max, ends, pxPerUnit: s('scaleMode') === 'fixed' && !share ? s('pxPerUnit') : null })
    return { per: fit.per, zero: hz ? x0 + fit.down : area.y1 - fit.down, domain, turned, fits: fit.fits }
  })()
  out.frame = scale
  out.perUnit = share ? null : scale.per
  out.fits = scale.fits
  const at = v => (hz ? scale.zero + v * scale.per : scale.zero - v * scale.per)
  const box = (u0, u1, v0, v1) => {
    const a = at(v0)
    const b = at(v1)
    return hz ? { x0: Math.min(a, b), y0: u0, x1: Math.max(a, b), y1: u1 } : { x0: u0, y0: Math.min(a, b), x1: u1, y1: Math.max(a, b) }
  }
  // A box rounded at its ends: `up` towards larger values, `down` towards smaller ones.
  const rounded = (b, up, down) => {
    const r = Math.max(0, Math.min(s('cornerRadius'), (b.x1 - b.x0) / 2, (b.y1 - b.y0) / 2))
    const u = up ? r : 0
    const d = down ? r : 0
    return roundedBox(b, hz ? { tl: d, tr: u, br: u, bl: d } : { tl: u, tr: u, br: d, bl: d })
  }

  // ---- axis and grid ----
  const axisLayer = root.append('g').attr('class', 'axes')
  const ticks = ticksFor(Math.max(2, Math.min(9, Math.round(Math.abs(at(domain.max) - at(domain.min)) / ((hz ? 96 : 50) * k)))))
  // A line at one value, through all bars; horizontally not through headings and gaps.
  const across = (p, color, layer) => {
    if (!hz) line(layer, x0, p, x1, p, color)
    else slots.groups.forEach(g => line(layer, p, g.bars[0].u0, p, g.bars[g.bars.length - 1].u1, color))
  }
  ticks.forEach((v, i) => {
    const p = at(v)
    if (s('showGrid') && v !== 0) across(p, gridColor, axisLayer)
    if (!showAxis) return
    const label = tickText(v)
    if (hz) text(axisLayer, p, area.y1 + 17 * k, unit && !axisTitle && i === ticks.length - 1 ? `${label} ${unit}` : label, { px: axisPx, anchor: 'middle', fill: muted })
    else text(axisLayer, x0 - 10 * k, p + axisPx * 0.35, label, { px: axisPx, anchor: 'end', fill: muted })
  })
  if (titleText) {
    const px = 11.5 * k
    const w = textWidth(titleText, px, 400, font)
    const tx = hz ? x1 : margin
    const ty = hz ? area.y1 + 36 * k : y0 - 11 * k
    const node = text(axisLayer, tx, ty, titleText, { px, anchor: hz ? 'end' : 'start', fill: muted }).attr('class', 'axis-title')
    out.axisTitle = { node: node.node(), box: { x0: hz ? tx - w : tx, y0: ty - px, x1: hz ? tx : tx + w, y1: ty + px * 0.35 } }
  }

  // ---- groups ----
  const groupLayer = root.append('g').attr('class', 'groups')
  groups.forEach((g, gi) => {
    const slot = slots.groups[gi]
    const region = hz ? { x0: margin, y0: slot.u0, x1, y1: slot.u1 } : { x0: slot.u0, y0, x1: slot.u1, y1: heading.bottom }
    let node = null
    let labelBox = null
    if (titled(g)) {
      if (hz) {
        const str = fitText(g.title, x1 - margin, groupPx, 500, font)
        const y = slot.u0 + 15 * k
        node = text(groupLayer, margin, y, str, { px: groupPx, weight: 500 })
        line(groupLayer, margin, slot.u0 + 23 * k, x1, slot.u0 + 23 * k, mixColor(gridColor, ink, 0.18))
        labelBox = { x0: margin, y0: y - groupPx, x1: margin + textWidth(str, groupPx, 500, font), y1: y + groupPx * 0.35 }
      } else {
        const inset = Math.min(8 * k, slots.slot * 0.12)
        const str = fitText(g.title, slot.u1 - slot.u0 + Math.min(groupGap, 20 * k), groupPx, 500, font, 1)
        const cx = (slot.u0 + slot.u1) / 2
        const y = heading.bottom - 4 * k
        const rule = heading.bottom - 22 * k
        line(groupLayer, slot.u0 + inset, rule, slot.u1 - inset, rule, mixColor(gridColor, ink, 0.3))
        node = text(groupLayer, cx, y, str, { px: groupPx, weight: 500, anchor: 'middle' })
        const w = textWidth(str, groupPx, 500, font)
        labelBox = { x0: cx - w / 2, y0: y - groupPx, x1: cx + w / 2, y1: y + groupPx * 0.35 }
      }
      node.attr('class', 'group-name')
    }
    out.groups.push({ title: g.title, region, node: node && node.node(), box: labelBox })
  })

  // ---- bars ----
  const shadow = s('dropShadow') ? createShadow(root, defs, { x: 0, y: 0, width: W, height: H }) : null
  const barLayer = root.append('g').attr('class', 'bars')
  const labelLayer = root.append('g').attr('class', 'labels')
  const flat = slots.groups.flatMap(g => g.bars)
  let endIndex = 0

  bars.forEach((b, bi) => {
    const slot = flat[bi]
    const u0 = slot.cu - thickness / 2
    const u1 = slot.cu + thickness / 2
    const g = barLayer.append('g').attr('class', 'bar').attr('data-uid', b.uid)
    if (s('showTracks')) g.append('path').attr('d', rounded(box(u0, u1, domain.min, domain.max), true, domain.min < 0)).attr('fill', mixColor(background, ink, 0.055))
    const whole = box(u0, u1, b.down, b.up)
    const hasLength = b.up - b.down > 1e-12
    // Space at the start of the bar that its own icon takes.
    let reserve = 0
    let insideSize = 0
    if (iconMode === 'inside' && b.icon && hasLength) {
      insideSize = Math.min(iconMax, thickness * 0.74)
      const longest = Math.max(b.up, -b.down) * scale.per
      if (insideSize >= 9 && longest >= insideSize + 8 * k) reserve = insideSize + 10 * k
      else insideSize = 0
    }
    const upwards = b.up >= -b.down

    const clip = grouped || !hasLength ? null : `bar-clip-${bi}`
    if (clip) {
      const d = rounded(whole, b.up > 0, b.down < 0)
      defs.append('clipPath').attr('id', clip).append('path').attr('d', d)
      if (shadow) shadow.path(d)
    }
    const shapes = clip ? g.append('g').attr('clip-path', `url(#${clip})`) : g
    const first = b.parts.find(p => !p.empty && (p.to > p.from) === upwards)

    b.parts.forEach((p, pi) => {
      const pu0 = grouped ? u0 + pi * (each + innerGap) : u0
      const full = box(pu0, pu0 + each, p.from, p.to)
      const along = hz ? full.x1 - full.x0 : full.y1 - full.y0
      // A hair of background between the parts of a stack keeps similar colours apart.
      const cut = !grouped && Math.abs(p.from) > 1e-12 && along > gap + 0.75 ? gap : 0
      const shape = { ...full }
      if (cut) {
        if (hz) { if (p.to > p.from) shape.x0 += cut; else shape.x1 -= cut } else if (p.to > p.from) shape.y1 -= cut; else shape.y0 += cut
      }
      let node = null
      if (!p.empty) {
        const fill = paint(p.color, p.pattern, p.mark)
        if (grouped) {
          const d = rounded(shape, p.to > 0, p.to < 0)
          node = shapes.append('path').attr('d', d).attr('fill', fill)
          if (shadow) shadow.path(d)
        } else {
          node = shapes.append('rect').attr('x', Math.round(shape.x0 * 100) / 100).attr('y', Math.round(shape.y0 * 100) / 100).attr('width', Math.max(0, Math.round((shape.x1 - shape.x0) * 100) / 100)).attr('height', Math.max(0, Math.round((shape.y1 - shape.y0) * 100) / 100)).attr('fill', fill)
        }
        node.attr('class', 'part')
      }
      // What is left for texts and icons, beside the bar's own icon.
      const free = { ...shape }
      if (reserve && (p.to > p.from) === upwards) {
        const limit = at(0) + (hz === upwards ? reserve : -reserve)
        if (hz) { if (upwards) free.x0 = Math.max(free.x0, limit); else free.x1 = Math.min(free.x1, limit) } else if (upwards) free.y1 = Math.min(free.y1, limit); else free.y0 = Math.max(free.y0, limit)
      }
      const label = p.empty ? null : drawContent(shapes, p, free)
      const item = { key: p.key, part: p, bar: b, uid: b.uid, box: shape, node: node && node.node(), color: p.color, pattern: p.pattern, mark: p.mark, label, endLabel: null }
      out.parts.push(item)
      if (grouped) item.endLabel = drawEnd(ends[endIndex++], pu0 + each / 2, p.to, null)
    })

    let iconBox = null
    if (insideSize) {
      const c = at(0) + (hz === upwards ? 1 : -1) * (reserve / 2 + 1 * k)
      const cx = hz ? c : slot.cu
      const cy = hz ? slot.cu : c
      iconBox = { x0: cx - insideSize / 2, y0: cy - insideSize / 2, x1: cx + insideSize / 2, y1: cy + insideSize / 2 }
      const firstLength = first ? Math.abs(first.to - first.from) * scale.per : 0
      const ground = first ? paint.ground(first.color, first.pattern, first.mark) : background
      if (first && firstLength >= reserve && !first.pattern) drawIcon(g, b.icon.path, iconBox.x0, iconBox.y0, insideSize, inkOn(ground, { text: true }), 1.4 * k)
      else {
        // Across several parts, or on a pattern: on a disc, so it stays readable.
        g.append('circle').attr('cx', round1(cx)).attr('cy', round1(cy)).attr('r', round1(insideSize * 0.62)).attr('fill', background)
        const size = insideSize * 0.8
        drawIcon(g, b.icon.path, cx - size / 2, cy - size / 2, size, ink, 1.3 * k)
      }
    }
    let total = null
    if (!grouped) {
      const e = ends[bi]
      total = drawEnd(e, slot.cu, e.positive ? b.up : b.down, b)
      if (total && total.iconBox) iconBox = total.iconBox
    }

    // ---- its name and icon beside the axis ----
    const lines = names[bi]
    let nameNode = null
    let nameBox = null
    if (hz) {
      let x = x0 - 12 * k
      if (axisIcon) {
        if (b.icon) {
          iconBox = { x0: x - axisIcon, y0: slot.cu - axisIcon / 2, x1: x, y1: slot.cu + axisIcon / 2 }
          drawIcon(labelLayer, b.icon.path, iconBox.x0, iconBox.y0, axisIcon, ink, 1.3 * k)
        }
        x -= axisIcon + 12 * k
      }
      const lineH = namePx * 1.22
      lines.forEach((str, i) => {
        const y = slot.cu + namePx * 0.35 + (i - (lines.length - 1) / 2) * lineH
        const t = text(labelLayer, x, y, str, { px: namePx, anchor: 'end' }).attr('class', 'bar-name')
        nameNode = nameNode || t.node()
      })
      const w = Math.max(16 * k, ...lines.map(l => textWidth(l, namePx, 400, font)))
      nameBox = { x0: x - w, y0: slot.cu - Math.max(1, lines.length) * lineH / 2, x1: x, y1: slot.cu + Math.max(1, lines.length) * lineH / 2 }
    } else {
      let y = area.y1 + 9 * k
      if (axisIcon) {
        if (b.icon) {
          iconBox = { x0: slot.cu - axisIcon / 2, y0: y, x1: slot.cu + axisIcon / 2, y1: y + axisIcon }
          drawIcon(labelLayer, b.icon.path, iconBox.x0, iconBox.y0, axisIcon, ink, 1.3 * k)
        }
        y += axisIcon + 5 * k
      }
      if (slanted) {
        const tx = slot.cu + namePx * 0.3
        const ty = y + namePx * 0.75
        const t = text(labelLayer, tx, ty, lines[0], { px: namePx, anchor: 'end' }).attr('class', 'bar-name').attr('transform', `rotate(-45 ${round1(tx)},${round1(ty)})`)
        nameNode = t.node()
        nameBox = { x0: slot.cu - Math.min(slots.slot / 2, 24 * k), y0: y, x1: slot.cu + Math.min(slots.slot / 2, 24 * k), y1: y + 26 * k }
      } else {
        lines.forEach((str, i) => {
          const t = text(labelLayer, slot.cu, y + namePx * 0.9 + i * namePx * 1.25, str, { px: namePx, anchor: 'middle' }).attr('class', 'bar-name')
          nameNode = nameNode || t.node()
        })
        const w = Math.max(16 * k, ...lines.map(l => textWidth(l, namePx, 400, font)))
        nameBox = { x0: slot.cu - w / 2, y0: y, x1: slot.cu + w / 2, y1: y + Math.max(1, lines.length) * namePx * 1.25 }
      }
    }
    out.bars.push({
      uid: b.uid, bar: b, box: whole, slot: hz ? { x0: margin, y0: slot.u0, x1, y1: slot.u1 } : { x0: slot.u0, y0, x1: slot.u1, y1: area.y1 },
      nameNode, nameBox: showNames ? nameBox : null, iconBox, total: total && total.node ? total : null
    })
  })
  // The baseline goes over the bars' square ends.
  across(at(0), mixColor(gridColor, ink, 0.42), labelLayer)

  // The amount (and icon) beyond an end.
  function drawEnd (e, cu, v, bar) {
    if (!e || (!e.text && !e.icon)) return null
    const dir = (e.positive ? 1 : -1) * (hz ? 1 : -1) // towards larger pixels or smaller ones
    let p = at(v)
    const res = { node: null, box: null, iconBox: null }
    if (e.icon && bar) {
      const c = p + dir * (6 * k + e.icon / 2)
      const cx = hz ? c : cu
      const cy = hz ? cu : c
      res.iconBox = { x0: cx - e.icon / 2, y0: cy - e.icon / 2, x1: cx + e.icon / 2, y1: cy + e.icon / 2 }
      drawIcon(labelLayer, bar.icon.path, res.iconBox.x0, res.iconBox.y0, e.icon, ink, 1.3 * k)
      p += dir * (6 * k + e.icon)
    }
    if (!e.text) return res
    const w = endW(e.text)
    let t
    if (hz) {
      const x = p + dir * 7 * k
      t = text(labelLayer, x, cu + totalPx * 0.35, e.text, { px: totalPx, weight: 500, anchor: dir > 0 ? 'start' : 'end' })
      res.box = { x0: dir > 0 ? x : x - w, y0: cu - totalPx * 0.6, x1: dir > 0 ? x + w : x, y1: cu + totalPx * 0.6 }
    } else if (scale.turned) {
      const x = cu + totalPx * 0.35
      const y = p + dir * 6 * k
      t = text(labelLayer, x, y, e.text, { px: totalPx, weight: 500, anchor: dir < 0 ? 'start' : 'end' }).attr('transform', `rotate(-90 ${round1(x)},${round1(y)})`)
      res.box = { x0: cu - totalPx * 0.6, y0: dir < 0 ? y - w : y, x1: cu + totalPx * 0.6, y1: dir < 0 ? y : y + w }
    } else {
      const y = dir < 0 ? p - 6 * k : p + 6 * k + totalPx * 0.75
      t = text(labelLayer, cu, y, e.text, { px: totalPx, weight: 500, anchor: 'middle' })
      res.box = { x0: cu - w / 2, y0: y - totalPx * 0.85, x1: cu + w / 2, y1: y + totalPx * 0.2 }
    }
    res.node = t.attr('class', 'end-label').node()
    return res
  }

  // Icon, value and share in a part, in a column or a row; whatever doesn't fit is left out.
  // Returns where the text is, for editing it: { node, box } or null.
  function drawContent (parent, p, r) {
    const want = { icon: s('seriesIcons') && !!p.icon, value: s('showValues'), share: s('showShares') && !(grouped && model.single) }
    if (!want.icon && !want.value && !want.share) return null
    const w = r.x1 - r.x0
    const h = r.y1 - r.y0
    if (w < 9 || h < 9) return null
    const lineH = 14 * k
    const ground = paint.ground(p.color, p.pattern, p.mark)
    const fill = inkOn(ground, { text: true })
    const iconSize = Math.min(iconMax, (hz ? h : w) * 0.6)
    const amount = formatAmount(doc, p.amount, { unit: false })
    const pct = formatShare(p.share)
    const lists = [['icon', 'value', 'share'], ['icon', 'value'], ['icon', 'share'], ['value', 'share'], ['value'], ['share'], ['icon']]
      .map(list => list.filter(x => want[x])).filter((list, i, all) => list.length && all.findIndex(o => o.join() === list.join()) === i)
    for (const list of lists) {
      const texts = [list.includes('value') && amount, list.includes('share') && pct].filter(Boolean)
      const icon = list.includes('icon') ? iconSize : 0
      if (icon && icon < 10) continue
      const widths = texts.map(t => textWidth(t, partPx, 400, font))
      const layouts = {
        column: { w: Math.max(icon, ...widths, 0), h: icon + (icon && texts.length ? 4 * k : 0) + texts.length * lineH, lines: texts },
        row: (() => { const str = texts.join(' · '); const tw = str ? textWidth(str, partPx, 400, font) : 0; return { w: icon + (icon && str ? 5 * k : 0) + tw, h: Math.max(icon, str ? lineH : 0), lines: str ? [str] : [] } })()
      }
      for (const kind of hz ? ['row', 'column'] : ['column', 'row']) {
        const l = layouts[kind]
        if (l.w > w - 6 || l.h > h - (texts.length ? 4 : 6)) continue
        const cx = (r.x0 + r.x1) / 2
        const cy = (r.y0 + r.y1) / 2
        if (p.pattern) drawPlate(parent, cx - l.w / 2 - 4 * k, cy - l.h / 2 - 2 * k, cx + l.w / 2 + 4 * k, cy + l.h / 2 + 2 * k, ground)
        let node = null
        if (kind === 'row') {
          let x = cx - l.w / 2
          if (icon) { drawIcon(parent, p.icon.path, x, cy - icon / 2, icon, fill, 1.35 * k); x += icon + 5 * k }
          l.lines.forEach(str => { node = text(parent, x, cy + partPx * 0.35, str, { px: partPx, fill }) })
        } else {
          let y = cy - l.h / 2
          if (icon) { drawIcon(parent, p.icon.path, cx - icon / 2, y, icon, fill, 1.35 * k); y += icon + (texts.length ? 4 * k : 0) }
          l.lines.forEach((str, i) => { const t = text(parent, cx, y + lineH * 0.77 + i * lineH, str, { px: partPx, anchor: 'middle', fill }); node = node || t })
        }
        if (!node) return null
        return { node: node.node(), box: { x0: cx - l.w / 2 + (kind === 'row' && icon ? icon + 5 * k : 0), y0: cy + (kind === 'row' ? -lineH / 2 : l.h / 2 - texts.length * lineH), x1: cx + l.w / 2, y1: cy + (kind === 'row' ? lineH / 2 : l.h / 2) } }
      }
    }
    return null
  }
  return out
}
