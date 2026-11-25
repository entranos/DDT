// The ternary editor's canvas: the diagram on the shared artboard, and an overlay for
// editing: hit areas for series, points, legend items and axis texts, selection,
// hover guides and issue marks.

import { lib } from '../../../shared/src/lib.js'
import { createArtboard } from '../../../shared/src/artboard.js'
import { getSetting } from '../model/schema.js'
import { drawTernary, fontStack } from './ternary.js'
import { clipSegment, toEF } from './geometry.js'

export function createCanvas (container) {
  const d3 = lib.d3
  const board = createArtboard(container, { getSetting, fontStack, layers: ['selection', 'hits', 'title', 'guides'], onTransform: () => renderOverlay() })
  const { screenPx, diagram } = board
  const selectionLayer = board.layer.selection
  const hitLayer = board.layer.hits
  const guides = board.layer.guides

  let lastState = null
  let lastResult = null
  let hoverUid = null

  // state: { doc, model, selection, issueMarks, domain }
  function render (state) {
    lastState = state
    board.begin(state.doc)
    lastResult = drawTernary(diagram.node(), state.doc, state.model, { domain: state.domain || null })
    setHoverSeries(hoverUid)
    renderOverlay()
    return lastResult
  }

  function lineFor (ser) {
    const s = key => getSetting(lastState.doc, key)
    return d3.line().curve(s('curve') === 'straight' ? d3.curveLinear : d3.curveCatmullRom.alpha(0.5))(ser.points.map(p => lastResult.geometry.at(p.shares)))
  }

  function renderOverlay () {
    const { selection, issueMarks } = lastState
    const geo = lastResult.geometry
    const px = screenPx
    const shown = lastResult.seriesShown
    const points = shown.flatMap(ser => ser.points.map(p => ({ ser, p, xy: geo.at(p.shares) })))

    board.renderTitle()
    selectionLayer.selectAll('path.sel-series')
      .data(shown.filter(ser => selection.series.has(ser.uid) && ser.points.length > 1), ser => ser.uid)
      .join('path').attr('class', 'sel-series').attr('d', lineFor).attr('stroke-width', px(10))
    selectionLayer.selectAll('circle.sel-point')
      .data(points.filter(d => selection.points.has(d.p.uid)), d => d.p.uid)
      .join('circle').attr('class', 'sel-point').attr('cx', d => d.xy[0]).attr('cy', d => d.xy[1]).attr('r', px(9)).attr('stroke-width', px(2))
    selectionLayer.selectAll('circle.issue-ring')
      .data(points.filter(d => issueMarks.has(d.p.uid)), d => d.p.uid)
      .join('circle').attr('class', d => `issue-ring issue-ring-${issueMarks.get(d.p.uid).severity}`)
      .attr('cx', d => d.xy[0]).attr('cy', d => d.xy[1]).attr('r', px(11)).attr('stroke-width', px(1.5))

    const axisTexts = diagram.selectAll('text.axis-text').nodes().filter(n => n.textContent)
    hitLayer.selectAll('rect.hit-axis-text')
      .data(axisTexts, (n, i) => (n.dataset ? `${n.dataset.corner}-${n.dataset.part}` : i))
      .join(enter => {
        const r = enter.append('rect').attr('class', 'hit hit-axis-text').attr('data-hit', 'axis-text')
        r.append('title').text('Click to edit this text')
        return r
      })
      .attr('data-corner', n => n.dataset.corner).attr('data-part', n => n.dataset.part)
      .each(function (n) {
        const b = n.getBBox()
        d3.select(this).attr('x', b.x - px(4)).attr('y', b.y - px(2)).attr('width', b.width + px(8)).attr('height', b.height + px(4))
      })
    hitLayer.selectAll('path.hit-series')
      .data(shown.filter(ser => ser.points.length > 1), ser => ser.uid)
      .join('path').attr('class', 'hit hit-series').attr('data-hit', 'series').attr('data-uid', ser => ser.uid).attr('d', lineFor).attr('stroke-width', px(12)).attr('fill', 'none')
    hitLayer.selectAll('rect.hit-legend')
      .data(lastResult.legendItems, d => d.uid)
      .join('rect').attr('class', 'hit hit-legend').attr('data-hit', 'legend').attr('data-uid', d => d.uid)
      .attr('x', d => d.x).attr('y', d => d.y).attr('width', d => d.w).attr('height', d => d.h)
    hitLayer.selectAll('circle.hit-point')
      .data(points, d => d.p.uid)
      .join('circle').attr('class', 'hit hit-point').attr('data-hit', 'point').attr('data-uid', d => d.p.uid)
      .attr('cx', d => d.xy[0]).attr('cy', d => d.xy[1]).attr('r', px(9))
  }

  // Reading guides for a point: a dashed line along each share's grid line to the
  // edge where that share's ticks are, with the percentage there.
  function setGuides (shares, color) {
    guides.selectAll('*').remove()
    if (!shares || !lastResult) return
    const geo = lastResult.geometry
    const domain = lastResult.domain
    const k = lastResult.layout.k
    const px = screenPx
    const [e, f] = toEF(shares)
    const b = shares.left
    const from = geo.at(shares)
    const draw = (seg, pick, value, anchor, dx, dy) => {
      if (!seg) return
      const to = geo.toScreen(pick(seg[0], seg[1]) ? seg[0] : seg[1])
      guides.append('line').attr('x1', from[0]).attr('y1', from[1]).attr('x2', to[0]).attr('y2', to[1])
        .attr('stroke', color).attr('stroke-width', px(1.3)).attr('stroke-dasharray', `${px(4)} ${px(3)}`)
      guides.append('text').attr('x', to[0] + dx).attr('y', to[1] + dy).attr('text-anchor', anchor).attr('font-size', 11 * k)
        .attr('font-weight', 700).attr('fill', color).attr('paint-order', 'stroke').attr('stroke', getSetting(lastState.doc, 'backgroundColor')).attr('stroke-width', 4 * k).attr('stroke-linejoin', 'round')
        .text(`${Math.round(value * 100)}%`)
    }
    const right = (a, c) => a[1] <= c[1]
    const bottom = (a, c) => a[0] + a[1] / 2 >= c[0] + c[1] / 2
    const left = (a, c) => a[0] + a[1] / 2 <= c[0] + c[1] / 2
    draw(clipSegment(domain, [e, 0], [e, 1 - e]), right, e, 'middle', 0, -12 * k)
    draw(clipSegment(domain, [0, f], [1 - f, f]), bottom, f, 'start', 9 * k, 4 * k)
    draw(clipSegment(domain, [1 - b, 0], [0, 1 - b]), left, b, 'end', -9 * k, 4 * k)
  }

  // Fade the other series while one is hovered.
  function setHoverSeries (uid) {
    hoverUid = uid
    diagram.classed('has-hover', !!uid)
    diagram.selectAll('g.series').classed('hovered', function () { return this.dataset.uid === uid })
  }

  // Bring points into view. shares: their mixes.
  function reveal (shares) {
    if (!lastResult || !shares.length) return
    const pts = shares.map(s => lastResult.geometry.at(s))
    const pad = 40
    board.revealBox({
      x0: Math.min(...pts.map(p => p[0])) - pad,
      y0: Math.min(...pts.map(p => p[1])) - pad,
      x1: Math.max(...pts.map(p => p[0])) + pad,
      y1: Math.max(...pts.map(p => p[1])) + pad
    })
  }

  return board.extend({
    render,
    setGuides,
    setHoverSeries,
    reveal,
    get result () { return lastResult }
  })
}
