// Pointer interactions on the sankey canvas (pan, zoom, resize, marquee and the
// diagram title are shared, see shared/src/pointer.js):
//   click            select a node or flow (Shift/Cmd adds to the selection)
//   drag node        move the selection (snaps to the grid when enabled)
//   drag handle      draw a new flow to another node; hold Shift and release on
//                    empty canvas to add a new node there with the flow routed to it
//   drag background  marquee-select nodes
//   click label      edit a node's title or value in place (dragging a label moves the node)
//   double-click     empty canvas: add a node · node: open its flow details
//                    flow: select it and focus its value, ready to type
//   click badge      show the node's issues
//   drag flow icon   move it along its flow · double-click: choose another icon

import { attachPointer, hitAt } from '../../../shared/src/pointer.js'

export function attachInteractions (canvas, app) {
  const svg = canvas.svg

  function nodeGesture ({ uid, hit, p, additive }) {
    const sel = app.selection
    if (additive) {
      const nodes = new Set(sel.nodes)
      nodes.has(uid) ? nodes.delete(uid) : nodes.add(uid)
      app.setSelection({ nodes: [...nodes], links: [...sel.links] })
    } else if (!sel.nodes.has(uid)) {
      app.setSelection({ nodes: [uid] })
    }
    const selected = app.selection.nodes
    if (!selected.has(uid)) return null
    const starts = new Map()
    app.getDoc().nodes.forEach(n => { if (selected.has(n._uid)) starts.set(n._uid, { x: Number(n.x) || 0, y: Number(n.y) || 0 }) })
    const part = hit.dataset.part || null
    let positions = null
    return {
      start () {
        app.hideTooltip()
        if (app.snap().enabled) canvas.setGridVisible(true)
      },
      move ({ e, p: q }) {
        const anchor = starts.get(uid)
        let dx = q.x - p.x
        let dy = q.y - p.y
        const { enabled, size } = app.snap()
        if (enabled && size > 0) {
          dx = Math.round((anchor.x + dx) / size) * size - anchor.x
          dy = Math.round((anchor.y + dy) / size) * size - anchor.y
        }
        positions = new Map()
        starts.forEach((s, u) => positions.set(u, { x: Math.round(s.x + dx), y: Math.round(s.y + dy) }))
        app.previewMove(positions)
        const a = positions.get(uid)
        app.showDragInfo(`x ${a.x} · y ${a.y}${positions.size > 1 ? ` · ${positions.size} nodes` : ''}`, e.clientX, e.clientY)
      },
      end ({ moved, commit }) {
        canvas.setGridVisible(false)
        app.hideDragInfo()
        if (moved && positions) { app.commitMove(positions); return }
        if (!additive && app.selection.nodes.size > 1) app.setSelection({ nodes: [uid] })
        // A click (no drag) on a label edits it in place.
        if (part && !additive && commit) app.editLabel(uid, part)
      }
    }
  }

  // Drawing a flow. Over a node: connect to it. Over empty canvas with Shift held: a
  // new node will be added at the (snapped) pointer position.
  function connectGesture ({ uid: sourceUid, p: start }) {
    let last = null
    let targetUid = null
    let newNodeAt = null
    app.hideTooltip()
    function update (clientX, clientY, shift) {
      last = { clientX, clientY }
      const p = canvas.clientToContent(clientX, clientY)
      const under = hitAt(document.elementFromPoint(clientX, clientY))
      targetUid = under && (under.dataset.hit === 'node' || under.dataset.hit === 'handle') && under.dataset.uid !== sourceUid ? under.dataset.uid : null
      newNodeAt = !targetUid && shift ? app.snapPoint(p) : null
      const from = app.handlePosition(sourceUid) || start
      const end = newNodeAt ? { x: newNodeAt.x - 4, y: newNodeAt.y + 7 } : p
      canvas.setConnect({ x0: from.x, y0: from.y, x1: end.x, y1: end.y, targetUid, ghost: newNodeAt })
      svg.classList.toggle('connect-new', !!newNodeAt)
      if (targetUid) app.hideDragInfo()
      else app.showDragInfo(newNodeAt ? 'Release to add a new node here' : 'Hold Shift to add a new node here', clientX, clientY)
    }
    return {
      threshold: false,
      move ({ e }) { update(e.clientX, e.clientY, e.shiftKey) },
      // Pressing Shift mid-drag switches the preview without needing a mouse move.
      key (e, down) { if (e.key === 'Shift' && last) update(last.clientX, last.clientY, down) },
      end ({ commit }) {
        canvas.setConnect(null)
        svg.classList.remove('connect-new')
        app.hideDragInfo()
        if (!commit) return
        if (targetUid) app.createFlow(sourceUid, targetUid)
        else if (newNodeAt) app.createFlowToNewNode(sourceUid, newNodeAt)
      }
    }
  }

  function selectLink (uid, additive) {
    if (!additive) { app.setSelection({ links: [uid] }); return }
    const links = new Set(app.selection.links)
    links.has(uid) ? links.delete(uid) : links.add(uid)
    app.setSelection({ nodes: [...app.selection.nodes], links: [...links] })
  }

  function iconGesture ({ uid, additive, second }) {
    const icon = canvas.flowIconAt(uid)
    selectLink(uid, additive)
    if (!icon || additive) return null
    let t = icon.t
    return {
      start () { app.hideTooltip() },
      move ({ e, p }) {
        t = Math.round(icon.line.nearest([p.x, p.y]) * 100) / 100
        app.previewIcon({ uid, t })
        app.showDragInfo(`Icon at ${Math.round(t * 100)}%`, e.clientX, e.clientY)
      },
      end ({ moved, commit }) {
        app.hideDragInfo()
        if (moved && commit) app.commitIconPosition(uid, t)
        else if (moved) app.previewIcon(null)
        else if (second && commit) app.editFlowIcon(uid)
      }
    }
  }

  attachPointer(canvas, app, {
    press (ctx) {
      const { kind, uid, additive, second } = ctx
      if (kind === 'badge') app.showIssuesFor(uid)
      else if (kind === 'handle') return connectGesture(ctx)
      else if (kind === 'node') return nodeGesture(ctx)
      else if (kind === 'link') {
        if (second && !additive) app.editFlowValue(uid)
        else selectLink(uid, additive)
      } else if (kind === 'flow-icon') return iconGesture(ctx)
      return null
    },
    hover (hit, e) {
      if (hit && (hit.dataset.hit === 'link' || hit.dataset.hit === 'flow-icon')) app.showLinkTooltip(hit.dataset.uid, e.clientX, e.clientY)
      else app.hideTooltip()
    },
    doubleClick (hit, e, p) {
      if (hit && hit.dataset.hit === 'node') app.openNodeDetails(hit.dataset.uid)
      else if (hit && hit.dataset.hit === 'link') app.editFlowValue(hit.dataset.uid)
      else if (!hit) app.addNodeAt(p)
    },
    marquee: {
      base: () => ({ nodes: [...app.selection.nodes], links: [...app.selection.links] }),
      select (m, base, additive) {
        const hits = app.nodesInRect(m)
        app.setSelection({ nodes: additive ? [...new Set([...base.nodes, ...hits])] : hits, links: additive ? base.links : [] })
      }
    },
    title: {
      snap: pos => app.snapPoint(pos),
      dragging: on => { if (!on || app.snap().enabled) canvas.setGridVisible(on) }
    }
  })
}
