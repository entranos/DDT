// The bar chart editor's canvas: the chart on the shared artboard, and an overlay for
// editing: hit areas for parts, bars, names, labels, groups and legend entries, selection,
// the + for another bar, and the drop mark when reordering.

import { lib } from '../../../shared/src/lib.js'
import { createArtboard } from '../../../shared/src/artboard.js'
import { vividColor } from '../../../shared/src/color.js'
import { getSetting } from '../model/schema.js'
import { drawChart, fontStack } from './chart.js'

export function createCanvas (container) {
  const d3 = lib.d3
  const board = createArtboard(container, { getSetting, fontStack, layers: ['hits', 'selection', 'title', 'handles', 'drop'], onTransform: () => renderOverlay() })
  const { screenPx, diagram } = board
  const { hits, selection: selectionLayer, handles, drop } = board.layer
  const add = handles.append('g').attr('class', 'add-handle add-bar').attr('data-hit', 'add-bar')
  add.append('title').text('Add a bar')
  add.append('circle')
  add.append('path')

  let lastState = null
  let last = null
  let hoverUid = null

  // state: { doc, model, selection, cell, issueMarks, frozen }
  function render (state) {
    lastState = state
    board.begin(state.doc)
    last = drawChart(diagram.node(), state.doc, state.model, { frozen: state.frozen || null })
    setHover(hoverUid)
    renderOverlay()
    return last
  }

  const place = (sel, box, pad = 0, min = 0) => sel.each(function (d) {
    const b = box(d)
    const gx = Math.max(0, (min - (b.x1 - b.x0)) / 2) + pad
    const gy = Math.max(0, (min - (b.y1 - b.y0)) / 2) + pad
    d3.select(this).attr('x', b.x0 - gx).attr('y', b.y0 - gy).attr('width', Math.max(0, b.x1 - b.x0 + gx * 2)).attr('height', Math.max(0, b.y1 - b.y0 + gy * 2))
  })

  // Along the values a thin part gets a taller target; across them never, so bars stay apart.
  const partBox = p => {
    const min = screenPx(8)
    const b = p.box
    if (last.horizontal) { const g = Math.max(0, (min - (b.x1 - b.x0)) / 2); return { ...b, x0: b.x0 - g, x1: b.x1 + g } }
    const g = Math.max(0, (min - (b.y1 - b.y0)) / 2)
    return { ...b, y0: b.y0 - g, y1: b.y1 + g }
  }

  function renderOverlay () {
    if (!last) return
    const { selection, cell, issueMarks } = lastState
    const px = screenPx
    board.renderTitle()

    const join = (cls, data, key, hit, tip) => hits.selectAll(`rect.${cls}`).data(data, key).join(enter => {
      const r = enter.append('rect').attr('class', `hit ${cls}`).attr('data-hit', hit)
      if (tip) r.append('title').text(tip)
      return r
    })
    // Parts without an amount have a target too where they would begin, but under the others.
    const parts = [...last.parts.filter(p => p.part.empty), ...last.parts.filter(p => !p.part.empty)]
    place(join('hit-part', parts, d => d.key, 'part').attr('data-uid', d => d.uid).attr('data-key', d => d.key).order(), partBox)
    place(join('hit-value', last.parts.filter(p => p.label), d => d.key, 'value', 'Click to type the amount').attr('data-uid', d => d.uid).attr('data-key', d => d.key), d => d.label.box, px(1))
    const ends = [...last.parts.filter(p => p.endLabel && p.endLabel.box).map(p => ({ key: p.key, uid: p.uid, part: p.key, box: p.endLabel.box })), ...last.bars.filter(b => b.total && b.total.box).map(b => ({ key: b.uid, uid: b.uid, part: '', box: b.total.box }))]
    place(join('hit-end', ends, d => d.key, 'end', 'Click to type the amount').attr('data-uid', d => d.uid).attr('data-key', d => d.part), d => d.box, px(2))
    place(join('hit-icon', last.bars.filter(b => b.iconBox), d => d.uid, 'bar-icon', 'Click to select, double-click for another icon').attr('data-uid', d => d.uid), d => d.iconBox, px(2))
    place(join('hit-name', last.bars.filter(b => b.nameBox), d => d.uid, 'name', 'Click to edit, drag to reorder').classed('hit-text', true).attr('data-uid', d => d.uid), d => d.nameBox, px(2))
    place(join('hit-group', last.groups.filter(g => g.box), d => d.title, 'group', 'Click to rename this group').classed('hit-text', true).attr('data-name', d => d.title), d => d.box, px(3))
    place(join('hit-axis-title', last.axisTitle ? [last.axisTitle] : [], () => 'a', 'axis-title', 'Click to edit the axis title').classed('hit-text', true), d => d.box, px(3))
    place(join('hit-subtitle', last.subtitle ? [last.subtitle] : [], () => 's', 'subtitle', 'Click to edit the subtitle').classed('hit-text', true), d => d.box, px(3))
    place(join('hit-legend', last.legend, l => l.uid, 'legend').attr('data-uid', l => l.uid), d => d.box)
    board.svg.classed('is-horizontal', last.horizontal)

    // + after the last bar
    const b = last.bars[last.bars.length - 1]
    add.style('display', b ? null : 'none')
    if (b) {
      const r = px(8)
      const name = b.nameBox || b.slot
      const x = last.horizontal ? (b.nameBox ? b.nameBox.x1 - r : b.slot.x0 + r) : Math.min(getSetting(lastState.doc, 'canvasWidth') / getSetting(lastState.doc, 'scaleCanvas') - r, last.area.x1 + px(14))
      const y = last.horizontal ? last.area.y1 + px(14) : (b.nameBox ? (name.y0 + name.y1) / 2 : last.area.y1 + px(12))
      add.attr('transform', `translate(${x},${y})`)
      add.select('circle').attr('r', r).attr('stroke-width', px(1.5))
      add.select('path').attr('d', `M${-r / 2},0H${r / 2}M0,${-r / 2}V${r / 2}`).attr('stroke-width', px(1.7))
    }

    // Selection
    const active = cell && selection.bars.has(cell.bar) ? `${cell.bar}|${cell.series}` : null
    const drawn = last.parts.filter(p => !p.part.empty)
    const outline = (cls, data, inset, width) => place(selectionLayer.selectAll(`rect.${cls}`).data(data, d => d.key).join('rect').attr('class', cls).attr('stroke-width', px(width)), d => d.box, -px(inset), px(3))
    outline('sel-related', drawn.filter(p => p.key !== active && selection.series.has(p.part.series.uid)), 0.5, 1.6)
    outline('sel-item', drawn.filter(p => p.key === active), 0.5, 2.2)
    const frames = last.bars.filter(d => selection.bars.has(d.uid) || issueMarks.has(d.uid)).map(d => ({ d, issue: !selection.bars.has(d.uid) }))
    const frame = selectionLayer.selectAll('rect.sel-frame').data(frames, f => f.d.uid).join('rect').attr('class', f => `sel-frame${f.issue ? ' issue-item' : active && f.d.uid === cell.bar ? ' faint' : ''}`).attr('rx', px(5)).attr('stroke-width', px(1.5))
    place(frame, f => f.d.box, px(3), px(8))
  }

  // Pick out one series in every bar: its parts turn more vivid.
  function setHover (uid) {
    hoverUid = uid
    if (!last) return
    const { paint } = last
    last.parts.forEach(p => { if (p.node) p.node.setAttribute('fill', paint(uid && p.part.series.uid === uid ? vividColor(p.color) : p.color, p.pattern, p.mark)) })
    last.legend.forEach(l => l.chipNode.setAttribute('fill', paint(uid === l.uid ? vividColor(l.color) : l.color, l.pattern, l.mark)))
  }

  // Where a dragged bar would land: a line between two slots.
  function setDrop (d) {
    const target = d && last.bars.find(b => b.uid === d.uid)
    const lines = []
    if (target) {
      const b = target.slot
      if (last.horizontal) { const y = d.after ? b.y1 : b.y0; lines.push({ x0: b.x0, x1: last.area.x1, y0: y, y1: y }) } else { const x = d.after ? b.x1 : b.x0; lines.push({ x0: x, x1: x, y0: b.y0, y1: b.y1 }) }
    }
    drop.selectAll('line.drop-bar').data(lines).join('line').attr('class', 'drop-bar').attr('stroke-width', screenPx(3))
      .attr('x1', l => l.x0).attr('x2', l => l.x1).attr('y1', l => l.y0).attr('y2', l => l.y1)
  }

  // The bar whose slot a point is in, across the bars; or the nearest one.
  function barAt (p, exceptUid) {
    if (!last || !last.bars.length) return null
    const u = last.horizontal ? p.y : p.x
    const range = b => (last.horizontal ? [b.slot.y0, b.slot.y1] : [b.slot.x0, b.slot.x1])
    const away = b => { const [a, z] = range(b); return u < a ? a - u : u > z ? u - z : 0 }
    const best = last.bars.reduce((m, b) => (away(b) < away(m) ? b : m))
    if (best.uid === exceptUid) return null
    const [a, z] = range(best)
    return { uid: best.uid, after: u > (a + z) / 2 }
  }

  function reveal (boxes) {
    if (!boxes.length) return
    const pad = 12
    board.revealBox({ x0: Math.min(...boxes.map(b => b.x0)) - pad, y0: Math.min(...boxes.map(b => b.y0)) - pad, x1: Math.max(...boxes.map(b => b.x1)) + pad, y1: Math.max(...boxes.map(b => b.y1)) + pad })
  }

  return board.extend({
    render,
    setHover,
    setDrop,
    barAt,
    reveal,
    part: key => (last ? last.parts.find(p => p.key === key) : null),
    barOf: uid => (last ? last.bars.find(b => b.uid === uid) : null),
    get result () { return last }
  })
}
