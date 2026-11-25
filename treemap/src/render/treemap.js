// Draws the treemap (title, legend, groups, blocks, tiles) into an SVG <g>. The editor
// canvas and the image export both use it, so what you see is what you export. Styling
// is set as attributes, never through page CSS.

import { lib } from '../../../shared/src/lib.js'
import { getSetting } from '../model/schema.js'
import { inkOn } from '../../../shared/src/color.js'
import { formatNumber, formatAuto } from '../../../shared/src/format.js'
import { fontStack, textWidth, fitText, drawIcon } from '../../../shared/src/svgText.js'
import { layoutLegend, drawLegend } from '../../../shared/src/legend.js'
import { createPaint, drawPlate } from '../../../shared/src/patterns.js'
import { createShadow } from '../../../shared/src/shadow.js'
import { layoutTreemap } from './layout.js'

const BASE = 11.5 // block title size all other sizes relate to

export { fontStack }

export const unitOf = doc => String(getSetting(doc, 'unit') || '').trim()

export function formatAmount (doc, value, { unit = true } = {}) {
  const n = formatAuto(value, getSetting(doc, 'decimals'))
  return unit && unitOf(doc) ? `${n} ${unitOf(doc)}` : n
}

export const formatShare = share => `${formatNumber(share * 100, share < 0.0995 ? 1 : 0)}%`

