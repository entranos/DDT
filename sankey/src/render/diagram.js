// Draws the diagram itself (title, flows, nodes, labels) into an SVG <g>.
// The editor canvas and the image export both use this, so what you see is
// what you export. Styling is set as attributes, never through page CSS, so a
// serialised copy renders the same anywhere.
//
// Label conventions kept from earlier versions:
//   title starting with "."  → no labels for this node
//   title starting with "_"  → the value is shown in place of the title
//   nodes without flows      → left out of exports (shown dashed in the editor)

import { lib } from '../../../shared/src/lib.js'
import { getSetting } from '../model/schema.js'
import { formatValue } from '../../../shared/src/format.js'
import { placeFlowIcons } from './flowIcons.js'
import { fontStack } from '../../../shared/src/svgText.js'
import { inkOn } from '../../../shared/src/color.js'
import { createPaint } from '../../../shared/src/patterns.js'
import { createShadow } from '../../../shared/src/shadow.js'

export { fontStack }

export function labelTexts (doc, node) {
  const raw = node.title || ''
  const valueText = formatValue(node.value || 0, getSetting(doc, 'decimalsRoundValues'), getSetting(doc, 'unit'))
  if (raw.startsWith('.')) return { title: null, value: null }
  if (raw.startsWith('_')) return { title: valueText, value: null }
  return { title: raw || null, value: getSetting(doc, 'showValueLabels') ? valueText : null }
}

function ensureGroup (parent, cls) {
  let g = parent.select(`:scope > g.${cls}`)
  if (g.empty()) g = parent.append('g').attr('class', cls)
  return g
}

const CHIP_GAP_NODE = 15
const CHIP_GAP = 5
const CHIP_PAD = 5

