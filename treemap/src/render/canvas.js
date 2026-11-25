// The treemap editor's canvas: the diagram on the shared artboard, and an overlay for
// editing: hit areas for tiles, block headers, group names and legend entries,
// selection, the + handle for new values, and the drop mark when reordering.

import { lib } from '../../../shared/src/lib.js'
import { createArtboard } from '../../../shared/src/artboard.js'
import { getSetting } from '../model/schema.js'
import { vividColor } from '../../../shared/src/color.js'
import { drawTreemap, fontStack } from './treemap.js'

export function createCanvas (container) {
  const d3 = lib.d3
  const board = createArtboard(container, { getSetting, fontStack, layers: ['hits', 'selection', 'title', 'drop'], onTransform: () => renderOverlay() })
  const { screenPx, diagram } = board
  const { hits, selection: selectionLayer, drop } = board.layer

  let lastState = null
  let last = null
  let hoverKey = null

  // state: { doc, model, selection, issueMarks }
  function render (state) {
    lastState = state
    board.begin(state.doc)
    last = drawTreemap(diagram.node(), state.doc, state.model)
    setHover(hoverKey)
    renderOverlay()
    return last
  }

  const rectTo = (sel, box, pad = 0) => sel.attr('x', d => box(d).x0 - pad).attr('y', d => box(d).y0 - pad)
    .attr('width', d => Math.max(0, box(d).x1 - box(d).x0 + pad * 2)).attr('height', d => Math.max(0, box(d).y1 - box(d).y0 + pad * 2))

  function renderOverlay () {
    if (!last) return
    const { selection, issueMarks } = lastState
    const px = screenPx
    board.renderTitle()

    const groups = hits.selectAll('rect.hit-group').data(last.groups, d => d.name).join(enter => {
      const r = enter.append('rect').attr('class', 'hit hit-text hit-group').attr('data-hit', 'group')
      r.append('title').text('Click to rename this group')
      return r
    }).attr('data-name', d => d.name)
    rectTo(groups, d => d.box, px(3))

    // Everything of one block sits in one group, so hovering any of it shows the + handle.
    const blocks = hits.selectAll('g.block-hit').data(last.blocks, d => d.uid).join(enter => {
      const g = enter.append('g').attr('class', 'block-hit')
      g.append('rect').attr('class', 'hit hit-head').attr('data-hit', 'block')
      g.append('rect').attr('class', 'hit hit-text hit-block-title').attr('data-hit', 'block').attr('data-part', 'title')
        .append('title').text('Click to edit, drag onto another block to move')
      g.append('g').attr('class', 'tile-hits')
      const add = g.append('g').attr('class', 'add-handle').attr('data-hit', 'add')
      add.append('title').text('Add a value to this block')
      add.append('circle')
      add.append('path')
      return g
    })
    blocks.classed('selected', d => selection.blocks.has(d.uid) || selection.carriers.has(d.uid))
    blocks.selectAll('[data-hit]').attr('data-uid', d => d.uid)
    rectTo(blocks.select('.hit-head'), d => d.head)
    rectTo(blocks.select('.hit-block-title'), d => d.name, px(2))
    blocks.select('.add-handle').each(function (d) {
      const g = d3.select(this)
      const r = px(8)
      // After the name, or at the corner of the tiles when the header is full.
      const x = d.name.x1 + px(14)
      const free = x + r < d.totalX - px(4)
      const cx = free ? x : d.box.x1 - px(2)
      const cy = free ? (d.name.y0 + d.name.y1) / 2 : d.head.y1 - px(2)
      g.attr('transform', `translate(${cx},${cy})`)
      g.select('circle').attr('r', r).attr('stroke-width', px(1.5))
      g.select('path').attr('d', `M${-r / 2},0H${r / 2}M0,${-r / 2}V${r / 2}`).attr('stroke-width', px(1.7))
    })
    blocks.select('.tile-hits').each(function (d) {
      const tiles = d3.select(this).selectAll('rect').data(last.tiles.filter(t => t.blockUid === d.uid), t => t.tile.key)
        .join('rect').attr('class', 'hit hit-tile').attr('data-hit', 'tile').attr('data-uid', t => t.uid)
      rectTo(tiles, t => t.box)
    })

    const legend = hits.selectAll('rect.hit-legend').data(last.legend, d => d.uid).join('rect').attr('class', 'hit hit-legend').attr('data-hit', 'legend').attr('data-uid', d => d.uid)
    rectTo(legend, d => d.box)

    // Selection outlines, drawn inside the tile so neighbours stay readable.
    const isSelected = t => t.tile.uids.some(u => selection.values.has(u))
    const related = t => !isSelected(t) && (selection.carriers.has(t.tile.highlight) || selection.blocks.has(t.tile.highlight))
    const outline = (cls, data, inset, width) => {
      const sel = selectionLayer.selectAll(`rect.${cls}`).data(data, d => d.tile.key).join('rect').attr('class', cls).attr('stroke-width', px(width))
      rectTo(sel, d => d.box, -px(inset))
    }
    outline('sel-related', last.tiles.filter(related), 1, 2)
    outline('sel-tile-rim', last.tiles.filter(isSelected), 3.2, 1.6)
    outline('sel-tile', last.tiles.filter(isSelected), 1.25, 2.5)
    outline('issue-tile', last.tiles.filter(t => t.tile.uids.some(u => issueMarks.has(u))), 5, 1.5)
    const selBlocks = selectionLayer.selectAll('rect.sel-block').data(last.blocks.filter(d => selection.blocks.has(d.uid) || selection.carriers.has(d.uid)), d => d.uid).join('rect').attr('class', 'sel-block').attr('rx', px(6)).attr('stroke-width', px(1.5))
    rectTo(selBlocks, d => d.box, px(6))
  }

  // Pick out one carrier (per block) or block (per carrier): its tiles turn more vivid.
  function setHover (key) {
    hoverKey = key
    if (!last) return
    last.tiles.forEach(t => t.node.setAttribute('fill', last.paint(key && t.tile.highlight === key ? vividColor(t.tile.color) : t.tile.color, t.tile.pattern, t.tile.mark)))
    last.legend.forEach(l => l.chipNode.setAttribute('fill', last.paint(key && l.uid === key ? vividColor(l.color) : l.color, l.pattern, l.mark)))
  }

  // Where a dragged block would land: a bar on one side of the target block.
  // d: { uid, targetUid, after } or null
  function setDrop (d) {
    const target = d && d.targetUid && last.blocks.find(b => b.uid === d.targetUid)
    const bar = []
    if (target) {
      const b = target.box
      const wide = b.x1 - b.x0 >= (b.y1 - b.y0) * 0.6
      const gap = Math.max(screenPx(4), getSetting(lastState.doc, 'blockGap') / 2)
      bar.push(wide
        ? { x0: (d.after ? b.x1 + gap : b.x0 - gap), y0: b.y0, x1: (d.after ? b.x1 + gap : b.x0 - gap), y1: b.y1 }
        : { x0: b.x0, y0: (d.after ? b.y1 + gap : b.y0 - gap), x1: b.x1, y1: (d.after ? b.y1 + gap : b.y0 - gap) })
    }
    drop.selectAll('line.drop-bar').data(bar).join('line').attr('class', 'drop-bar').attr('stroke-width', screenPx(4))
      .attr('x1', l => l.x0).attr('y1', l => l.y0).attr('x2', l => l.x1).attr('y2', l => l.y1)
    const moving = d ? last.blocks.filter(b => b.uid === d.uid) : []
    const veil = drop.selectAll('rect.drop-source').data(moving, b => b.uid).join('rect').attr('class', 'drop-source').attr('rx', screenPx(6))
    rectTo(veil, b => b.box, screenPx(4))
  }

  // The block under a point and which half of it the point is in.
  function blockAt (p, exceptUid) {
    const b = last && last.blocks.find(x => x.uid !== exceptUid && p.x >= x.box.x0 && p.x <= x.box.x1 && p.y >= x.box.y0 && p.y <= x.box.y1)
    if (!b) return null
    const wide = b.box.x1 - b.box.x0 >= (b.box.y1 - b.box.y0) * 0.6
    return { uid: b.uid, after: wide ? p.x > (b.box.x0 + b.box.x1) / 2 : p.y > (b.box.y0 + b.box.y1) / 2 }
  }

  function reveal (boxes) {
    if (!boxes.length) return
    const pad = 12
    board.revealBox({ x0: Math.min(...boxes.map(b => b.x0)) - pad, y0: Math.min(...boxes.map(b => b.y0)) - pad, x1: Math.max(...boxes.map(b => b.x1)) + pad, y1: Math.max(...boxes.map(b => b.y1)) + pad })
  }

  return board.extend({ render, setHover, setDrop, blockAt, reveal, get result () { return last } })
}
