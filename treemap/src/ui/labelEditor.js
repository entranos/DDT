// Editing texts in place on the canvas: the diagram title, block names, group names and
// legend entries. Enter or clicking elsewhere saves, Escape cancels.

import { getSetting } from '../model/schema.js'
import { fontStack } from '../render/treemap.js'
import { createInlineEditor } from '../../../shared/src/inlineEditor.js'

export function createLabelEditor (host, app, canvas) {
  const editor = createInlineEditor(host, { refocus: () => canvas.svg.focus({ preventScroll: true }) })

  function openOver (el, options) {
    const doc = app.getDoc()
    if (!doc || !el) return false
    editor.open({
      rect: el.getBoundingClientRect(),
      px: Math.max(10, Number(el.getAttribute('font-size')) * getSetting(doc, 'scaleCanvas') * canvas.transform.k),
      family: fontStack(getSetting(doc, 'font')),
      weight: 400,
      color: getSetting(doc, 'textColor'),
      ...options
    })
    return true
  }

  function editDiagramTitle () {
    const doc = app.getDoc()
    const before = doc && getSetting(doc, 'title')
    openOver(canvas.content.querySelector('text.diagram-title') || canvas.content.querySelector('text.title-placeholder'), {
      color: doc && getSetting(doc, 'titleColor'),
      value: before,
      placeholder: 'Diagram title',
      label: 'Diagram title',
      onCommit: v => { if (v !== before) app.setSetting('title', v, false) }
    })
  }

  // A block or carrier by uid: its title, over `el`.
  function editRowTitle (uid, el) {
    const doc = app.getDoc()
    const isBlock = doc.blocks.some(b => b._uid === uid)
    const row = (isBlock ? doc.blocks : doc.carriers).find(x => x._uid === uid)
    if (!row) return false
    const before = row.title || ''
    return openOver(el, {
      value: before,
      label: isBlock ? 'Block title' : 'Carrier title',
      onCommit: v => {
        const next = v.trim()
        if (!next || next === before) return
        app.edit(isBlock ? 'Edit block title' : 'Edit carrier title', d => (isBlock ? app.commands.updateBlock(d, uid, { title: next }) : app.commands.updateCarrier(d, uid, { title: next })))
      }
    })
  }

  function editBlockTitle (uid) {
    const b = canvas.result && canvas.result.blocks.find(x => x.uid === uid)
    return b ? editRowTitle(uid, b.nameNode) : false
  }

  function editLegendTitle (uid) {
    const l = canvas.result && canvas.result.legend.find(x => x.uid === uid)
    return l ? editRowTitle(uid, l.node) : false
  }

  function editGroupName (name) {
    const g = canvas.result && canvas.result.groups.find(x => x.name === name)
    if (!g) return
    openOver(g.node, {
      value: name,
      label: 'Group name',
      onCommit: v => { if (v.trim() !== name) app.edit('Rename group', d => app.commands.renameGroup(d, name, v)) }
    })
  }

  return { editDiagramTitle, editBlockTitle, editLegendTitle, editGroupName, close: commit => editor.close(commit), get open () { return editor.isOpen } }
}
