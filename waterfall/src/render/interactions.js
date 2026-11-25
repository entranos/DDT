// Pointer interactions on the waterfall canvas (pan, zoom, resize, marquee and the diagram
// title are shared, see shared/src/pointer.js):
//   click            select a step, a part of a total, a carrier (heading or legend)
//   drag step        change it: the later moment follows · drag part of a total: its amount
//   click change     type the change · double-click a step does the same
//   double-click     part of a total: its cell in the Data tab · legend entry: rename ·
//                    heading: choose an icon
//   click year, diagram name, subtitle: edit it in place
//   drag heading     reorder the carriers
//   click +          add a moment

import { attachPointer } from '../../../shared/src/pointer.js'

export function attachInteractions (canvas, app) {
  const keys = ['diagrams', 'moments', 'carriers', 'values']

  function toggle (key, uids) {
    const sel = Object.fromEntries(keys.map(k => [k, new Set(app.selection[k])]))
    const on = uids.every(u => sel[key].has(u))
    uids.forEach(u => (on ? sel[key].delete(u) : sel[key].add(u)))
    app.setSelection(Object.fromEntries(keys.map(k => [k, [...sel[k]]])))
  }

  function select (key, uids, additive) {
    if (additive) toggle(key, uids)
    else app.setSelection({ [key]: uids })
  }

  // Dragging a bar up or down changes one amount; the axes stay put meanwhile.
  function amountGesture (item, { additive, second, p }, onDouble) {
    select('values', item.uids, additive)
    if (additive) return null
    app.setActive(item)
    const isStep = item.period !== undefined
    const start = isStep ? item.step.after : item.value
    const perUnit = canvas.result.vertical.rows[item.row].perUnit
    const frozen = canvas.result.vertical
    let amount = start
    return {
      start () { app.hideTooltip() },
      move ({ e, p: q }) {
        amount = app.snapAmount(start + (p.y - q.y) / perUnit, perUnit, e.shiftKey)
        app.previewAmount(item, amount, frozen)
        app.showDragInfo(app.amountText(item, amount), e.clientX, e.clientY)
      },
      end ({ moved, commit }) {
        app.hideDragInfo()
        if (moved && commit) app.commitAmount(item, amount)
        else if (moved) app.previewAmount(null)
        else if (second && commit) onDouble()
      }
    }
  }

  function headGesture ({ uid, hit, additive, second }) {
    select('carriers', [uid], additive)
    if (additive) return null
    const period = Number(hit.dataset.period)
    let target = null
    return {
      start () { app.hideTooltip() },
      move ({ e, p }) {
        target = canvas.headAt(p, period, uid)
        canvas.setDrop(target && { targetUid: target.uid, after: target.after })
        app.showDragInfo(target ? app.dropText(target) : 'Drag onto another carrier to move it there', e.clientX, e.clientY)
      },
      end ({ moved, commit }) {
        canvas.setDrop(null)
        app.hideDragInfo()
        if (!commit) return
        if (moved) { if (target) app.moveCarrier(uid, target.uid, target.after) } else if (second) app.editCarrierIcon(uid)
      }
    }
  }

  attachPointer(canvas, app, {
    press (ctx) {
      const { kind, uid, hit, additive } = ctx
      const key = hit.dataset.key
      if (kind === 'step') {
        const item = canvas.step(key)
        return item ? amountGesture(item, ctx, () => app.editChange(key)) : null
      }
      if (kind === 'segment') {
        const item = canvas.segment(key)
        return item ? amountGesture(item, ctx, () => app.editAmountCell(item)) : null
      }
      if (kind === 'change') {
        const item = canvas.step(key)
        if (item) { select('values', item.uids, additive); app.setActive(item) }
        return { end: ({ commit, moved }) => { if (commit && !moved && !additive) app.editChange(key) } }
      }
      if (kind === 'head') return headGesture(ctx)
      if (kind === 'legend') select('carriers', [uid], additive)
      else if (kind === 'moment') {
        select('moments', [uid], additive)
        return { end: ({ commit, moved }) => { if (commit && !moved && !additive) app.editMomentTitle(uid, Number(hit.dataset.row)) } }
      } else if (kind === 'diagram-text') {
        select('diagrams', [uid], additive)
        return { end: ({ commit, moved }) => { if (commit && !moved && !additive) app.editDiagramText(uid, hit.dataset.part) } }
      } else if (kind === 'subtitle') {
        return { end: ({ commit, moved }) => { if (commit && !moved) app.editSubtitle() } }
      } else if (kind === 'add-moment') app.addMoment()
      return null
    },
    hover (hit, e) {
      const kind = hit && hit.dataset.hit
      if (kind === 'step' || kind === 'change') app.showStepTooltip(canvas.step(hit.dataset.key), e.clientX, e.clientY)
      else if (kind === 'segment') app.showSegmentTooltip(canvas.segment(hit.dataset.key), e.clientX, e.clientY)
      else if (kind === 'head') app.showHeadTooltip(hit.dataset.uid, e.clientX, e.clientY)
      else if (kind === 'legend') app.hoverCarrier(hit.dataset.uid)
      else app.hideTooltip()
    },
    doubleClick (hit) {
      if (hit && hit.dataset.hit === 'legend') app.editLegendTitle(hit.dataset.uid)
    },
    marquee: {
      base: () => Object.fromEntries(keys.map(k => [k, [...app.selection[k]]])),
      select (m, base, additive) {
        const found = app.valuesInRect(m)
        app.setSelection(additive ? { ...base, values: [...new Set([...base.values, ...found])] } : { values: found })
      }
    }
  })
}
