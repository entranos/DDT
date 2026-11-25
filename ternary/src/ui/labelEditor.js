// Editing texts in place on the canvas: the diagram title, corner names, the texts
// along the direction arrows and series names in the legend.
// Enter or clicking elsewhere saves, Escape cancels.

import { getSetting } from '../model/schema.js'
import { fontStack } from '../render/ternary.js'
import { createInlineEditor } from '../../../shared/src/inlineEditor.js'

export function createLabelEditor (host, app, canvas) {
  const editor = createInlineEditor(host, { refocus: () => canvas.svg.focus({ preventScroll: true }) })

  function openOver (el, options) {
    const doc = app.getDoc()
    if (!doc || !el) return false
    const scale = getSetting(doc, 'scaleCanvas') * canvas.transform.k
    editor.open({
      rect: el.getBoundingClientRect(),
      px: Math.max(10, Number(el.getAttribute('font-size')) * scale),
      family: fontStack(getSetting(doc, 'font')),
      weight: Number(el.getAttribute('font-weight')) || 400,
      color: getSetting(doc, 'textColor'),
      growLeft: el.getAttribute('text-anchor') === 'end',
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

  const PARTS = { label: 'Corner name', low: 'Arrow start text', high: 'Arrow end text' }

  function editAxisText (corner, part) {
    const doc = app.getDoc()
    const axis = doc && doc.axes.find(a => a.corner === corner)
    if (!axis) return
    const before = axis[part] || ''
    openOver(canvas.diagram.querySelector(`text.axis-text[data-corner="${corner}"][data-part="${part}"]`), {
      value: before,
      label: PARTS[part],
      onCommit: v => {
        const next = v.trim()
        if (next === before || (part === 'label' && !next)) return
        app.edit(`Edit ${PARTS[part].toLowerCase()}`, d => app.commands.updateAxis(d, axis._uid, { [part]: next }))
      }
    })
  }

  // Returns false when the series has no legend entry to edit.
  function editSeriesTitle (uid) {
    const doc = app.getDoc()
    const series = doc && doc.series.find(s => s._uid === uid)
    if (!series) return false
    const before = series.title || ''
    return openOver(canvas.diagram.querySelector(`text.legend-text[data-uid="${CSS.escape(uid)}"]`), {
      value: before,
      label: 'Series title',
      onCommit: v => { if (v.trim() && v !== before) app.edit('Edit series title', d => app.commands.updateSeries(d, uid, { title: v.trim() })) }
    })
  }

  return { editDiagramTitle, editAxisText, editSeriesTitle, close: commit => editor.close(commit), get open () { return editor.isOpen } }
}