// Returns, in diagram coordinates:
//   labelBoxes: [{uid, x0, y0, x1, y1}] — both chips of each drawn node (overlap checks)
//   chipBoxes:  Map uid → { title, value } — each chip separately, editor nodes included
//   flowIcons:  icons on flows, see flowIcons.js
// iconPreview: { uid, t } while an icon is dragged along its flow.
export function drawDiagram (gElement, doc, layout, { editor = false, iconPreview = null } = {}) {
  const d3 = lib.d3
  const root = d3.select(gElement)
  const s = key => getSetting(doc, key)
  const fs = s('labelFontSize')
  const valueFs = Math.max(6, fs - 1)
  const chipH = Math.round(fs * 1.8)
  const nodeWidth = s('nodeWidth')
  const labelColor = s('labelTextColor')
  const chipColor = s('labelFillColor')

  root.attr('font-family', fontStack(s('font')))
  const offsetX = Number(doc.settings.offsetX) || 0
  const offsetY = Number(doc.settings.offsetY) || 0
  root.attr('transform', offsetX || offsetY ? `translate(${offsetX},${offsetY})` : null)

  let defs = root.select(':scope > defs')
  if (defs.empty()) defs = root.insert('defs', ':first-child')
  defs.selectAll('*').remove()
  const paint = createPaint(defs, s)
  // A node's bar, in the node's own coordinates.
  const bar = n => ({ x: -4, width: nodeWidth, height: n.value > 0 ? Math.max(1, n.dy) : 14 })

  const title = s('title')
  root.selectAll(':scope > text.diagram-title')
    .data(title ? [title] : [])
    .join('text')
    .attr('class', 'diagram-title')
    .attr('x', s('titlePositionX'))
    .attr('y', s('titlePositionY'))
    .attr('font-size', s('titleFontSize'))
    .attr('font-weight', 300)
    .attr('fill', s('titleColor'))
    .text(d => d)

  const under = ensureGroup(root, 'under')
  under.selectAll('*').remove()
  if (s('dropShadow')) {
    const sc = s('scaleCanvas')
    const shadow = createShadow(under, defs, { x: -offsetX, y: -offsetY, width: s('canvasWidth') / sc, height: s('canvasHeight') / sc })
    layout.links.filter(l => l.path).forEach(l => shadow.path(l.path))
    layout.nodes.filter(n => n.value > 0).forEach(n => { const b = bar(n); shadow.rect(n.x0 + b.x, n.y0, n.x0 + b.x + b.width, n.y0 + b.height) })
  }

  ensureGroup(root, 'links')
    .selectAll('path.link')
    .data(layout.links.filter(l => l.path), l => l.uid)
    .join('path')
    .attr('class', 'link')
    .attr('data-uid', l => l.uid)
    .attr('d', l => l.path)
    .attr('fill', l => paint(l.color, l.pattern, l.mark))
    .attr('fill-opacity', s('globalFlowOpacity'))

  // Icons: strokes keep their weight whatever the icon's size.
  const flowIcons = placeFlowIcons(doc, layout, iconPreview)
  const background = s('transparentBackground') ? '#ffffff' : s('backgroundColor')
  ensureGroup(root, 'flow-icons')
    .selectAll('g.flow-icon')
    .data(flowIcons, d => d.uid)
    .join(enter => {
      const g = enter.append('g').attr('class', 'flow-icon')
      g.append('circle')
      g.append('path').attr('fill', 'none').attr('stroke-linecap', 'round').attr('stroke-linejoin', 'round')
      return g
    })
    .attr('transform', d => `translate(${Math.round(d.x * 100) / 100},${Math.round(d.y * 100) / 100})`)
    .each(function (d) {
      const g = d3.select(this)
      // In a circle on thin flows; on a patterned one, a plain disc keeps it readable.
      const disc = d.badge || d.pattern
      const fill = d.badge ? d.color : paint.ground(d.color, d.pattern, d.mark)
      g.select('circle').style('display', disc ? null : 'none').attr('r', d.badge ? d.r : d.size * 0.68).attr('fill', fill).attr('stroke', d.badge ? background : null).attr('stroke-width', d.badge ? 1.5 : null)
      const k = d.size / 24
      g.select('path').attr('d', d.icon.path).attr('transform', `translate(${-d.size / 2},${-d.size / 2}) scale(${Math.round(k * 1000) / 1000})`)
        .attr('stroke', inkOn(fill)).attr('stroke-width', Math.round((d.size > 24 ? 1.6 : 1.4) / k * 100) / 100)
    })

  const shown = editor ? layout.nodes : layout.nodes.filter(n => n.value > 0)
  const nodeSel = ensureGroup(root, 'nodes')
    .selectAll('g.node')
    .data(shown, n => n.uid)
    .join(enter => {
      const g = enter.append('g').attr('class', 'node')
      g.append('rect').attr('class', 'node-bar')
      g.append('rect').attr('class', 'chip chip-title')
      g.append('text').attr('class', 'label label-title')
      g.append('rect').attr('class', 'chip chip-value')
      g.append('text').attr('class', 'label label-value')
      return g
    })

  nodeSel
    .attr('data-uid', n => n.uid)
    .attr('transform', n => `translate(${n.x0},${n.y0})`)
    .classed('empty', n => !(n.value > 0))

  nodeSel.select('.node-bar')
    .attr('x', n => bar(n).x)
    .attr('y', 0)
    .attr('width', n => bar(n).width)
    .attr('height', n => bar(n).height)
    .attr('fill', n => (n.value > 0 ? s('nodeColor') : 'none'))
    .attr('stroke', n => (n.value > 0 ? null : '#9a948a'))
    .attr('stroke-dasharray', n => (n.value > 0 ? null : '3 2'))

  const labelBoxes = []
  const chipBoxes = new Map()
  nodeSel.each(function (n) {
    const g = d3.select(this)
    const texts = labelTexts(doc, n)
    const empty = !(n.value > 0)
    if (empty && !texts.title) texts.title = n.title || n.id
    const cy = empty ? 7 : n.dy / 2
    const left = n.labelLeft
    const titleText = g.select('.label-title')
    const valueText = g.select('.label-value')

    titleText
      .style('display', texts.title ? null : 'none')
      .attr('font-size', fs)
      .attr('font-weight', 300)
      .attr('font-style', empty ? 'italic' : null)
      .attr('fill', empty ? '#8a857d' : labelColor)
      .attr('text-anchor', left ? 'end' : 'start')
      .text(texts.title || '')
    valueText
      .style('display', texts.value && !empty ? null : 'none')
      .attr('font-size', valueFs)
      .attr('font-weight', 400)
      .attr('fill', labelColor)
      .attr('text-anchor', left ? 'end' : 'start')
      .text(texts.value || '')

    const tw = texts.title ? titleText.node().getComputedTextLength() : 0
    const vw = texts.value && !empty ? valueText.node().getComputedTextLength() : 0
    const chipY = cy - chipH / 2 - 1
    const baseline = cy + fs * 0.3
    const dir = left ? -1 : 1
    let cursor = dir * CHIP_GAP_NODE // edge of the next chip, measured from the node

    const placeChip = (chip, text, width, show) => {
      chip.style('display', show && !empty ? null : 'none')
      if (!show) return null
      const w = width + CHIP_PAD * 2
      const x = left ? cursor - w : cursor
      chip.attr('x', x).attr('y', chipY).attr('width', w).attr('height', chipH)
        .attr('rx', 3).attr('ry', 3).attr('fill', chipColor).attr('fill-opacity', 0.8)
      text.attr('x', left ? x + w - CHIP_PAD : x + CHIP_PAD).attr('y', baseline)
      cursor += dir * (w + CHIP_GAP)
      return { x0: n.x0 + x, x1: n.x0 + x + w, y0: n.y0 + chipY, y1: n.y0 + chipY + chipH }
    }
    const titleBox = placeChip(g.select('.chip-title'), titleText, tw, !!texts.title)
    const valueBox = placeChip(g.select('.chip-value'), valueText, vw, !!texts.value && !empty)
    chipBoxes.set(n.uid, { title: titleBox, value: valueBox })
    const boxes = [titleBox, valueBox].filter(Boolean)
    if (boxes.length && !empty) {
      labelBoxes.push({
        uid: n.uid,
        x0: Math.min(...boxes.map(b => b.x0)),
        x1: Math.max(...boxes.map(b => b.x1)),
        y0: Math.min(...boxes.map(b => b.y0)),
        y1: Math.max(...boxes.map(b => b.y1))
      })
    }
  })

  return { labelBoxes, chipBoxes, flowIcons }
}
