// Editing in place on the canvas: titles, diagram names, years, legend entries, and the
// changes between totals. Enter or clicking elsewhere saves, Escape cancels.

import { getSetting, toNumber, isFiniteNumber } from '../model/schema.js'
import { fontStack } from '../render/waterfall.js'
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
    openOver(el, { color, value: before, placeholder: label, label, onCommit: v => { if (v !== before) app.setSetting(key, v, false) } })
  }

  const editDiagramTitle = () => editSetting('title', canvas.content.querySelector('text.diagram-title') || canvas.content.querySelector('text.title-placeholder'), 'Diagram title', getSetting(app.getDoc(), 'titleColor'))
  const editSubtitle = () => editSetting('subtitle', canvas.diagram.querySelector('text.diagram-subtitle'), 'Subtitle', getSetting(app.getDoc(), 'mutedTextColor'))

  function editMomentTitle (uid, row = 0) {
    const doc = app.getDoc()
    const moment = doc.moments.find(m => m._uid === uid)
    const drawn = canvas.result.moments.find(m => m.uid === uid && m.row === row)
    if (!moment || !drawn) return false
    const before = moment.title || moment.id
    return openOver(drawn.node, { value: before, label: 'Moment', onCommit: v => app.renameMoment(uid, v) })
  }

  function editDiagramText (uid, part) {
    const doc = app.getDoc()
    const row = doc.diagrams.find(d => d._uid === uid)
    const drawn = canvas.result.texts.find(t => t.uid === uid && t.part === part)
    if (!row || !drawn) return false
    const before = row[part] || ''
    return openOver(drawn.node, {
      value: before,
      label: part === 'title' ? 'Diagram name' : 'Diagram subtitle',
      color: getSetting(doc, part === 'title' ? 'textColor' : 'mutedTextColor'),
      onCommit: v => { if (v.trim() !== before) app.edit(part === 'title' ? 'Rename diagram' : 'Edit diagram subtitle', d => app.commands.updateDiagram(d, uid, { [part]: v.trim() })) }
    })
  }

  function editLegendTitle (uid) {
    const doc = app.getDoc()
    const row = doc.carriers.find(c => c._uid === uid)
    const drawn = canvas.result.legend.find(l => l.uid === uid)
    if (!row || !drawn) return false
    const before = row.title || ''
    return openOver(drawn.node, { value: before, label: 'Carrier title', onCommit: v => { if (v.trim() && v.trim() !== before) app.edit('Edit carrier title', d => app.commands.updateCarrier(d, uid, { title: v.trim() })) } })
  }

  // The change of one step, typed as a number (as shown, after unit conversion).
  function editChange (key) {
    const doc = app.getDoc()
    const bar = canvas.step(key)
    const hit = host.querySelector(`.hit-step[data-key="${CSS.escape(key)}"]`)
    if (!doc || !bar || !hit) return false
    const r = (bar.labelNode || hit).getBoundingClientRect()
    const before = Math.round(bar.step.change * 1e6) / 1e6
    const width = 58
    const rect = { left: r.left + r.width / 2 - width / 2, right: r.left + r.width / 2 + width / 2, top: r.top + r.height / 2 - 11, bottom: r.top + r.height / 2 + 11, width, height: 22 }
    editor.open({
      rect,
      px: 13,
      family: fontStack(getSetting(doc, 'font')),
      weight: 500,
      color: getSetting(doc, 'textColor'),
      numeric: true,
      value: plainNumber(before),
      label: `Change of ${bar.carrier.title} from ${bar.from.title} to ${bar.to.title}`,
      onCommit: v => {
        const n = toNumber(String(v).replace(/−/g, '-').replace(/^\+/, ''))
        if (!isFiniteNumber(n) || n === before) return
        app.edit('Change step', d => app.commands.setChange(d, bar.diagram.id, bar.carrier.id, bar.from.id, bar.to.id, n / app.model.multiply))
      }
    })
    return true
  }

  return { editDiagramTitle, editSubtitle, editMomentTitle, editDiagramText, editLegendTitle, editChange, close: commit => editor.close(commit), get open () { return editor.isOpen } }
}
