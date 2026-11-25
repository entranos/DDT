// Pointer interactions on the bar chart canvas (pan, zoom, resize, marquee and the chart
// title are shared, see shared/src/pointer.js):
//   click part       select it: its value, icon and pattern are in the right panel
//   drag part        change its amount (Shift for finer steps)
//   double-click     part: its cell in the Data tab · bar icon: choose another ·
//                    legend entry: rename · empty canvas: add a bar
//   click an amount, name, group, subtitle or axis title: edit it in place
//   drag name        reorder the bars, also into another group
//   click +          add a bar

import { attachPointer } from '../../../shared/src/pointer.js'

export function attachInteractions (canvas, app) {
  const keys = ['bars', 'series']

  function select (key, uid, additive, cell = null) {
    if (!additive) { app.setSelection({ [key]: [uid] }, cell); return }
    const sel = Object.fromEntries(keys.map(k => [k, new Set(app.selection[k])]))
    sel[key].has(uid) ? sel[key].delete(uid) : sel[key].add(uid)
    app.setSelection(Object.fromEntries(keys.map(k => [k, [...sel[k]]])))
  }
  const cellOf = item => ({ bar: item.uid, series: item.part.series.uid })

  // Dragging a part along the value axis changes its amount; the axis stays put meanwhile.
  function partGesture (item, { p, additive, second }) {
    select('bars', item.uid, additive, cellOf(item))
    if (additive) return null
    const res = canvas.result
    const frozen = res.frame
    let amount = item.part.amount
    let moving = false
    return {
      start () { app.hideTooltip() },
      move ({ e, p: q }) {
        moving = true
        const by = (res.horizontal ? q.x - p.x : p.y - q.y) / frozen.per
        amount = app.draggedAmount(item, by, frozen.per, e.shiftKey)
        app.previewAmount(item, amount, frozen)
        app.showDragInfo(app.amountText(item, amount), e.clientX, e.clientY)
      },
      end ({ moved, commit }) {
        app.hideDragInfo()
        if (moved && moving && commit) app.commitAmount(item, amount)
        else if (moving) app.previewAmount(null)
        else if (second && commit) app.editAmountCell(item)
      }
    }
  }

  // Dragging a bar by its name (or icon) reorders the bars. A click does `onClick`.
  function orderGesture ({ uid, additive, second }, { onClick = null, onDouble = null } = {}) {
    select('bars', uid, additive)
    if (additive) return null
    let target = null
    return {
      start () { app.hideTooltip() },
      move ({ e, p }) {
        target = canvas.barAt(p, uid)
        canvas.setDrop(target)
        app.showDragInfo(app.dropText(uid, target), e.clientX, e.clientY)
      },
      end ({ moved, commit }) {
        canvas.setDrop(null)
        app.hideDragInfo()
        if (!commit) return
        if (moved) { if (target) app.moveBar(uid, target.uid, target.after) } else if (second && onDouble) onDouble()
        else if (onClick) onClick()
      }
    }
  }

  const onClick = fn => ({ end: ({ commit, moved }) => { if (commit && !moved) fn() } })

  attachPointer(canvas, app, {
    press (ctx) {
      const { kind, uid, hit, additive } = ctx
      const item = hit.dataset.key ? canvas.part(hit.dataset.key) : null
      if (kind === 'part') return item ? partGesture(item, ctx) : null
      if (kind === 'value' || kind === 'end') {
        select('bars', uid, additive, item ? cellOf(item) : null)
        return additive ? null : onClick(() => (item ? app.editAmount(item, kind) : app.editTotal(uid)))
      }
      if (kind === 'name') return orderGesture(ctx, { onClick: () => app.editBarName(uid) })
      if (kind === 'bar-icon') return orderGesture(ctx, { onDouble: () => app.editBarIcon(uid) })
      if (kind === 'group') return onClick(() => app.editGroup(hit.dataset.name))
      if (kind === 'subtitle') return onClick(() => app.editSubtitle())
      if (kind === 'axis-title') return onClick(() => app.editAxisTitle())
      if (kind === 'legend') select('series', uid, additive)
      else if (kind === 'add-bar') app.addBar()
      return null
    },
    hover (hit, e) {
      const kind = hit && hit.dataset.hit
      const key = hit && hit.dataset.key
      if (kind === 'part' || kind === 'value' || (kind === 'end' && key)) app.showPartTooltip(canvas.part(key), e.clientX, e.clientY)
      else if (kind === 'bar-icon' || kind === 'end') app.showBarTooltip(hit.dataset.uid, e.clientX, e.clientY)
      else if (kind === 'legend') app.hoverSeries(hit.dataset.uid)
      else app.hideTooltip()
    },
    doubleClick (hit) {
      if (hit && hit.dataset.hit === 'legend') app.editLegendTitle(hit.dataset.uid)
      else if (!hit) app.addBar()
    },
    marquee: {
      base: () => Object.fromEntries(keys.map(k => [k, [...app.selection[k]]])),
      select (m, base, additive) {
        const found = app.barsInRect(m)
        app.setSelection(additive ? { ...base, bars: [...new Set([...base.bars, ...found])] } : { bars: found })
      }
    }
  })
}
