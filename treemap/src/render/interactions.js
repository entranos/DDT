// Pointer interactions on the treemap canvas (pan, zoom, resize, marquee and the diagram
// title are shared, see shared/src/pointer.js):
//   click            select a tile, a block (its header) or a legend entry (Shift/Cmd adds)
//   click block name or group name: edit it in place
//   drag header      move the block before or after another one (and into its group)
//   click +          add a value to the block
//   drag background  marquee-select tiles
//   double-click     tile: edit its value in the Data tab · legend entry: rename ·
//                    empty canvas: add a block

import { attachPointer } from '../../../shared/src/pointer.js'

export function attachInteractions (canvas, app) {
  const keys = ['blocks', 'values', 'carriers']

  function toggle (key, uids) {
    const sel = Object.fromEntries(keys.map(k => [k, new Set(app.selection[k])]))
    const on = uids.every(u => sel[key].has(u))
    uids.forEach(u => (on ? sel[key].delete(u) : sel[key].add(u)))
    app.setSelection(Object.fromEntries(keys.map(k => [k, [...sel[k]]])))
  }

  // Blocks are rows of the blocks table, or of the carriers table in the per-carrier view.
  const containerKey = () => (app.model.perBlock ? 'blocks' : 'carriers')

  function blockGesture ({ uid, hit, additive }) {
    const key = containerKey()
    if (additive) { toggle(key, [uid]); return null }
    app.setSelection({ [key]: [uid] })
    const part = hit.dataset.part
    let target = null
    return {
      start () { app.hideTooltip() },
      move ({ e, p }) {
        target = canvas.blockAt(p, uid)
        canvas.setDrop({ uid, targetUid: target && target.uid, after: target && target.after })
        app.showDragInfo(target ? app.dropText(target) : 'Drop on another block to move it there', e.clientX, e.clientY)
      },
      end ({ moved, commit }) {
        canvas.setDrop(null)
        app.hideDragInfo()
        if (!commit) return
        if (moved) { if (target) app.moveBlock(uid, target.uid, target.after) } else if (part === 'title') app.editBlockTitle(uid)
      }
    }
  }

  attachPointer(canvas, app, {
    press (ctx) {
      const { kind, uid, hit, additive, second } = ctx
      if (kind === 'block') return blockGesture(ctx)
      if (kind === 'add') { app.addValueTo(uid); return null }
      if (kind === 'group') return { end: ({ commit, moved }) => { if (commit && !moved) app.editGroupName(hit.dataset.name) } }
      if (kind === 'tile') {
        const uids = app.tileUids(uid)
        if (second && !additive) { app.editTileValue(uid); return null }
        if (additive) toggle('values', uids)
        else app.setSelection({ values: uids })
      } else if (kind === 'legend') {
        const key = app.model.perBlock ? 'carriers' : 'blocks'
        if (additive) toggle(key, [uid])
        else app.setSelection({ [key]: [uid] })
      }
      return null
    },
    hover (hit, e) {
      const kind = hit && hit.dataset.hit
      if (kind === 'tile') app.showTileTooltip(hit.dataset.uid, e.clientX, e.clientY)
      else if (kind === 'legend') app.hoverLegend(hit.dataset.uid)
      else app.hideTooltip()
    },
    doubleClick (hit, e, p) {
      const kind = hit && hit.dataset.hit
      if (kind === 'legend') app.editLegendTitle(hit.dataset.uid)
      else if (!hit) app.addBlock()
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
