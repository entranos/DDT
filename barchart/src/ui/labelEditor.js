// Editing in place on the canvas: titles, names of bars and groups, legend entries, and
// amounts. Enter or clicking elsewhere saves, Escape cancels.

import { getSetting, toNumber, isFiniteNumber } from '../model/schema.js'
import { fontStack } from '../render/chart.js'
import { plainNumber } from '../../../shared/src/format.js'
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
  const editAxisTitle = () => {
    const doc = app.getDoc()
    const drawn = canvas.result.axisTitle
    const own = getSetting(doc, 'axisTitle')
    if (!drawn) return false
    return openOver(drawn.node, {
      color: getSetting(doc, 'mutedTextColor'),
      value: own || drawn.node.textContent,
      label: 'Axis title',
      growLeft: canvas.result.horizontal,
      onCommit: v => { if (v.trim() !== (own || drawn.node.textContent)) app.setSetting('axisTitle', v.trim(), false) }
    })
  }

  // A rectangle of a set width around the middle of another, for texts that are turned or short.
  function centred (r, width, height = 24) {
    const cx = r.left + r.width / 2
    const cy = r.top + r.height / 2
    return { left: cx - width / 2, right: cx + width / 2, top: cy - height / 2, bottom: cy + height / 2, width, height }
  }

  function editBarName (uid) {
    const doc = app.getDoc()
    const row = doc.bars.find(b => b._uid === uid)
    const drawn = canvas.barOf(uid)
    if (!row || !drawn) return false
    const hit = host.querySelector(`.hit-name[data-uid="${uid}"]`)
    const el = drawn.nameNode
    const turned = el && el.hasAttribute('transform')
    const before = row.title || ''
    const options = { value: before, label: 'Name of the bar', placeholder: 'Name', growLeft: canvas.result.horizontal, onCommit: v => { if (v.trim() !== before) app.edit('Rename bar', d => app.commands.updateBar(d, uid, { title: v.trim() })) } }
    if (el && !turned) return openOver(el, options)
    if (!hit) return false
    return openOver(hit, { ...options, rect: centred(hit.getBoundingClientRect(), Math.max(60, before.length * 8)), px: 14, weight: 400 })
  }

  function editGroup (name) {
    const drawn = canvas.result.groups.find(g => g.title === name)
    return drawn && openOver(drawn.node, { value: name, label: 'Group', onCommit: v => { if (v.trim() !== name) app.edit('Rename group', d => app.commands.renameGroup(d, name, v)) } })
  }

  function editLegendTitle (uid) {
    const doc = app.getDoc()
    const row = doc.series.find(s => s._uid === uid)
    const drawn = canvas.result.legend.find(l => l.uid === uid)
    if (!row || !drawn) return false
    return openOver(drawn.node, { value: row.title || row.id, label: 'Series', onCommit: v => app.renameSeries(uid, v) })
  }

  // An amount as shown (after unit conversion), typed over the label that shows it.
  function editNumber (el, { value, label, onCommit }) {
    const before = Math.round(value * 1e6) / 1e6
    return openOver(el, {
      rect: centred(el.getBoundingClientRect(), 64),
      px: 13,
      weight: 500,
      numeric: true,
      value: plainNumber(before),
      label,
      onCommit: v => {
        const n = toNumber(String(v).replace(/−/g, '-'))
        if (isFiniteNumber(n) && n !== before) onCommit(n)
      }
    })
  }

  function editAmount (item, kind) {
    const label = kind === 'end' ? item.endLabel : item.label
    if (!label) return false
    return editNumber(label.node, { value: item.part.amount, label: `${item.bar.title}, ${item.part.series.title}`, onCommit: n => app.commitAmount(item, n) })
  }

  function editTotal (uid) {
    const drawn = canvas.barOf(uid)
    if (!drawn || !drawn.total) return false
    return editNumber(drawn.total.node, { value: drawn.bar.total, label: `Total of ${drawn.bar.title}`, onCommit: n => app.commitTotal(uid, n) })
  }

  return { editDiagramTitle, editSubtitle, editAxisTitle, editBarName, editGroup, editLegendTitle, editAmount, editTotal, close: commit => editor.close(commit), get open () { return editor.isOpen } }
}
