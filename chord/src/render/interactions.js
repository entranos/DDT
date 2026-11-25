// Pointer interactions on the chord canvas (pan, zoom, resize, marquee and the diagram title
// are shared, see shared/src/pointer.js):
//   click            select a flow, node, group or carrier (legend)
//   double-click     flow: its cell in the Data tab · node arc: choose an icon ·
//                    legend entry: rename · empty canvas: add a node
//   click name       of a node or group, or the subtitle: edit it in place
//   drag node arc    move it along the circle, also into another group
//   drag group arc   move the group
//   drag label       move it; its place is kept with the node
//   drag handle      draw a flow to another node

import { attachPointer, hitAt } from '../../../shared/src/pointer.js'

export function attachInteractions (canvas, app) {
  const keys = ['flows', 'nodes', 'groups', 'carriers', 'scenarios', 'details']

  function select (key, uids, additive) {
    if (!additive) { app.setSelection({ [key]: uids }); return }
    const sel = Object.fromEntries(keys.map(k => [k, new Set(app.selection[k])]))
    const on = uids.every(u => sel[key].has(u))
    uids.forEach(u => (on ? sel[key].delete(u) : sel[key].add(u)))
    app.setSelection(Object.fromEntries(keys.map(k => [k, [...sel[k]]])))
  }

  // Dragging along the circle: kind is 'node' or 'group'.
  function orderGesture ({ uid, additive, second }, kind, { onClick = null, onDouble = null } = {}) {
    select(`${kind}s`, [uid], additive)
    if (additive) return null
    const near = p => (kind === 'node' ? canvas.nodeNear(p, uid) : canvas.groupNear(p, uid))
    let target = null
    return {
      start () { app.hideTooltip() },
      move ({ e, p }) {
        target = near(p)
        canvas.setDrop(target, kind)
        app.showDragInfo(app.dropText(kind, uid, target), e.clientX, e.clientY)
      },
      end ({ moved, commit }) {
        canvas.setDrop(null)
        app.hideDragInfo()
        if (!commit) return
        if (moved) { if (target) app.moveAround(kind, uid, target.uid, target.after) } else if (second && onDouble) onDouble()
        else if (onClick) onClick()
      }
    }
  }

  // Dragging a label keeps its offset from where it would be.
  function labelGesture ({ uid, p, additive }, onClick) {
    select('nodes', [uid], additive)
    const item = canvas.nodeOf(uid)
    if (additive || !item) return null
    const start = { dx: item.node.dx, dy: item.node.dy }
    let at = null
    return {
      start () { app.hideTooltip() },
      move ({ p: q }) {
        at = { uid, dx: Math.round(start.dx + q.x - p.x), dy: Math.round(start.dy + q.y - p.y) }
        app.previewLabel(at)
      },
      end ({ moved, commit }) {
        if (moved && commit && at) app.commitLabel(at)
        else if (moved) app.previewLabel(null)
        else if (commit && onClick) onClick()
      }
    }
  }

  function connectGesture ({ uid, p }) {
    let target = null
    app.hideTooltip()
    canvas.setConnect({ source: uid, x: p.x, y: p.y })
    return {
      threshold: false,
      move ({ e, p: q }) {
        const under = hitAt(document.elementFromPoint(e.clientX, e.clientY))
        const kind = under && under.dataset.hit
        target = under && ['node', 'handle', 'label', 'node-title'].includes(kind) && under.dataset.uid !== uid ? under.dataset.uid : null
        canvas.setConnect({ source: uid, x: q.x, y: q.y, target })
        if (target) app.hideDragInfo()
        else app.showDragInfo('Release on another node to add a flow', e.clientX, e.clientY)
      },
      end ({ commit }) {
        canvas.setConnect(null)
        app.hideDragInfo()
        if (commit && target) app.createFlow(uid, target)
      }
    }
  }

  const onClick = fn => ({ end: ({ commit, moved }) => { if (commit && !moved) fn() } })

  attachPointer(canvas, app, {
    press (ctx) {
      const { kind, uid, hit, additive, second } = ctx
      if (kind === 'ribbon') {
        const x = canvas.ribbon(hit.dataset.key)
        if (!x) return null
        select('flows', x.ribbon.uids, additive)
        return second && !additive ? onClick(() => app.editFlowCell(x.ribbon.uids[0])) : null
      }
      if (kind === 'handle') return connectGesture(ctx)
      if (kind === 'node') return orderGesture(ctx, 'node', { onDouble: () => app.editNodeIcon(uid) })
      if (kind === 'group') return orderGesture(ctx, 'group')
      if (kind === 'group-name') return orderGesture(ctx, 'group', { onClick: () => app.editGroupTitle(uid) })
      if (kind === 'label') return labelGesture(ctx)
      if (kind === 'node-title') return labelGesture(ctx, additive ? null : () => app.editNodeTitle(uid))
      if (kind === 'subtitle') return onClick(() => app.editSubtitle())
      if (kind === 'legend') select('carriers', [uid], additive)
      return null
    },
    hover (hit, e) {
      const kind = hit && hit.dataset.hit
      if (kind !== 'handle') canvas.setHandle(kind === 'node' ? hit.dataset.uid : null)
      if (kind === 'ribbon') app.showFlowTooltip(hit.dataset.key, e.clientX, e.clientY)
      else if (['node', 'handle', 'label', 'node-title'].includes(kind)) app.showNodeTooltip(hit.dataset.uid, kind, e.clientX, e.clientY)
      else if (kind === 'group' || kind === 'group-name') app.showGroupTooltip(hit.dataset.uid, e.clientX, e.clientY)
      else if (kind === 'legend') app.hoverCarrier(hit.dataset.uid)
      else app.hideTooltip()
    },
    doubleClick (hit) {
      if (hit && hit.dataset.hit === 'legend') app.editLegendTitle(hit.dataset.uid)
      else if (!hit) app.addNode()
    },
    marquee: {
      base: () => Object.fromEntries(keys.map(k => [k, [...app.selection[k]]])),
      select (m, base, additive) {
        const found = app.nodesInRect(m)
        app.setSelection(additive ? { ...base, nodes: [...new Set([...base.nodes, ...found])] } : { nodes: found })
      }
    }
  })
}
