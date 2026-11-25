// The chord editor's canvas: the diagram on the shared artboard, and an overlay for editing:
// hit areas for flows, nodes, groups, labels and legend entries, selection, the handles that
// draw new flows, and the mark that shows where something dragged would land.

import { lib } from '../../../shared/src/lib.js'
import { createArtboard } from '../../../shared/src/artboard.js'
import { vividColor } from '../../../shared/src/color.js'
import { getSetting } from '../model/schema.js'
import { drawChord, fontStack } from './chord.js'
import { polar, ringPath } from './layout.js'

const TAU = Math.PI * 2
const turn = a => ((a % TAU) + TAU) % TAU

export function createCanvas (container) {
  const d3 = lib.d3
  const board = createArtboard(container, { getSetting, fontStack, layers: ['hits', 'selection', 'title', 'labels', 'handles', 'drop'], onTransform: () => renderOverlay() })
  const { screenPx, diagram } = board
  // Everything on the circle is placed around its centre.
  const round = Object.fromEntries(['hits', 'selection', 'handles', 'drop'].map(name => [name, board.layer[name].append('g')]))
  const flat = board.layer.labels

  let lastState = null
  let last = null
  let hover = null // { ribbon } | { node } | { carrier }
  let nearUid = null // the node whose handle is out

  // state: { doc, model, selection, issueMarks, labelPreview }
  function render (state) {
    lastState = state
    board.begin(state.doc)
    last = drawChord(diagram.node(), state.doc, state.model, { editor: true, labelPreview: state.labelPreview || null })
    setHover(hover)
    renderOverlay()
    return last
  }

  const place = (sel, box, pad = 0) => sel.attr('x', d => box(d).x0 - pad).attr('y', d => box(d).y0 - pad).attr('width', d => Math.max(0, box(d).x1 - box(d).x0 + pad * 2)).attr('height', d => Math.max(0, box(d).y1 - box(d).y0 + pad * 2))
  // At least some pixels wide on screen, however small the node is.
  const wide = (a0, a1, r, min) => { const g = Math.max(0, (screenPx(min) / r - (a1 - a0)) / 2); return [a0 - g, a1 + g] }

  function renderOverlay () {
    if (!last) return
    const { selection, issueMarks } = lastState
    const px = screenPx
    const { r } = last
    board.renderTitle()
    Object.values(round).forEach(g => g.attr('transform', `translate(${last.cx},${last.cy})`))

    const path = (layer, cls, data, key, hit, d, tip) => layer.selectAll(`path.${cls}`).data(data, key).join(enter => {
      const el = enter.append('path').attr('class', `hit ${cls}`).attr('data-hit', hit)
      if (tip) el.append('title').text(tip)
      return el
    }).attr('d', d).order()
    path(round.hits, 'hit-ribbon', last.ribbons, x => x.key, 'ribbon', x => x.d).attr('data-key', x => x.key).attr('stroke-width', px(5))
    const drawnNodes = last.nodes.filter(n => n.node.labelled)
    path(round.hits, 'hit-group', last.groups.filter(g => g.uid), g => g.uid, 'group', g => ringPath(g.a0, g.a1, g.r0, g.r1)).attr('data-uid', g => g.uid)
    path(round.hits, 'hit-group-name', last.groups.filter(g => g.uid && g.span), g => g.uid, 'group-name', g => ringPath(g.span[0], g.span[1], g.r0, g.r1), 'Click to rename, drag to move the group').attr('data-uid', g => g.uid)
    path(round.hits, 'hit-node', drawnNodes, n => n.uid, 'node', n => { const [a0, a1] = wide(n.a0, n.a1, r, 8); const extra = Math.max(0, (px(9) - (n.r1 - n.r0)) / 2); return ringPath(a0, a1, n.r0 - Math.min(extra, n.r0 - r + px(1)), n.r1 + extra) }).attr('data-uid', n => n.uid)

    // Handles that draw a new flow, outside the arc
    const handle = round.handles.selectAll('g.node-handle').data(drawnNodes, n => n.uid).join(enter => {
      const g = enter.append('g').attr('class', 'node-handle').attr('data-hit', 'handle')
      g.append('circle').attr('class', 'handle-hit').append('title').text('Drag onto another node to add a flow')
      g.append('circle').attr('class', 'handle')
      return g
    })
    handle.attr('data-uid', n => n.uid).classed('selected', n => selection.nodes.has(n.uid)).classed('near', n => n.uid === nearUid).attr('transform', n => { const [x, y] = polar(handleRadius(n), (n.a0 + n.a1) / 2); return `translate(${x},${y})` })
    handle.select('.handle-hit').attr('r', px(11))
    handle.select('.handle').attr('r', px(5.5)).attr('stroke-width', px(1.5))

    // Labels
    const labelled = last.nodes.filter(n => n.label)
    const rect = (cls, data, key, hit, box, tip) => place(flat.selectAll(`rect.${cls}`).data(data, key).join(enter => {
      const el = enter.append('rect').attr('class', `hit ${cls}`).attr('data-hit', hit)
      if (tip) el.append('title').text(tip)
      return el
    }), box, px(2))
    rect('hit-label', labelled, n => n.uid, 'label', n => n.label.box, 'Drag to move')
    flat.selectAll('rect.hit-label').attr('data-uid', n => n.uid)
    rect('hit-node-title', labelled.filter(n => n.label.titleBox), n => n.uid, 'node-title', n => n.label.titleBox, 'Click to edit, drag to move')
    flat.selectAll('rect.hit-node-title').attr('data-uid', n => n.uid).classed('hit-text', true)
    rect('hit-subtitle', last.subtitle ? [last.subtitle] : [], () => 's', 'subtitle', x => x.box, 'Click to edit the subtitle')
    flat.selectAll('rect.hit-subtitle').classed('hit-text', true)
    rect('hit-legend', last.legend, l => l.uid, 'legend', l => l.box)
    flat.selectAll('rect.hit-legend').attr('data-uid', l => l.uid)

    // Selection
    const isFlow = x => x.ribbon.uids.some(u => selection.flows.has(u))
    const related = x => !isFlow(x) && (selection.carriers.has(x.ribbon.carrier.uid) || touches(x, selection.nodes))
    const outline = (cls, data, width) => round.selection.selectAll(`path.${cls}`).data(data, x => x.key).join('path').attr('class', cls).attr('d', x => x.d).attr('stroke-width', px(width))
    outline('sel-related', last.ribbons.filter(related), 1)
    outline('sel-ribbon', last.ribbons.filter(isFlow), 2.2)
    outline('issue-ribbon', last.ribbons.filter(x => x.ribbon.uids.some(u => issueMarks.has(u))), 1.4)
    const rings = [
      ...last.nodes.filter(n => selection.nodes.has(n.uid)).map(n => { const [a0, a1] = wide(n.a0, n.a1, r, 6); return { key: n.uid, d: ringPath(a0 - px(2) / r, a1 + px(2) / r, n.r0 - px(2), n.r1 + px(2)) } }),
      ...last.groups.filter(g => g.uid && selection.groups.has(g.uid)).map(g => ({ key: g.uid, d: ringPath(g.a0 - px(2) / r, g.a1 + px(2) / r, g.r0 - px(2), g.r1 + px(2)) }))
    ]
    round.selection.selectAll('path.sel-ring').data(rings, x => x.key).join('path').attr('class', 'sel-ring').attr('d', x => x.d).attr('stroke-width', px(1.6))
    place(board.layer.selection.selectAll(':scope > rect.sel-label').data(last.nodes.filter(n => n.label && selection.nodes.has(n.uid)), n => n.uid).join('rect').attr('class', 'sel-label').attr('rx', px(4)).attr('stroke-width', px(1.2)), n => n.label.box, px(5))
  }

  // A handle is out for the node that is pointed at (or selected), so it isn't in the way of groups.
  function setHandle (uid) {
    if (uid === nearUid) return
    nearUid = uid
    round.handles.selectAll('g.node-handle').classed('near', n => n.uid === uid)
  }

  const handleRadius = n => n.r1 + screenPx(11)
  const touches = (x, uids) => uids.size > 0 && last.nodes.some(n => uids.has(n.uid) && (n.node.id === x.ribbon.source || n.node.id === x.ribbon.target))

  // Pick something out: { ribbon: key }, { node: uid } or { carrier: uid }; the rest fades.
  function setHover (what) {
    hover = what
    if (!last) return
    const base = getSetting(lastState.doc, 'flowOpacity')
    const { paint } = last
    const nodeId = what && what.node ? (last.nodes.find(n => n.uid === what.node) || { node: {} }).node.id : null
    const hot = x => (what.ribbon ? x.key === what.ribbon : nodeId ? x.ribbon.source === nodeId || x.ribbon.target === nodeId : x.ribbon.carrier.uid === what.carrier)
    last.ribbons.forEach(x => {
      const on = what && hot(x)
      x.node.setAttribute('fill', paint(on ? vividColor(x.color) : x.color, x.pattern, x.mark))
      x.node.setAttribute('fill-opacity', !what ? base : on ? Math.min(1, base + 0.3) : base * 0.28)
      x.node.setAttribute('stroke-opacity', !what || on ? 0.7 : 0.15)
    })
    last.legend.forEach(l => l.chipNode.setAttribute('fill', paint(what && what.carrier === l.uid ? vividColor(l.color) : l.color, l.pattern, l.mark)))
  }

  // ---- dragging around the circle ----

  const angleAt = p => turn(Math.atan2(p.x - last.cx, -(p.y - last.cy)))
  const between = (a, x0, x1) => { const s = turn(a - x0); return s <= x1 - x0 + 1e-9 }
  const gapTo = (a, x0, x1) => (between(a, x0, x1) ? 0 : Math.min(turn(x0 - a), turn(a - x1)))

  // The node whose arc is nearest to a point's angle, and which half of it.
  function nodeNear (p, exceptUid) {
    if (!last || !last.nodes.length) return null
    const a = angleAt(p)
    const list = last.nodes.filter(n => n.node.labelled || !n.node.empty)
    const best = list.reduce((m, n) => (gapTo(a, n.a0, n.a1) < gapTo(a, m.a0, m.a1) ? n : m))
    if (best.uid === exceptUid) return null
    return { uid: best.uid, after: turn(a - (best.a0 + best.a1) / 2) < Math.PI }
  }
  function groupNear (p, exceptUid) {
    const list = last ? last.layout.groups.filter(g => g.group.uid) : []
    if (!list.length) return null
    const a = angleAt(p)
    const best = list.reduce((m, g) => (gapTo(a, g.a0, g.a1) < gapTo(a, m.a0, m.a1) ? g : m))
    if (best.group.uid === exceptUid) return null
    return { uid: best.group.uid, after: turn(a - (best.a0 + best.a1) / 2) < Math.PI }
  }

  function setDrop (d, kind) {
    const marks = []
    if (d) {
      const item = kind === 'group' ? last.layout.groups.find(g => g.group.uid === d.uid) : last.nodes.find(n => n.uid === d.uid)
      if (item) {
        const pad = kind === 'group' ? 0.03 : Math.min(0.012, getSetting(lastState.doc, 'nodeGap') * Math.PI / 360)
        const a = d.after ? item.a1 + pad : item.a0 - pad
        marks.push([polar(last.r - screenPx(10), a), polar(last.r + screenPx(26), a)])
      }
    }
    round.drop.selectAll('line.drop-bar').data(marks).join('line').attr('class', 'drop-bar').attr('stroke-width', screenPx(3))
      .attr('x1', m => m[0][0]).attr('y1', m => m[0][1]).attr('x2', m => m[1][0]).attr('y2', m => m[1][1])
  }

  // A flow being drawn: from a node to a point, or to another node.
  function setConnect (c) {
    const list = c ? [c] : []
    round.drop.selectAll('path.connect-line').data(list).join('path').attr('class', 'connect-line').attr('stroke-width', screenPx(2)).attr('d', d => {
      const from = last.nodes.find(n => n.uid === d.source)
      const target = d.target && last.nodes.find(n => n.uid === d.target)
      const [x0, y0] = polar(last.r, (from.a0 + from.a1) / 2)
      const [x1, y1] = target ? polar(last.r, (target.a0 + target.a1) / 2) : [d.x - last.cx, d.y - last.cy]
      return `M${x0},${y0}Q0,0 ${x1},${y1}`
    })
    round.drop.selectAll('path.connect-target').data(c && c.target ? [last.nodes.find(n => n.uid === c.target)] : []).join('path').attr('class', 'connect-target').attr('stroke-width', screenPx(2))
      .attr('d', n => { const [a0, a1] = wide(n.a0, n.a1, last.r, 10); return ringPath(a0, a1, n.r0 - screenPx(3), n.r1 + screenPx(3)) })
  }

  function reveal (boxes) {
    if (!boxes.length) return
    const pad = 12
    board.revealBox({ x0: Math.min(...boxes.map(b => b.x0)) - pad, y0: Math.min(...boxes.map(b => b.y0)) - pad, x1: Math.max(...boxes.map(b => b.x1)) + pad, y1: Math.max(...boxes.map(b => b.y1)) + pad })
  }

  return board.extend({
    render,
    setHover,
    setHandle,
    setDrop,
    setConnect,
    nodeNear,
    groupNear,
    reveal,
    ribbon: key => (last ? last.ribbons.find(x => x.key === key) : null),
    nodeOf: uid => (last ? last.nodes.find(n => n.uid === uid) : null),
    groupOf: uid => (last ? last.groups.find(g => g.uid === uid) : null),
    get result () { return last }
  })
}
