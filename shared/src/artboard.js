// The canvas every editor draws on: an artboard the size of the exported image, with
// zoom and pan, resize handles on its edges, the size label above it, and a click
// target over the diagram title. Each editor adds its own overlay layers.
//
// createArtboard(container, {
//   getSetting(doc, key), fontStack(font),
//   layers: ['hits', 'title', …]   overlay groups, bottom to top; 'title' is the title's
//                                  (text boxes and their handles go on top of them all)
//   onTransform()                  redraw what is sized in screen pixels
// })

import { lib } from './lib.js'
import { drawTextBoxes } from './textBoxes.js'

const MIN_ZOOM = 0.1
const MAX_ZOOM = 8

export function createArtboard (container, { getSetting, fontStack, layers, onTransform = () => {} }) {
  const d3 = lib.d3
  const svg = d3.select(container).append('svg').attr('class', 'canvas-svg').attr('tabindex', -1)
  const defs = svg.append('defs')
  const checker = defs.append('pattern').attr('id', 'checker').attr('width', 16).attr('height', 16).attr('patternUnits', 'userSpaceOnUse')
  checker.append('rect').attr('width', 16).attr('height', 16).attr('fill', '#ffffff')
  checker.append('rect').attr('width', 8).attr('height', 8).attr('fill', '#ebe8e3')
  checker.append('rect').attr('x', 8).attr('y', 8).attr('width', 8).attr('height', 8).attr('fill', '#ebe8e3')

  const viewport = svg.append('g').attr('class', 'viewport')
  const artboard = viewport.append('g').attr('class', 'artboard')
  const shadow = artboard.append('rect').attr('class', 'artboard-shadow')
  const background = artboard.append('rect').attr('class', 'artboard-bg')
  // The size above the artboard doubles as a shortcut to the canvas settings.
  const sizeLabelGroup = artboard.append('g').attr('class', 'artboard-label-g').attr('data-hit', 'size-label')
  sizeLabelGroup.append('title').text('Change the canvas size')
  const sizeLabel = sizeLabelGroup.append('text').attr('class', 'artboard-label')
  const content = artboard.append('g').attr('class', 'content')
  const diagram = content.append('g').attr('class', 'diagram')
  const textLayer = content.append('g').attr('class', 'text-boxes')
  const overlay = content.append('g').attr('class', 'overlay')
  const layer = Object.fromEntries(layers.map(name => [name, overlay.append('g').attr('class', `${name}-layer`)]))
  // Diagram title: a click target over it, or an "add a title" placeholder when there is none.
  const titlePlaceholder = layer.title.append('text').attr('class', 'title-placeholder').text('Click to add a title')
  const titleHit = layer.title.append('rect').attr('class', 'hit hit-diagram-title').attr('data-hit', 'title')
  titleHit.append('title').text('Click to edit the diagram title, drag to move it')
  const textHits = overlay.append('g').attr('class', 'text-hits')
  const textGroups = Object.fromEntries(['boxes', 'frames', 'strips', 'handles'].map(n => [n, textHits.append('g')]))
  const preview = overlay.append('g').attr('class', 'preview')
  let texts = [] // the text boxes as drawn
  let textState = { selected: new Set(), editing: null }

  // Resize handles on the artboard's right edge, bottom edge and corner. They live
  // in artboard units (outside the output-scale group) and sit on top of everything.
  const resizeHandles = artboard.append('g').attr('class', 'resize-layer').selectAll('g.resize')
    .data([
      { edge: 'right', title: 'Drag to change the canvas width (hold Shift for 1 px steps)' },
      { edge: 'bottom', title: 'Drag to change the canvas height (hold Shift for 1 px steps)' },
      { edge: 'corner', title: 'Drag to change the canvas size (hold Shift for 1 px steps)' }
    ])
    .join(enter => {
      const g = enter.append('g').attr('class', d => `resize resize-${d.edge}`).attr('data-hit', 'resize').attr('data-edge', d => d.edge)
      g.append('title').text(d => d.title)
      g.append('line').attr('class', 'resize-line')
      g.append('rect').attr('class', 'resize-grip')
      g.append('path').attr('class', 'resize-mark')
      g.append('rect').attr('class', 'resize-hit')
      return g
    })

  let transform = { k: 1, x: 40, y: 40 }
  let doc = null

  function applyTransform () {
    viewport.attr('transform', `translate(${transform.x},${transform.y}) scale(${transform.k})`)
  }
  applyTransform()

  // Size in diagram units of `px` screen pixels.
  function screenPx (px) {
    return px / (transform.k * (doc ? getSetting(doc, 'scaleCanvas') : 1))
  }

  // Sizes the artboard for a document; call before drawing the diagram.
  function begin (nextDoc) {
    doc = nextDoc
    const w = getSetting(doc, 'canvasWidth')
    const h = getSetting(doc, 'canvasHeight')
    const sc = getSetting(doc, 'scaleCanvas')
    shadow.attr('x', 0).attr('y', 0).attr('width', w).attr('height', h)
    background.attr('width', w).attr('height', h).attr('fill', getSetting(doc, 'transparentBackground') ? 'url(#checker)' : getSetting(doc, 'backgroundColor'))
    sizeLabel.attr('x', 0).text(`${w} × ${h} px${sc !== 1 ? ` · output scale ${sc}` : ''}`)
    content.attr('transform', `scale(${sc})`)
    texts = drawTextBoxes(textLayer.node(), doc, key => getSetting(doc, key), { editor: true, editing: textState.editing }).boxes
    renderFixed()
  }

  // Parts outside the output scale that keep their size on screen.
  function renderFixed () {
    if (!doc) return
    const w = getSetting(doc, 'canvasWidth')
    const h = getSetting(doc, 'canvasHeight')
    const a = n => n / transform.k // screen pixels in artboard units
    sizeLabel.attr('y', -a(8)).attr('font-size', a(11))
    resizeHandles.each(function (d) {
      const g = d3.select(this)
      const line = g.select('.resize-line').attr('stroke-width', a(2))
      const grip = g.select('.resize-grip').attr('stroke-width', a(1.5)).attr('rx', a(3))
      const mark = g.select('.resize-mark').attr('stroke-width', a(1.5))
      const hit = g.select('.resize-hit')
      if (d.edge === 'right') {
        line.attr('x1', w).attr('y1', 0).attr('x2', w).attr('y2', h)
        grip.attr('x', w - a(3)).attr('y', h / 2 - a(16)).attr('width', a(6)).attr('height', a(32))
        hit.attr('x', w - a(5)).attr('y', 0).attr('width', a(10)).attr('height', h)
      } else if (d.edge === 'bottom') {
        line.attr('x1', 0).attr('y1', h).attr('x2', w).attr('y2', h)
        grip.attr('x', w / 2 - a(16)).attr('y', h - a(3)).attr('width', a(32)).attr('height', a(6))
        hit.attr('x', 0).attr('y', h - a(5)).attr('width', w).attr('height', a(10))
      } else {
        line.attr('x1', w).attr('y1', h).attr('x2', w).attr('y2', h)
        grip.attr('width', 0).attr('height', 0)
        // Always-visible grip lines in the corner, like a window's resize corner.
        mark.attr('d', `M${w - a(4)},${h - a(13)}L${w - a(13)},${h - a(4)}M${w - a(4)},${h - a(8)}L${w - a(8)},${h - a(4)}`)
        hit.attr('x', w - a(10)).attr('y', h - a(10)).attr('width', a(20)).attr('height', a(20))
      }
    })
  }

  // Places the title's click target; call after drawing. offset: where the diagram
  // itself is shifted to.
  function renderTitle (offset = { x: 0, y: 0 }) {
    const titleNode = diagram.select(':scope > text.diagram-title').node()
    titlePlaceholder
      .style('display', titleNode ? 'none' : null)
      .attr('x', getSetting(doc, 'titlePositionX') + offset.x)
      .attr('y', getSetting(doc, 'titlePositionY') + offset.y)
      .attr('font-size', getSetting(doc, 'titleFontSize'))
      .attr('font-family', fontStack(getSetting(doc, 'font')))
    let b = null
    try {
      b = (titleNode || titlePlaceholder.node()).getBBox()
      if (titleNode) b = { x: b.x + offset.x, y: b.y + offset.y, width: b.width, height: b.height }
    } catch (e) { b = null }
    titleHit.style('display', b ? null : 'none')
    if (b) titleHit.attr('x', b.x - screenPx(4)).attr('y', b.y - screenPx(2)).attr('width', b.width + screenPx(8)).attr('height', b.height + screenPx(4))
    renderTexts()
  }

  // Text boxes: a target over each, and for one that is selected a frame and handles on its
  // edges and corners, sized in screen pixels.
  const EDGES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']
  function renderTexts () {
    const px = screenPx
    const rect = (sel, box, pad = 0) => sel.attr('x', d => box(d).x0 - pad).attr('y', d => box(d).y0 - pad).attr('width', d => Math.max(0, box(d).x1 - box(d).x0 + pad * 2)).attr('height', d => Math.max(0, box(d).y1 - box(d).y0 + pad * 2))
    rect(textGroups.boxes.selectAll('rect').data(texts, d => d.uid).join(enter => {
      const r = enter.append('rect').attr('class', 'hit hit-textbox').attr('data-hit', 'text-box')
      r.append('title').text('Click to select, click again to type, drag to move')
      return r
    }).attr('data-uid', d => d.uid).classed('selected', d => textState.selected.has(d.uid)), d => d.box)
    const chosen = texts.filter(t => textState.selected.has(t.uid))
    rect(textGroups.frames.selectAll('rect').data(chosen, d => d.uid).join('rect').attr('class', 'text-frame').attr('stroke-width', px(1.5)), d => d.box, px(1))
    // Handles only for a single box that isn't being typed in.
    const one = chosen.length === 1 && chosen[0].uid !== textState.editing ? chosen[0] : null
    const spot = (b, e) => ({ x: e.includes('w') ? b.x0 : e.includes('e') ? b.x1 : (b.x0 + b.x1) / 2, y: e.includes('n') ? b.y0 : e.includes('s') ? b.y1 : (b.y0 + b.y1) / 2 })
    const t = px(6)
    rect(textGroups.strips.selectAll('rect').data(one ? ['n', 'e', 's', 'w'].map(edge => ({ uid: one.uid, edge, b: one.box })) : [], d => d.edge).join('rect').attr('class', 'text-strip').attr('data-hit', 'text-resize'), d => ({
      x0: d.edge === 'e' ? d.b.x1 - t / 2 : d.edge === 'w' ? d.b.x0 - t / 2 : d.b.x0, x1: d.edge === 'e' ? d.b.x1 + t / 2 : d.edge === 'w' ? d.b.x0 + t / 2 : d.b.x1,
      y0: d.edge === 's' ? d.b.y1 - t / 2 : d.edge === 'n' ? d.b.y0 - t / 2 : d.b.y0, y1: d.edge === 's' ? d.b.y1 + t / 2 : d.edge === 'n' ? d.b.y0 + t / 2 : d.b.y1
    })).attr('data-uid', d => d.uid).attr('data-edge', d => d.edge)
    const s = px(8)
    rect(textGroups.handles.selectAll('rect').data(one ? EDGES.map(edge => ({ uid: one.uid, edge, ...spot(one.box, edge) })) : [], d => d.edge).join('rect').attr('class', 'text-handle').attr('data-hit', 'text-resize'), d => ({ x0: d.x - s / 2, y0: d.y - s / 2, x1: d.x + s / 2, y1: d.y + s / 2 }))
      .attr('data-uid', d => d.uid).attr('data-edge', d => d.edge).attr('stroke-width', px(1.3)).attr('rx', px(1.5))
  }

  function setResizeActive (edge) {
    resizeHandles.classed('active', d => !!edge && (d.edge === edge || edge === 'corner'))
    svg.node().classList.remove('resizing-right', 'resizing-bottom', 'resizing-corner')
    if (edge) svg.node().classList.add(`resizing-${edge}`)
  }

  function setMarquee (m) {
    preview.selectAll('rect.marquee').data(m ? [m] : []).join('rect')
      .attr('class', 'marquee')
      .attr('x', r => Math.min(r.x0, r.x1)).attr('y', r => Math.min(r.y0, r.y1))
      .attr('width', r => Math.abs(r.x1 - r.x0)).attr('height', r => Math.abs(r.y1 - r.y0))
      .attr('stroke-width', screenPx(1))
  }

  // ---- coordinates and zoom ----

  function toLocal (node, clientX, clientY) {
    const m = node.getScreenCTM()
    if (!m) return { x: 0, y: 0 }
    const p = svg.node().createSVGPoint()
    p.x = clientX
    p.y = clientY
    const r = p.matrixTransform(m.inverse())
    return { x: r.x, y: r.y }
  }
  const clientToContent = (x, y) => toLocal(content.node(), x, y)
  const clientToArtboard = (x, y) => toLocal(artboard.node(), x, y)

  function setTransform (t) {
    transform = { k: Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, t.k)), x: t.x, y: t.y }
    applyTransform()
    if (doc) {
      renderFixed()
      onTransform()
    }
    container.dispatchEvent(new CustomEvent('zoomchange', { detail: { ...transform } }))
  }

  function zoomAt (factor, clientX, clientY) {
    const rect = svg.node().getBoundingClientRect()
    const cx = clientX === undefined ? rect.width / 2 : clientX - rect.left
    const cy = clientY === undefined ? rect.height / 2 : clientY - rect.top
    const k = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, transform.k * factor))
    const f = k / transform.k
    setTransform({ k, x: cx - (cx - transform.x) * f, y: cy - (cy - transform.y) * f })
  }

  function panBy (dx, dy) {
    setTransform({ k: transform.k, x: transform.x + dx, y: transform.y + dy })
  }

  // Bounds (in artboard units) of the artboard plus anything drawn outside it.
  function contentBounds () {
    if (!doc) return null
    const sc = getSetting(doc, 'scaleCanvas')
    let x0 = 0
    let y0 = 0
    let x1 = getSetting(doc, 'canvasWidth')
    let y1 = getSetting(doc, 'canvasHeight')
    try {
      const b = diagram.node().getBBox()
      if (b.width && b.height) {
        x0 = Math.min(x0, b.x * sc); y0 = Math.min(y0, b.y * sc)
        x1 = Math.max(x1, (b.x + b.width) * sc); y1 = Math.max(y1, (b.y + b.height) * sc)
      }
    } catch (e) { /* not rendered yet */ }
    return { x0, y0, x1, y1 }
  }

  function fitTo (bounds, padding = 48) {
    const rect = svg.node().getBoundingClientRect()
    if (!bounds || !rect.width || !rect.height) return
    const bw = Math.max(1, bounds.x1 - bounds.x0)
    const bh = Math.max(1, bounds.y1 - bounds.y0)
    const k = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.min((rect.width - padding * 2) / bw, (rect.height - padding * 2) / bh)))
    setTransform({ k, x: (rect.width - bw * k) / 2 - bounds.x0 * k, y: (rect.height - bh * k) / 2 - bounds.y0 * k })
  }

  function fit () { fitTo(contentBounds()) }

  function zoomTo100 () {
    const rect = svg.node().getBoundingClientRect()
    const b = contentBounds() || { x0: 0, y0: 0, x1: rect.width, y1: rect.height }
    setTransform({ k: 1, x: (rect.width - (b.x1 - b.x0)) / 2 - b.x0, y: 40 - b.y0 })
  }

  // Bring a box (in diagram units) into view, without changing the zoom unless it doesn't fit.
  function revealBox (box) {
    if (!doc || !box) return
    const sc = getSetting(doc, 'scaleCanvas')
    const b = { x0: box.x0 * sc, y0: box.y0 * sc, x1: box.x1 * sc, y1: box.y1 * sc }
    const rect = svg.node().getBoundingClientRect()
    const vx0 = -transform.x / transform.k
    const vy0 = -transform.y / transform.k
    const vx1 = vx0 + rect.width / transform.k
    const vy1 = vy0 + rect.height / transform.k
    if (b.x0 >= vx0 && b.y0 >= vy0 && b.x1 <= vx1 && b.y1 <= vy1) return
    if (b.x1 - b.x0 > vx1 - vx0 || b.y1 - b.y0 > vy1 - vy0) { fitTo(b); return }
    setTransform({ k: transform.k, x: rect.width / 2 - (b.x0 + b.x1) / 2 * transform.k, y: rect.height / 2 - (b.y0 + b.y1) / 2 * transform.k })
  }

  // `api` is what the rest of the editor uses; a canvas extends it with its own functions.
  const api = {
    svg: svg.node(),
    content: content.node(),
    diagram: diagram.node(),
    setMarquee,
    setResizeActive,
    // { selected: Set, editing: uid | null }; drawn with the next render.
    setTextState (s) { textState = s },
    textBox (uid) { const t = texts.find(x => x.uid === uid); return t ? { x: t.layout.x, y: t.layout.y, width: t.layout.width, height: t.layout.height, needed: t.layout.needed, layout: t.layout, box: t.box } : null },
    get textBoxes () { return texts },
    clientToContent,
    clientToArtboard,
    screenPx,
    get transform () { return { ...transform } },
    setTransform,
    zoomAt,
    panBy,
    fit,
    zoomTo100
  }
  return { svg, defs, content, diagram, layer, preview, begin, renderTitle, screenPx, revealBox, setTransform, extend: own => Object.create(api, Object.getOwnPropertyDescriptors(own)) }
}
