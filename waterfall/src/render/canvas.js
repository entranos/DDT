// The waterfall editor's canvas: the diagrams on the shared artboard, and an overlay for
// editing: hit areas for steps, totals, headings, names and labels, selection, the +
// for another moment, and the drop mark when reordering carriers.

import { lib } from '../../../shared/src/lib.js'
import { createArtboard } from '../../../shared/src/artboard.js'
import { vividColor } from '../../../shared/src/color.js'
import { getSetting } from '../model/schema.js'
import { drawWaterfall, fontStack } from './waterfall.js'

const stepKey = b => `${b.diagram.uid}|${b.period}|${b.carrier.uid}`
const segmentKey = s => `${s.diagram.uid}|${s.moment.uid}|${s.carrier.uid}`

export function createCanvas (container) {
  const d3 = lib.d3
  const board = createArtboard(container, { getSetting, fontStack, layers: ['hits', 'selection', 'title', 'handles', 'drop'], onTransform: () => renderOverlay() })
  const { screenPx, diagram } = board
  const { hits, selection: selectionLayer, handles, drop } = board.layer
  const add = handles.append('g').attr('class', 'add-handle add-moment').attr('data-hit', 'add-moment')
  add.append('title').text('Add a moment, starting from the last one')
  add.append('circle')
  add.append('path')

  let lastState = null
  let last = null
  let hoverUid = null

  // state: { doc, model, selection, issueMarks, frozen }
  function render (state) {
    lastState = state
    board.begin(state.doc)
    last = drawWaterfall(diagram.node(), state.doc, state.model, { frozen: state.frozen || null })
    setHover(hoverUid)
    renderOverlay()
    return last
  }

  const place = (sel, box, pad = 0, minH = 0) => sel.each(function (d) {
    const b = box(d)
    const grow = Math.max(0, (minH - (b.y1 - b.y0)) / 2)
    d3.select(this).attr('x', b.x0 - pad).attr('y', b.y0 - pad - grow).attr('width', Math.max(0, b.x1 - b.x0 + pad * 2)).attr('height', Math.max(0, b.y1 - b.y0 + pad * 2 + grow * 2))
  })

  function renderOverlay () {
    if (!last) return
    const { selection, issueMarks } = lastState
    const px = screenPx
    board.renderTitle()

    const join = (cls, data, key, hit, tip) => hits.selectAll(`rect.${cls}`).data(data, key).join(enter => {
      const r = enter.append('rect').attr('class', `hit ${cls}`).attr('data-hit', hit)
      if (tip) r.append('title').text(tip)
      return r
    })
    place(join('hit-segment', last.segments, segmentKey, 'segment').attr('data-key', segmentKey), d => d.box)
    place(join('hit-step', last.bars, stepKey, 'step').attr('data-key', stepKey), d => d.box, 0, px(14))
    place(join('hit-change', last.bars.filter(b => b.labelBox), stepKey, 'change', 'Click to type the change').attr('data-key', stepKey), d => d.labelBox, px(1))
    place(join('hit-head', last.heads, h => `${h.row}|${h.period}|${h.uid}`, 'head', 'Click to select, drag to reorder').attr('data-uid', h => h.uid).attr('data-period', h => h.period), d => d.box)
    place(join('hit-moment hit-text'.split(' ')[0], last.moments, m => `${m.row}|${m.uid}`, 'moment', 'Click to edit').classed('hit-text', true).attr('data-uid', m => m.uid).attr('data-row', m => m.row), d => d.box, px(2))
    place(join('hit-name', last.texts, t => `${t.uid}|${t.part}`, 'diagram-text', 'Click to edit').classed('hit-text', true).attr('data-uid', t => t.uid).attr('data-part', t => t.part), d => d.box, px(3))
    place(join('hit-subtitle', last.subtitle ? [last.subtitle] : [], () => 's', 'subtitle', 'Click to edit the subtitle').classed('hit-text', true), d => d.box, px(3))
    place(join('hit-legend', last.legend, l => l.uid, 'legend').attr('data-uid', l => l.uid), d => d.box)

    // + after the last moment
    const m = last.moments[last.moments.length - 1]
    add.style('display', last.area && m ? null : 'none')
    if (last.area && m) {
      const r = px(8)
      add.attr('transform', `translate(${Math.max(last.area.x1 + px(16), m.box.x1 + px(14))},${(m.box.y0 + m.box.y1) / 2})`)
      add.select('circle').attr('r', r).attr('stroke-width', px(1.5))
      add.select('path').attr('d', `M${-r / 2},0H${r / 2}M0,${-r / 2}V${r / 2}`).attr('stroke-width', px(1.7))
    }

    // Selection
    const isRow = x => x.uids.some(u => selection.values.has(u))
    const isCarrier = x => selection.carriers.has(x.carrier.uid)
    const outline = (cls, data, inset, width) => {
      const sel = selectionLayer.selectAll(`rect.${cls}`).data(data, d => (d.period === undefined ? segmentKey(d) : stepKey(d))).join('rect').attr('class', cls).attr('stroke-width', px(width))
      place(sel, d => d.box, -px(inset), px(4))
    }
    const items = [...last.segments, ...last.bars.filter(b => b.node)]
    outline('sel-related', items.filter(x => !isRow(x) && isCarrier(x)), 0.5, 1.6)
    outline('sel-item', items.filter(isRow), 0.5, 2.2)
    outline('issue-item', items.filter(x => x.uids.some(u => issueMarks.has(u))), 3, 1.4)
    const frames = [
      ...last.totals.filter(t => selection.moments.has(t.moment.uid)).map(t => ({ key: `m${t.row}${t.moment.uid}`, box: t.box, pad: 5 })),
      ...(last.vertical ? last.vertical.rows : []).map((r, i) => ({ r, d: lastState.model.diagrams[i] })).filter(x => x.d && selection.diagrams.has(x.d.uid)).map(x => ({ key: `d${x.d.uid}`, box: { x0: last.area.x0, y0: x.r.y0, x1: last.area.x1, y1: x.r.y1 }, pad: 6 }))
    ]
    const frame = selectionLayer.selectAll('rect.sel-frame').data(frames, d => d.key).join('rect').attr('class', 'sel-frame').attr('rx', px(5)).attr('stroke-width', px(1.5))
    frame.each(function (d) { place(d3.select(this), () => d.box, px(d.pad)) })
  }

  // Pick out one carrier in every diagram: its bars turn more vivid.
  function setHover (uid) {
    hoverUid = uid
    if (!last) return
    const hot = x => uid && x.carrier.uid === uid
    const { paint } = last
    last.segments.forEach(x => x.node.setAttribute('fill', paint(hot(x) ? vividColor(x.color) : x.color, x.pattern, x.mark)))
    last.bars.forEach(x => {
      if (!x.node) return
      const v = vividColor(x.color)
      x.node.setAttribute('fill', hot(x) ? (x.stroke ? paint.light(v, x.pattern, 0.55, x.mark) : paint(v, x.pattern, x.mark)) : x.fill)
      if (x.stroke) x.node.setAttribute('stroke', hot(x) ? v : x.stroke)
    })
    last.heads.forEach(x => x.node.setAttribute('fill', hot(x) ? vividColor(x.carrier.color) : x.carrier.color))
    last.legend.forEach(l => l.chipNode.setAttribute('fill', paint(uid === l.uid ? vividColor(l.color) : l.color, l.pattern, l.mark)))
  }

  // Where a dragged carrier would land: a bar beside its target, in every row of headings.
  function setDrop (d) {
    const bars = []
    if (d && d.targetUid) {
      last.heads.filter(x => x.uid === d.targetUid).forEach(x => {
        const at = d.after ? x.box.x1 + screenPx(2) : x.box.x0 - screenPx(2)
        bars.push({ x: at, y0: x.box.y0, y1: x.box.y1 })
      })
    }
    drop.selectAll('line.drop-bar').data(bars).join('line').attr('class', 'drop-bar').attr('stroke-width', screenPx(3))
      .attr('x1', b => b.x).attr('x2', b => b.x).attr('y1', b => b.y0).attr('y2', b => b.y1)
  }

  // The column heading at a horizontal place, in the period a drag started in.
  function headAt (p, period, exceptUid) {
    if (!last) return null
    const list = last.heads.filter(x => x.period === period && x.row === 0)
    const hit = list.find(x => p.x >= x.box.x0 - 2 && p.x <= x.box.x1 + 2)
    if (!hit || hit.uid === exceptUid) return null
    return { uid: hit.uid, after: p.x > (hit.box.x0 + hit.box.x1) / 2 }
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
    headAt,
    reveal,
    step: key => last && last.bars.find(b => stepKey(b) === key),
    segment: key => last && last.segments.find(s => segmentKey(s) === key),
    stepKey,
    segmentKey,
    get result () { return last }
  })
}
