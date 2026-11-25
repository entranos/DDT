// Pointer interactions on the ternary canvas (pan, zoom, resize, marquee and the
// diagram title are shared, see shared/src/pointer.js):
//   click            select a series (line), a point or a legend entry (Shift/Cmd adds)
//   drag point       change its mix; its total stays the same (Shift: whole percents)
//   drag background  marquee-select points
//   click a corner name or arrow text: edit it in place
//   double-click     point: edit its row in the Data tab · empty triangle: add a point
//                    to the selected series (or a new one) · series: edit its title

import { attachPointer } from '../../../shared/src/pointer.js'

export function attachInteractions (canvas, app) {
  let seriesBefore = null // the active series before a double-click's first click cleared the selection

  function toggle (key, uid) {
    const sel = { series: new Set(app.selection.series), points: new Set(app.selection.points) }
    sel[key].has(uid) ? sel[key].delete(uid) : sel[key].add(uid)
    app.setSelection({ series: [...sel.series], points: [...sel.points] })
  }

  function pointGesture ({ uid, additive, second }) {
    if (additive) { toggle('points', uid); return null }
    if (!app.selection.points.has(uid)) app.setSelection({ points: [uid] })
    const found = app.pointInfo(uid)
    if (!found) return null
    const { geometry, domain } = canvas.result
    const total = found.point.total
    let shares = found.point.shares
    return {
      start () { app.hideTooltip() },
      move ({ e, p }) {
        shares = app.clampShares(geometry.sharesAt(p.x, p.y), e.shiftKey)
        app.previewPoint(uid, shares, domain)
        app.showDragInfo(app.shareText(shares), e.clientX, e.clientY)
      },
      end ({ moved, commit }) {
        app.hideDragInfo()
        if (moved && commit) app.commitPoint(uid, shares, total)
        else if (moved) app.previewPoint(null)
        else if (second && commit) app.editPointCell(uid) // a click, then a drag, still drags
      }
    }
  }

  attachPointer(canvas, app, {
    press (ctx) {
      const { kind, uid, hit, additive } = ctx
      if (kind === 'point') return pointGesture(ctx)
      if (kind === 'axis-text') {
        app.hideTooltip()
        return { end: ({ commit }) => { if (commit) app.editAxisText(hit.dataset.corner, hit.dataset.part) } }
      }
      if (kind === 'series' || kind === 'legend') {
        if (additive) toggle('series', uid)
        else app.setSelection({ series: [uid] })
      }
      return null
    },
    hover (hit, e) {
      const kind = hit && hit.dataset.hit
      if (kind === 'point') app.showPointTooltip(hit.dataset.uid, e.clientX, e.clientY)
      else if (kind === 'series') app.showSeriesTooltip(hit.dataset.uid, e.clientX, e.clientY)
      else app.hideTooltip()
    },
    doubleClick (hit, e, p) {
      const kind = hit && hit.dataset.hit
      if (kind === 'series' || kind === 'legend') app.editSeriesTitle(hit.dataset.uid)
      else if (!hit) app.addPointAt(p, seriesBefore)
    },
    marquee: {
      start (second) { if (!second) seriesBefore = app.activeSeriesUid() },
      base: () => ({ points: [...app.selection.points], series: [...app.selection.series] }),
      select (m, base, additive) {
        const hits = app.pointsInRect(m)
        app.setSelection({ points: additive ? [...new Set([...base.points, ...hits])] : hits, series: additive ? base.series : [] })
      }
    }
  })
}