// Returns { paint, layout, box, groups, blocks, tiles, legend, perUnit, fits } for the overlay:
// every item with its box in diagram units.
export function drawTreemap (gNode, doc, model) {
  const d3 = lib.d3
  const s = key => getSetting(doc, key)
  const sc = s('scaleCanvas')
  const W = s('canvasWidth') / sc
  const H = s('canvasHeight') / sc
  const k = s('fontSize') / BASE
  const margin = s('margin')
  const ink = s('textColor')
  const muted = s('mutedTextColor')
  const font = fontStack(s('font'))
  const round = v => Math.round(v * 10) / 10
  const root = d3.select(gNode).attr('font-family', font)
  root.selectAll(':scope > *').remove()
  const defs = root.append('defs')
  const paint = createPaint(defs, s)

  const text = (parent, x, y, str, { px = 11 * k, weight = 400, anchor = 'start', fill = ink } = {}) =>
    parent.append('text').attr('x', round(x)).attr('y', round(y)).attr('font-size', round(px)).attr('font-weight', weight)
      .attr('text-anchor', anchor).attr('fill', fill).text(str)
  const iconPath = drawIcon

  const title = s('title')
  if (title) {
    root.append('text').attr('class', 'diagram-title').attr('x', s('titlePositionX')).attr('y', s('titlePositionY'))
      .attr('font-size', s('titleFontSize')).attr('font-weight', 400).attr('fill', s('titleColor')).text(title)
  }

  const legendPos = s('legend')
  const legendGrid = legendPos === 'none' ? null : layoutLegend(model.legend, { width: W - 2 * margin, k, font, icons: s('tileIcons') || s('showBlockIcons') })

  const titleBottom = title ? s('titlePositionY') + s('titleFontSize') * 0.3 : 0
  let top = margin
  if (title && titleBottom < H * 0.3) top = Math.max(margin, titleBottom + 22 * k)
  const legendTop = legendPos === 'top' ? top : null
  if (legendGrid && legendPos === 'top') top += legendGrid.height + 24 * k
  const bottom = H - margin - (legendGrid && legendPos === 'bottom' ? legendGrid.height + 24 * k : 0)
  const box = { x: margin, y: top, w: W - 2 * margin, h: bottom - top }

  // ---- layout ----
  const groupLabels = s('showGroupLabels')
  const pad = { groupGap: s('groupGap'), groupLabel: 30 * k, blockGap: s('blockGap'), blockHead: 30 * k, tileGap: s('tileGap') }
  const layout = layoutTreemap(model, {
    width: box.w,
    height: box.h,
    chart: s('chart'),
    pad,
    areaPerUnit: s('scaleMode') === 'fixed' ? s('areaPerUnit') : null,
    hasGroupLabel: g => groupLabels && !!g.title
  })
  const at = n => ({ x0: n.x0 + box.x, y0: n.y0 + box.y, x1: n.x1 + box.x, y1: n.y1 + box.y })
  const out = { paint, layout, box, groups: [], blocks: [], tiles: [], legend: [], perUnit: layout ? layout.perUnit : null, fits: !layout || (layout.width <= box.w + 1 && layout.height <= box.h + 1) }

  // ---- groups ----
  const groupLayer = root.append('g').attr('class', 'groups')
  const groupPx = 10 * k
  if (layout && groupLabels) {
    layout.groups.forEach(n => {
      const name = n.group.title
      if (!name) return
      const r = at(n)
      const w = r.x1 - r.x0
      const g = groupLayer.append('g')
      const spacing = 0.12 * groupPx
      const label = name.toUpperCase()
      const total = s('showGroupTotals') ? formatAmount(doc, n.group.total) : ''
      const labelW = textWidth(label, groupPx, 400, font) + label.length * spacing
      const totalW = total ? textWidth(total, groupPx, 400, font) + total.length * 0.04 * groupPx : 0
      // Label and total must fit the group's width: the total goes first, then the name is shortened.
      const showTotal = total && labelW + 12 * k + totalW <= w
      const fitted = labelW <= w ? label : fitText(label, w - label.length * spacing * 0.8, groupPx, 400, font)
      const t = text(g, r.x0, r.y0 + 10 * k, fitted, { px: groupPx }).attr('class', 'group-label').attr('letter-spacing', round(spacing))
      if (showTotal) text(g, r.x0 + labelW + 12 * k, r.y0 + 10 * k, total, { px: groupPx, fill: muted }).attr('letter-spacing', round(0.04 * groupPx))
      g.append('line').attr('x1', r.x0).attr('x2', r.x1).attr('y1', r.y0 + 18.5 * k).attr('y2', r.y0 + 18.5 * k).attr('stroke', ink).attr('stroke-width', 1)
      out.groups.push({ name, box: { x0: r.x0, y0: r.y0 - 2 * k, x1: r.x0 + Math.min(w, labelW), y1: r.y0 + 16 * k }, node: t.node(), area: r })
    })
  }

  // ---- blocks ----
  const shadow = s('dropShadow') ? createShadow(root, defs, { x: 0, y: 0, width: W, height: H }) : null
  const blockLayer = root.append('g').attr('class', 'blocks')
  const tileLayer = root.append('g').attr('class', 'tiles')
  const titlePx = BASE * k
  const totalPx = 11 * k
  const radius = s('cornerRadius')
  ;(layout ? layout.blocks : []).forEach((n, bi) => {
    const r = at(n)
    const w = r.x1 - r.x0
    const { block } = n
    const g = blockLayer.append('g').attr('class', 'block').attr('data-uid', block.uid)
    // Icon, title and total share the header strip; the total gives way first, then the icon.
    // A name may run a little into the gap beside it rather than lose its last letters.
    const titleW = textWidth(block.title, titlePx, 400, font)
    const wide = w + Math.min(12, pad.blockGap / 2)
    const hasIcon = s('showBlockIcons') && block.icon
    const icon = hasIcon && (24 * k + titleW <= wide || (w < 44 * k && titleW > wide)) ? block.icon.path : null
    const inset = icon ? 24 * k : 0
    if (icon) iconPath(g, icon, r.x0, r.y0 + 2 * k, 16 * k, ink, 1.2 * k)
    const total = s('showBlockTotals') ? formatAmount(doc, block.total) : ''
    const totalW = total ? textWidth(total, totalPx, 400, font) : 0
    const room = w - inset - (total ? totalW + 12 * k : 0)
    const showTotal = total && room >= titleW
    const name = fitText(block.title, showTotal ? room : wide - inset, titlePx, 400, font)
    const nameNode = text(g, r.x0 + inset, r.y0 + 14 * k, name, { px: titlePx }).attr('class', 'block-title')
    if (showTotal) text(g, r.x1, r.y0 + 14 * k, total, { px: totalPx, anchor: 'end', fill: muted })
    const nameW = name ? textWidth(name, titlePx, 400, font) : 0
    out.blocks.push({
      uid: block.uid,
      block,
      box: r,
      head: { x0: r.x0, y0: r.y0, x1: r.x1, y1: r.y0 + pad.blockHead },
      name: { x0: r.x0 + inset, y0: r.y0 + 1 * k, x1: r.x0 + inset + Math.max(nameW, 12 * k), y1: r.y0 + 19 * k },
      nameNode: nameNode.node(),
      totalX: showTotal ? r.x1 - totalW : r.x1
    })

    // A block's tiles are clipped to one rounded rectangle, so it reads as one shape.
    const area = { x0: r.x0, y0: r.y0 + pad.blockHead, x1: r.x1, y1: r.y1 }
    const clipId = `treemap-clip-${bi}`
    if (shadow) shadow.rect(area.x0, area.y0, area.x1, area.y1, radius)
    if (radius > 0) {
      defs.append('clipPath').attr('id', clipId).append('rect')
        .attr('x', area.x0).attr('y', area.y0).attr('width', Math.max(0, area.x1 - area.x0)).attr('height', Math.max(0, area.y1 - area.y0)).attr('rx', radius).attr('ry', radius)
    }
    const tg = tileLayer.append('g').attr('class', 'block-tiles').attr('clip-path', radius > 0 ? `url(#${clipId})` : null)
    n.tiles.forEach(tn => {
      const t = tn.tile
      const tr = at(tn)
      const share = block.total > 0 ? t.value / block.total : 0
      const rect = tg.append('rect').attr('class', 'tile').attr('x', tr.x0).attr('y', tr.y0).attr('width', tr.x1 - tr.x0).attr('height', tr.y1 - tr.y0).attr('fill', paint(t.color, t.pattern, t.mark)).attr('shape-rendering', 'crispEdges')
      drawTileContent(tg, t, tr, share)
      out.tiles.push({ uid: t.uid, tile: t, box: tr, blockUid: block.uid, node: rect.node(), share })
    })
  })

  // Icon, name, value and share, centred; whatever doesn't fit is left out.
  function drawTileContent (parent, tile, r, share) {
    const tw = r.x1 - r.x0
    const th = r.y1 - r.y0
    const inner = tw - 12 * k
    const want = { icon: s('tileIcons') && !!tile.icon, name: s('tileNames'), value: s('tileValues'), share: s('tileShares') }
    if (!want.icon && !want.name && !want.value && !want.share) return
    const px = 10.5 * k
    const lineH = 13.5 * k
    const ground = paint.ground(tile.color, tile.pattern, tile.mark)
    const fill = inkOn(ground, { text: want.name || want.value || want.share })
    const iconSize = Math.round(Math.max(15 * k, Math.min(36 * k, Math.min(tw, th) * 0.22)))
    const amount = formatAmount(doc, tile.value)
    const pct = formatShare(share)
    const fits = str => textWidth(str, px, 400, font) <= inner
    // From everything asked for, down to the single most telling part.
    const stacks = [
      ['icon', 'name', 'value', 'share'], ['icon', 'name', 'value'], ['icon', 'name', 'share'], ['name', 'value', 'share'], ['name', 'value'], ['name', 'share'],
      ['icon', 'value', 'share'], ['icon', 'value'], ['icon', 'share'], ['value', 'share'], ['icon', 'name'], ['name'], ['value'], ['share'], ['icon']
    ].map(list => list.filter(x => want[x])).filter((list, i, all) => list.length && all.findIndex(o => o.join() === list.join()) === i)
    for (const list of stacks) {
      const lines = []
      if (list.includes('name')) {
        const name = fitText(tile.label, inner, px, 400, font, 5)
        if (!name) continue
        lines.push(name)
      }
      const both = `${amount} · ${pct}`
      if (list.includes('value') && list.includes('share') && fits(both)) lines.push(both)
      else {
        if (list.includes('value')) { if (!fits(amount)) continue; lines.push(amount) }
        if (list.includes('share')) { if (!fits(pct)) continue; lines.push(pct) }
      }
      const withIcon = list.includes('icon')
      if (withIcon && tw < iconSize + (lines.length ? 8 : 16)) continue
      const gap = withIcon && lines.length ? 5 * k : 0
      const height = (withIcon ? iconSize : 0) + gap + lines.length * lineH
      if (height > th - (lines.length ? 8 * k : 16)) continue
      let y = (r.y0 + r.y1) / 2 - height / 2
      const cx = (r.x0 + r.x1) / 2
      if (tile.pattern) {
        const half = Math.max(withIcon ? iconSize / 2 : 0, ...lines.map(l => textWidth(l, px, 400, font) / 2)) + 5 * k
        drawPlate(parent, cx - half, y - 3 * k, cx + half, y + height + 3 * k, ground, 4 * k)
      }
      if (withIcon) { iconPath(parent, tile.icon.path, cx - iconSize / 2, y, iconSize, fill, 1.4 * k); y += iconSize + gap }
      lines.forEach(line => { text(parent, cx, y + lineH * 0.76, line, { px, anchor: 'middle', fill }); y += lineH })
      return
    }
  }

  if (legendGrid) out.legend = drawLegend(root, model.legend, legendGrid, { x: margin, y: legendTop !== null ? legendTop : H - margin - legendGrid.height, ink, icons: s('tileIcons') || s('showBlockIcons'), paint })
  return out
}
