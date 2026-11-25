// Pointer handling every editor canvas shares: selecting and dragging through
// gestures, marquee, canvas-edge resizing, the diagram title, pan and zoom.
//
// attachPointer(canvas, app, {
//   press(ctx)                a press on one of the editor's own hit elements; returns a gesture or nothing
//                             ctx: { e, hit, kind, uid, p, additive, second }
//                             second: this press completes a double-click on the same item
//   hover(hit, e)             the pointer moves without a gesture (hit may be null)
//   doubleClick(hit, e, p)
//   marquee: { base(), select(rect, base, additive), start?(second) }
//   title: { snap(pos), dragging(on) }   optional
// })
//
// A gesture: { move?({ e, p }), end?({ e, p, moved, commit }), start?(), key?(e, down),
//   threshold?: false to start moving at once, cursor?: false to keep the cursor }
// commit is false when the browser cancelled the gesture.

const DRAG_THRESHOLD = 3

export const hitAt = target => (target && target.closest ? target.closest('[data-hit]') : null)

export function attachPointer (canvas, app, handlers) {
  const svg = canvas.svg
  let gesture = null
  let spaceDown = false
  let lastPress = null

  const begin = (g, e) => {
    gesture = g ? { moved: g.threshold === false, client: { x: e.clientX, y: e.clientY }, ...g } : { none: true }
    if (g && g.threshold === false && g.start) g.start()
  }

  // ---- gestures every canvas has ----

  function panGesture (e) {
    let last = { x: e.clientX, y: e.clientY }
    svg.classList.add('panning')
    return {
      threshold: false,
      move ({ e: ev }) { canvas.panBy(ev.clientX - last.x, ev.clientY - last.y); last = { x: ev.clientX, y: ev.clientY } },
      end () { svg.classList.remove('panning') }
    }
  }

  function resizeGesture (edge) {
    const start = app.canvasSize()
    let size = null
    canvas.setResizeActive(edge)
    app.hideTooltip()
    return {
      threshold: false,
      move ({ e }) {
        const a = canvas.clientToArtboard(e.clientX, e.clientY)
        const step = e.shiftKey ? 1 : 10
        const snap = v => Math.max(100, Math.min(20000, Math.round(v / step) * step))
        size = { w: edge === 'bottom' ? start.w : snap(a.x), h: edge === 'right' ? start.h : snap(a.y) }
        app.previewCanvasSize(size)
        app.showDragInfo(`${size.w} × ${size.h} px`, e.clientX, e.clientY)
      },
      end ({ commit }) {
        canvas.setResizeActive(null)
        app.hideDragInfo()
        if (size && (size.w !== start.w || size.h !== start.h) && commit) app.commitCanvasSize(size)
        else app.previewCanvasSize(null)
      }
    }
  }

  function titleGesture (p) {
    const origin = app.titlePosition()
    const { snap = pos => ({ x: Math.round(pos.x), y: Math.round(pos.y) }), dragging = () => {} } = handlers.title || {}
    let pos = null
    app.hideTooltip()
    return {
      start () { dragging(true) },
      move ({ e, p: q }) {
        pos = snap({ x: origin.x + q.x - p.x, y: origin.y + q.y - p.y })
        app.previewTitlePosition(pos)
        app.showDragInfo(`Title · x ${pos.x} · y ${pos.y}`, e.clientX, e.clientY)
      },
      end ({ moved, commit }) {
        if (!moved) { if (commit) app.editDiagramTitle(); return }
        dragging(false)
        app.hideDragInfo()
        if (pos && commit) app.commitTitlePosition(pos)
        else app.previewTitlePosition(null)
      }
    }
  }

  function marqueeGesture (p, additive) {
    const base = handlers.marquee.base()
    return {
      cursor: false,
      move ({ p: q }) {
        const m = { x0: p.x, y0: p.y, x1: q.x, y1: q.y }
        canvas.setMarquee(m)
        handlers.marquee.select(m, base, additive)
      },
      end ({ moved }) {
        canvas.setMarquee(null)
        if (!moved && !additive) app.setSelection({})
      }
    }
  }

  // ---- text boxes ----

  // Dragging one moves every selected text box; a click on one that is selected (or a
  // double-click) types in it.
  function textGesture (uid, p, additive, second) {
    const was = app.selection.texts.has(uid)
    app.selectText(uid, additive)
    if (additive) return null
    const { snap = pos => ({ x: Math.round(pos.x), y: Math.round(pos.y) }), dragging = () => {} } = handlers.title || {}
    const starts = new Map([...app.selection.texts].map(u => [u, app.textBox(u)]).filter(([, b]) => b))
    const anchor = starts.get(uid)
    let moves = null
    app.hideTooltip()
    return {
      start () { dragging(true) },
      move ({ e, p: q }) {
        const to = snap({ x: anchor.x + q.x - p.x, y: anchor.y + q.y - p.y })
        const dx = to.x - anchor.x
        const dy = to.y - anchor.y
        moves = new Map([...starts].map(([u, b]) => [u, { x: Math.round(b.x + dx), y: Math.round(b.y + dy) }]))
        app.previewTexts(moves)
        app.showDragInfo(`x ${to.x} · y ${to.y}`, e.clientX, e.clientY)
      },
      end ({ moved, commit }) {
        if (!moved) { if (commit && (second || was)) app.editText(uid); return }
        dragging(false)
        app.hideDragInfo()
        if (moves && commit) app.commitTexts(moves, starts.size > 1 ? 'Move texts' : 'Move text')
        else app.previewTexts(null)
      }
    }
  }

  // Dragging an edge or corner sizes the box; the opposite side stays put.
  function textResizeGesture (uid, edge, p) {
    const b = app.textBox(uid)
    if (!b) return null
    let patch = null
    app.hideTooltip()
    svg.classList.add(`sizing-${edge}`)
    return {
      threshold: false,
      cursor: false,
      move ({ e, p: q }) {
        const dx = q.x - p.x
        const dy = q.y - p.y
        let { x, y, width, height } = b
        if (edge.includes('e')) width = b.width + dx
        if (edge.includes('w')) { width = b.width - dx; x = b.x + dx }
        if (edge.includes('s')) height = b.height + dy
        if (edge.includes('n')) { height = b.height - dy; y = b.y + dy }
        const min = b.layout.px * 2 + 2 * b.layout.pad
        if (width < min) { if (edge.includes('w')) x -= min - width; width = min }
        if (height < 8) { if (edge.includes('n')) y -= 8 - height; height = 8 }
        patch = {}
        if (/[ew]/.test(edge)) Object.assign(patch, { x: Math.round(x), width: Math.round(width) })
        if (/[ns]/.test(edge)) Object.assign(patch, { y: Math.round(y), height: Math.round(height) })
        app.previewTexts(new Map([[uid, patch]]))
        app.showDragInfo(`${Math.round(patch.width ?? b.width)} × ${Math.round(patch.height ?? b.height)} px`, e.clientX, e.clientY)
      },
      end ({ commit }) {
        svg.classList.remove(`sizing-${edge}`)
        app.hideDragInfo()
        if (patch && commit) app.commitTexts(new Map([[uid, patch]]), 'Resize text')
        else app.previewTexts(null)
      }
    }
  }

  // ---- events ----

  svg.addEventListener('pointerdown', e => {
    if (!app.hasDocument()) return
    svg.focus({ preventScroll: true })
    if (e.button === 1 || (e.button === 0 && spaceDown)) {
      e.preventDefault()
      svg.setPointerCapture(e.pointerId)
      begin(panGesture(e), e)
      return
    }
    if (e.button !== 0) return
    svg.setPointerCapture(e.pointerId)
    const hit = hitAt(e.target)
    const kind = hit && hit.dataset.hit
    const uid = hit && hit.dataset.uid
    const p = canvas.clientToContent(e.clientX, e.clientY)
    const additive = e.shiftKey || e.metaKey || e.ctrlKey

    const now = performance.now()
    const second = !!lastPress && now - lastPress.time < 500 && lastPress.kind === kind && lastPress.uid === uid && Math.hypot(e.clientX - lastPress.x, e.clientY - lastPress.y) < 8
    lastPress = second ? null : { time: now, x: e.clientX, y: e.clientY, kind, uid }

    if (kind === 'resize') begin(resizeGesture(hit.dataset.edge), e)
    else if (kind === 'size-label') { begin(null, e); app.focusCanvasSettings() } else if (kind === 'title') begin(titleGesture(p), e)
    else if (kind === 'text-box') begin(textGesture(uid, p, additive, second), e)
    else if (kind === 'text-resize') begin(textResizeGesture(uid, hit.dataset.edge, p), e)
    else if (hit) begin(handlers.press({ e, hit, kind, uid, p, additive, second }), e)
    else {
      if (handlers.marquee.start) handlers.marquee.start(second)
      begin(marqueeGesture(p, additive), e)
    }
  })

  svg.addEventListener('pointermove', e => {
    if (!gesture) { handlers.hover(hitAt(e.target), e); return }
    if (gesture.none) return
    if (!gesture.moved) {
      if (Math.hypot(e.clientX - gesture.client.x, e.clientY - gesture.client.y) < DRAG_THRESHOLD) return
      gesture.moved = true
      if (gesture.cursor !== false) svg.classList.add('dragging')
      if (gesture.start) gesture.start()
    }
    if (gesture.move) gesture.move({ e, p: canvas.clientToContent(e.clientX, e.clientY) })
  })

  function endGesture (e) {
    if (!gesture) return
    const g = gesture
    gesture = null
    svg.classList.remove('dragging')
    if (g.end) g.end({ e, p: canvas.clientToContent(e.clientX, e.clientY), moved: g.moved, commit: e.type === 'pointerup' })
  }
  svg.addEventListener('pointerup', endGesture)
  svg.addEventListener('pointercancel', endGesture)
  svg.addEventListener('pointerleave', () => { if (!gesture) app.hideTooltip() })

  svg.addEventListener('dblclick', e => {
    if (!app.hasDocument()) return
    // Pointer capture retargets the event to the svg; look up what is under the pointer.
    handlers.doubleClick(hitAt(document.elementFromPoint(e.clientX, e.clientY)), e, canvas.clientToContent(e.clientX, e.clientY))
  })

  svg.addEventListener('wheel', e => {
    if (!app.hasDocument()) return
    e.preventDefault()
    if (e.ctrlKey || e.metaKey) {
      canvas.zoomAt(Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0025) * (e.ctrlKey && !e.metaKey ? 4 : 1)), e.clientX, e.clientY)
    } else {
      const f = e.deltaMode === 1 ? 16 : 1
      canvas.panBy(-e.deltaX * f, -e.deltaY * f)
    }
  }, { passive: false })

  const typing = () => {
    const el = document.activeElement
    return el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))
  }
  window.addEventListener('keydown', e => {
    if (e.code === 'Space' && !typing() && !e.repeat) { spaceDown = true; svg.classList.add('space-pan') }
    if (gesture && gesture.key) gesture.key(e, true)
  })
  window.addEventListener('keyup', e => {
    if (e.code === 'Space') { spaceDown = false; svg.classList.remove('space-pan') }
    if (gesture && gesture.key) gesture.key(e, false)
  })
}
