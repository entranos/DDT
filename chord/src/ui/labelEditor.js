// Editing in place on the canvas: titles, names of nodes and groups, legend entries. Enter or
// clicking elsewhere saves, Escape cancels.

import { getSetting } from '../model/schema.js'
import { fontStack } from '../render/chord.js'
import { createInlineEditor } from '../../../shared/src/inlineEditor.js'

export function createLabelEditor (host, app, canvas) {
  const editor = createInlineEditor(host, { refocus: () => canvas.svg.focus({ preventScroll: true }) })

  function openOver (el, options) {
    const doc = app.getDoc()
    if (!doc || !el) return false
    editor.open({
      rect: el.getBoundingClientRect(),
      px: Math.max(10, Number(el.getAttribute('font-size') || 12) * getSetting(doc, 'scaleCanvas') * canvas.transform.k),
      family: fontStack(getSetting(doc, 'font')),
      weight: Number(el.getAttribute('font-weight')) || 400,
      color: getSetting(doc, 'textColor'),
      ...options
    })
    return true
  }

  function editSetting (key, el, label, color) {
    const doc = app.getDoc()
    const before = doc && getSetting(doc, key)
    return openOver(el, { color, value: before, placeholder: label, label, onCommit: v => { if (v !== before) app.setSetting(key, v, false) } })
  }

  const editDiagramTitle = () => editSetting('title', canvas.content.querySelector('text.diagram-title') || canvas.content.querySelector('text.title-placeholder'), 'Diagram title', getSetting(app.getDoc(), 'titleColor'))
  const editSubtitle = () => editSetting('subtitle', canvas.diagram.querySelector('text.diagram-subtitle'), 'Subtitle', getSetting(app.getDoc(), 'mutedTextColor'))

  function editNodeTitle (uid) {
    const doc = app.getDoc()
    const row = doc.nodes.find(n => n._uid === uid)
    const item = canvas.nodeOf(uid)
    if (!row || !item || !item.label || !item.label.titleNode) return false
    const before = row.title || row.id
    return openOver(item.label.titleNode, { value: before, growLeft: item.label.side < 0, label: 'Name of the node', onCommit: v => { if (v.trim() && v.trim() !== before) app.edit('Rename node', d => app.commands.updateNode(d, uid, { title: v.trim() })) } })
  }

  // Along an arc a text is curved; its box opens over the middle of it.
  function editGroupTitle (uid) {
    const doc = app.getDoc()
    const row = doc.groups.find(g => g._uid === uid)
    const item = canvas.groupOf(uid)
    if (!row || !item || !item.textNode) return false
    const before = row.title || row.id
    const r = item.textNode.getBoundingClientRect()
    const width = Math.max(90, before.length * 8)
    const cx = r.left + r.width / 2
    const cy = r.top + r.height / 2
    return openOver(item.textNode, { rect: { left: cx - width / 2, right: cx + width / 2, top: cy - 12, bottom: cy + 12, width, height: 24 }, px: 14, value: before, label: 'Name of the group', onCommit: v => { if (v.trim() && v.trim() !== before) app.edit('Rename group', d => app.commands.updateGroup(d, uid, { title: v.trim() })) } })
  }

  function editLegendTitle (uid) {
    const doc = app.getDoc()
    const row = doc.carriers.find(c => c._uid === uid)
    const drawn = canvas.result.legend.find(l => l.uid === uid)
    if (!row || !drawn) return false
    const before = row.title || ''
    return openOver(drawn.node, { value: before, label: 'Carrier title', onCommit: v => { if (v.trim() && v.trim() !== before) app.edit('Edit carrier title', d => app.commands.updateCarrier(d, uid, { title: v.trim() })) } })
  }

  return { editDiagramTitle, editSubtitle, editNodeTitle, editGroupTitle, editLegendTitle, close: commit => editor.close(commit), get open () { return editor.isOpen } }
}
