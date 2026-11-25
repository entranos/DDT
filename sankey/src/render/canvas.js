// The editor canvas: an artboard the size of the exported image, zoom and pan,
// and an overlay with everything that is only there for editing (hit targets,
// selection outlines, connect handles, issue badges, grid, marquee).

import { lib } from '../../../shared/src/lib.js'
import { createArtboard } from '../../../shared/src/artboard.js'
import { getSetting } from '../model/schema.js'
import { drawDiagram, fontStack } from './diagram.js'

const HANDLE_R = 7 // visible connect handle, screen pixels
const HANDLE_HIT_R = 11 // its grab area

export function createCanvas (container) {
  const d3 = lib.d3
  // The title's click target and icons on flows sit above flows, below nodes.
  const board = createArtboard(container, {
    getSetting,
    fontStack,
    layers: ['links', 'title', 'selection', 'icons', 'nodes', 'badges'],
    onTransform: () => { renderGrid(); renderOverlay() }
  })
  const { screenPx, diagram, preview, defs } = board
  const linkHits = board.layer.links
  const selectionLayer = board.layer.selection
  const iconHits = board.layer.icons
  const nodeHits = board.layer.nodes
  const badges = board.layer.badges
  const gridPattern = defs.append('pattern').attr('id', 'snapgrid').attr('patternUnits', 'userSpaceOnUse')
  const gridDot = gridPattern.append('circle').attr('fill', '#6f6a62')
  const gridLayer = board.content.insert('rect', ':first-child').attr('class', 'grid-layer').attr('fill', 'url(#snapgrid)')
  // Fills for the issue badges.
  ;[['badge-fill-warning', '#F2B84B', '#C9851A'], ['badge-fill-error', '#E8606B', '#B12F3B']].forEach(([id, top, bottom]) => {
    const g = defs.append('linearGradient').attr('id', id).attr('x1', 0).attr('y1', 0).attr('x2', 0).attr('y2', 1)
    g.append('stop').attr('offset', '0%').attr('stop-color', top)
    g.append('stop').attr('offset', '100%').attr('stop-color', bottom)
  })

  let lastState = null
  let lastLabelBoxes = []
  let lastChipBoxes = new Map()
  let lastIcons = []
  let showGrid = false

  function render (state) {
    lastState = state
    board.begin(state.doc)
    const result = drawDiagram(diagram.node(), state.doc, state.layout, { editor: true, iconPreview: state.iconPreview || null })
    lastIcons = result.flowIcons
    lastLabelBoxes = result.labelBoxes
    lastChipBoxes = result.chipBoxes
    renderGrid()
    renderOverlay()
    return result
  }

  function renderGrid () {
    if (!lastState) return
    const size = Math.max(2, Number(lastState.gridSize) || 20)
    gridPattern.attr('width', size).attr('height', size)
    gridDot.attr('cx', 0.5).attr('cy', 0.5).attr('r', screenPx(1.1))
    const w = getSetting(lastState.doc, 'canvasWidth') / getSetting(lastState.doc, 'scaleCanvas')
    const h = getSetting(lastState.doc, 'canvasHeight') / getSetting(lastState.doc, 'scaleCanvas')
    gridLayer.attr('x', 0).attr('y', 0).attr('width', w).attr('height', h).style('display', showGrid ? null : 'none')
  }

  function renderOverlay () {
    const { doc, layout, selection, issueMarks } = lastState
    const nodeWidth = getSetting(doc, 'nodeWidth')
    const px = screenPx
    board.renderTitle({ x: Number(doc.settings.offsetX) || 0, y: Number(doc.settings.offsetY) || 0 })

    linkHits.selectAll('path')
      .data(layout.links.filter(l => l.path), l => l.uid)
      .join('path')
      .attr('class', l => `hit hit-link${selection.links.has(l.uid) ? ' selected' : ''}`)
      .attr('data-hit', 'link')
      .attr('data-uid', l => l.uid)
      .attr('d', l => l.path)
      .attr('stroke-width', px(8))

    selectionLayer.selectAll('path.sel-link')
      .data(layout.links.filter(l => l.path && selection.links.has(l.uid)), l => l.uid)
      .join('path')
      .attr('class', 'sel-link')
      .attr('d', l => l.path)
      .attr('stroke-width', px(2))

    iconHits.selectAll('circle')
      .data(lastIcons, d => d.uid)
      .join(enter => {
        const c = enter.append('circle').attr('class', 'hit hit-flow-icon').attr('data-hit', 'flow-icon')
        c.append('title').text('Drag along the flow to move this icon')
        return c
      })
      .classed('selected', d => selection.links.has(d.uid))
      .attr('data-uid', d => d.uid)
      .attr('cx', d => d.x).attr('cy', d => d.y).attr('r', d => Math.max(d.r, px(9)))

    const nodeG = nodeHits.selectAll('g.node-hit')
      .data(layout.nodes, n => n.uid)
      .join(enter => {
        const g = enter.append('g').attr('class', 'node-hit')
        g.append('rect').attr('class', 'sel-node')
        g.append('rect').attr('class', 'hit hit-bar').attr('data-hit', 'node')
        // Title and value chips: a click (without dragging) edits them in place.
        g.append('rect').attr('class', 'hit hit-chip hit-title').attr('data-hit', 'node')
        g.append('rect').attr('class', 'hit hit-chip hit-value').attr('data-hit', 'node')
        // Connect handle: a generous invisible grab area with the visible dot on top of it.
        g.append('circle').attr('class', 'handle-hit').attr('data-hit', 'handle')
          .append('title').text('Drag onto another node to add a flow. Hold Shift and release on empty canvas to add a new node there.')
        g.append('circle').attr('class', 'handle')
        return g
      })
    nodeG
      .classed('selected', n => selection.nodes.has(n.uid))
      .attr('data-uid', n => n.uid)
    nodeG.selectAll('[data-hit]').attr('data-uid', n => n.uid)
    nodeG.each(function (n) {
      const g = d3.select(this)
      const height = n.value > 0 ? Math.max(1, n.dy) : 14
      const padX = Math.max(px(6), 2)
      const minH = px(14)
      const extraY = Math.max(0, (minH - height) / 2)
      const barX = n.x0 - 4 - padX
      const barW = nodeWidth + padX * 2
      g.select('.hit-bar').attr('x', barX).attr('y', n.y0 - extraY - px(2)).attr('width', barW).attr('height', height + extraY * 2 + px(4))
      const chips = lastChipBoxes.get(n.uid) || {}
      // A title starting with "_" shows the value in the title chip, so clicking it edits the value.
      const titlePart = String(n.title || '').startsWith('_') ? 'value' : 'title'
      ;[['.hit-title', chips.title, titlePart], ['.hit-value', chips.value, 'value']].forEach(([sel, box, part]) => {
        const r = g.select(sel).style('display', box ? null : 'none').attr('data-part', part)
        if (box) r.attr('x', box.x0).attr('y', box.y0).attr('width', box.x1 - box.x0).attr('height', box.y1 - box.y0)
      })
      g.select('.sel-node').attr('x', barX - px(1)).attr('y', n.y0 - px(4)).attr('width', barW + px(2)).attr('height', height + px(8)).attr('rx', px(3)).attr('stroke-width', px(1.5))
      const hp = handlePoint(n, nodeWidth)
      g.select('.handle').attr('cx', hp.x).attr('cy', hp.y).attr('r', px(HANDLE_R)).attr('stroke-width', px(1.75))
      g.select('.handle-hit').attr('cx', hp.x).attr('cy', hp.y).attr('r', px(HANDLE_HIT_R))
    })

    // Issue badges above nodes: an amber warning triangle or a red octagon for errors,
    // with a white rim and a shadow. Hover tells what is wrong; click opens it.
    badges.selectAll('g.badge')
      .data(layout.nodes.filter(n => issueMarks.has(n.uid)), n => n.uid)
      .join(enter => {
        const g = enter.append('g').attr('data-hit', 'badge')
        g.append('title')
        g.append('path').attr('class', 'badge-rim')
        g.append('path').attr('class', 'badge-body')
        g.append('path').attr('class', 'badge-mark')
        g.append('circle').attr('class', 'badge-dot')
        return g
      })
      .attr('class', n => `badge badge-${issueMarks.get(n.uid).severity}`)
      .attr('data-uid', n => n.uid)
      .attr('transform', n => `translate(${n.x0 - 4 + nodeWidth / 2},${n.y0 - px(15)})`)
      .each(function (n) {
        const mark = issueMarks.get(n.uid)
        const error = mark.severity === 'error'
        const g = d3.select(this)
        const count = mark.messages.length
        g.select('title').text(`${mark.messages.join('\n')}\n\nClick to see ${count > 1 ? 'these issues' : 'this issue'} in the Issues tab.`)
        const shape = error ? octagon(px(9)) : `M0,${px(-9)}L${px(9.5)},${px(7)}L${px(-9.5)},${px(7)}Z`
        g.select('.badge-rim').attr('d', shape).attr('stroke-width', px(5.5))
        g.select('.badge-body').attr('d', shape).attr('stroke-width', px(2.5)).attr('fill', `url(#badge-fill-${mark.severity})`)
        const top = error ? -4.6 : -3.2
        const bottom = error ? 1.2 : 2
        g.select('.badge-mark').attr('d', `M0,${px(top)}L0,${px(bottom)}`).attr('stroke-width', px(2.4))
        g.select('.badge-dot').attr('cy', px(bottom + 2.9)).attr('r', px(1.35))
      })
  }

  function octagon (r) {
    const pts = []
    for (let i = 0; i < 8; i++) {
      const a = Math.PI / 8 + (i * Math.PI) / 4
      pts.push(`${(Math.cos(a) * r).toFixed(3)},${(Math.sin(a) * r).toFixed(3)}`)
    }
    return `M${pts.join('L')}Z`
  }

  // The connect handle sits just below the node, on the side flows leave from,
  // so it never covers the label. Its grab area stays clear of the node bar.
  function handlePoint (n, nodeWidth) {
    const height = n.value > 0 ? Math.max(1, n.dy) : 14
    const off = HANDLE_HIT_R - 1
    return {
      x: n.left ? n.x0 - 4 - screenPx(off) : n.x0 - 4 + nodeWidth + screenPx(off),
      y: n.y0 + height + screenPx(off + 1)
    }
  }

  function handlePosition (uid) {
    if (!lastState) return null
    const n = lastState.layout.nodeByUid.get(uid)
    return n ? handlePoint(n, getSetting(lastState.doc, 'nodeWidth')) : null
  }

  // ---- previews during interactions ----

  function setConnect (connect) {
    preview.selectAll('line.connect').data(connect ? [connect] : []).join('line')
      .attr('class', 'connect')
      .attr('x1', c => c.x0).attr('y1', c => c.y0).attr('x2', c => c.x1).attr('y2', c => c.y1)
      .attr('stroke-width', screenPx(2))
      .attr('stroke-dasharray', `${screenPx(6)} ${screenPx(4)}`)
    const ghost = connect && connect.ghost ? [connect.ghost] : []
    const nodeWidth = lastState ? getSetting(lastState.doc, 'nodeWidth') : 4
    const labelSize = lastState ? getSetting(lastState.doc, 'labelFontSize') : 11
    preview.selectAll('rect.ghost-node').data(ghost).join('rect')
      .attr('class', 'ghost-node')
      .attr('x', g => g.x - 4).attr('y', g => g.y)
      .attr('width', nodeWidth).attr('height', 14)
      .attr('stroke-width', screenPx(1.5))
      .attr('stroke-dasharray', `${screenPx(4)} ${screenPx(3)}`)
    preview.selectAll('text.ghost-label').data(ghost).join('text')
      .attr('class', 'ghost-label')
      .attr('x', g => g.x + 15).attr('y', g => g.y + 7 + labelSize * 0.3)
      .attr('font-size', labelSize)
      .text('New node')
    nodeHits.selectAll('g.node-hit').classed('connect-target', n => !!(connect && connect.targetUid === n.uid))
  }

  function setGridVisible (visible) {
    showGrid = visible
    renderGrid()
  }

  function setHoverLink (uid) {
    diagram.selectAll('path.link').classed('hovered', l => l.uid === uid)
    diagram.classed('has-hover', !!uid)
  }

  // Bring the given nodes (by uid) into view.
  function reveal (uids) {
    if (!lastState) return
    const nodes = uids.map(u => lastState.layout.nodeByUid.get(u)).filter(Boolean)
    if (!nodes.length) return
    board.revealBox({
      x0: Math.min(...nodes.map(n => n.x0 - 40)),
      y0: Math.min(...nodes.map(n => n.y0 - 40)),
      x1: Math.max(...nodes.map(n => n.x0 + 200)),
      y1: Math.max(...nodes.map(n => n.y1 + 40))
    })
  }

  return board.extend({
    render,
    setConnect,
    setGridVisible,
    setHoverLink,
    reveal,
    handlePosition,
    flowIconAt: uid => lastIcons.find(d => d.uid === uid) || null,
    get labelBoxes () { return lastLabelBoxes }
  })
}
