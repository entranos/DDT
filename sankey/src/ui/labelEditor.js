// Editing labels in place on the canvas.
//   diagram title → a text box over the title (or over the "add a title" placeholder).
//   title label → a text box over the label. Enter or clicking elsewhere saves, Escape cancels.
//   value label → the value is the sum of the node's flows, so the edit goes to them:
//                 one flow sets the value → a number box over the label;
//                 several flows → a small panel listing them, each with its own number box.
// Values are typed as shown (after "Multiply values by") and stored as file values.

import { h } from '../../../shared/src/dom.js'
import { getSetting, isFiniteNumber, toNumber } from '../model/schema.js'
import { fontStack } from '../render/diagram.js'
import { createInlineEditor } from '../../../shared/src/inlineEditor.js'
import { formatValue, plainNumber } from '../../../shared/src/format.js'

export function createLabelEditor (host, app, canvas) {
  const editor = createInlineEditor(host, { refocus: () => canvas.svg.focus({ preventScroll: true }) })

  function nodeOf (uid) {
    const doc = app.getDoc()
    return doc && doc.nodes.find(n => n._uid === uid)
  }

  // Screen rectangle of a label chip (or its text, for nodes drawn without chips).
  function labelRect (uid, part) {
    const node = nodeOf(uid)
    const g = canvas.diagram.querySelector(`g.node[data-uid="${CSS.escape(uid)}"]`)
    if (!node || !g) return null
    const inTitle = part === 'title' || String(node.title || '').startsWith('_')
    const chip = g.querySelector(inTitle ? '.chip-title' : '.chip-value')
    const text = g.querySelector(inTitle ? '.label-title' : '.label-value')
    const shown = el => el && el.style.display !== 'none' && el.getBoundingClientRect().width > 0
    const el = shown(chip) ? chip : shown(text) ? text : null
    return el ? el.getBoundingClientRect() : null
  }

  function screenFont () {
    const doc = app.getDoc()
    const px = Math.max(9, getSetting(doc, 'labelFontSize') * getSetting(doc, 'scaleCanvas') * canvas.transform.k)
    return { px, family: fontStack(getSetting(doc, 'font')) }
  }

  const inlineInput = options => editor.open(options)
  const close = commit => editor.close(commit)

  function nodeLabelInput (uid, part, options) {
    const layoutNode = app.layout && app.layout.nodeByUid.get(uid)
    if (!layoutNode) return
    const doc = app.getDoc()
    inlineInput({ ...screenFont(), color: getSetting(doc, 'labelTextColor'), rect: labelRect(uid, part), growLeft: layoutNode.labelLeft, ...options })
  }

  function editTitle (uid) {
    const node = nodeOf(uid)
    if (!node) return
    const before = node.title ?? ''
    nodeLabelInput(uid, 'title', {
      value: before,
      label: 'Node title',
      onCommit: v => { if (v !== before) app.edit('Edit node title', d => app.commands.updateNode(d, uid, { title: v })) }
    })
  }

  // The flows that make up the shown value: the side with the larger total.
  function flowsBehindValue (doc, node) {
    const incoming = doc.links.filter(l => l.target === node.id)
    const outgoing = doc.links.filter(l => l.source === node.id)
    const total = list => list.reduce((s, l) => s + (isFiniteNumber(l.value) ? l.value : 0), 0)
    if (!incoming.length) return { side: 'outgoing', flows: outgoing }
    if (!outgoing.length) return { side: 'incoming', flows: incoming }
    if (total(outgoing) > total(incoming)) return { side: 'outgoing', flows: outgoing }
    if (total(incoming) > total(outgoing)) return { side: 'incoming', flows: incoming }
    return outgoing.length === 1 || incoming.length !== 1 ? { side: 'outgoing', flows: outgoing } : { side: 'incoming', flows: incoming }
  }

  function editValue (uid) {
    const doc = app.getDoc()
    const node = nodeOf(uid)
    if (!node) return
    const { side, flows } = flowsBehindValue(doc, node)
    if (!flows.length) return
    const mult = getSetting(doc, 'scaleDataValue') || 1
    const shown = v => (isFiniteNumber(v) ? plainNumber(Math.round(v * mult * 1e9) / 1e9) : '')
    const stored = n => (mult === 1 ? n : Math.round((n / mult) * 1e9) / 1e9)
    const commitFlow = (link, text) => {
      const n = toNumber(text)
      if (!isFiniteNumber(n) || text === shown(link.value)) return
      app.edit('Change flow value', d => app.commands.updateLink(d, link._uid, { value: stored(n) }))
    }
    if (flows.length === 1) {
      nodeLabelInput(uid, 'value', { value: shown(flows[0].value), weight: 400, label: 'Flow value', numeric: true, onCommit: v => commitFlow(flows[0], v) })
      return
    }
    openFlowPanel(uid, node, side, flows, { shown, commitFlow, mult })
  }

  function openFlowPanel (uid, node, side, flows, { shown, commitFlow, mult }) {
    close(true)
    const rect = labelRect(uid, 'value')
    const layoutNode = app.layout && app.layout.nodeByUid.get(uid)
    if (!rect || !layoutNode) return
    const doc = app.getDoc()
    const names = new Map(doc.nodes.map(n => [n.id, n.title || n.id]))
    const colors = new Map(doc.carriers.map(c => [c.id, c.color]))
    const unit = getSetting(doc, 'unit')
    const dec = getSetting(doc, 'decimalsRoundValues')
    const totalEl = h('strong')
    const inputs = flows.map(link => {
      const input = h('input', { class: 'input num', type: 'text', inputmode: 'decimal', value: shown(link.value), spellcheck: 'false', autocomplete: 'off', 'aria-label': `Value of the flow ${side === 'incoming' ? 'from' : 'to'} ${names.get(side === 'incoming' ? link.source : link.target)}` })
      input.addEventListener('input', () => { input.classList.toggle('invalid', !isFiniteNumber(toNumber(input.value))); updateTotal() })
      input.addEventListener('change', () => commitFlow(link, input.value))
      input.addEventListener('keydown', e => {
        e.stopPropagation()
        if (e.key === 'Enter') { e.preventDefault(); commitFlow(link, input.value); const next = inputs[inputs.indexOf(input) + 1]; if (next) { next.focus(); next.select() } else finish(true) }
        if (e.key === 'Escape') { e.preventDefault(); finish(false) }
      })
      return input
    })
    function updateTotal () {
      const sum = inputs.reduce((s, i) => { const n = toNumber(i.value); return s + (isFiniteNumber(n) ? n : 0) }, 0)
      totalEl.textContent = formatValue(sum, dec, unit)
    }
    updateTotal()
    const panel = h('div', { class: 'label-panel', role: 'dialog', 'aria-label': `Flows behind the value of ${node.title || node.id}` },
      h('div', { class: 'lp-head', text: `${node.title || node.id}: the value is the total of ${flows.length} ${side} flows` }),
      flows.map((link, i) => h('label', { class: 'lp-row' },
        h('span', { class: 'dot', style: { background: colors.get(link.carrier) || '#000' } }),
        h('span', { class: 'lp-name', text: `${side === 'incoming' ? 'from' : 'to'} ${names.get(side === 'incoming' ? link.source : link.target) || '?'}` }),
        inputs[i])),
      h('div', { class: 'lp-total' }, h('span', { text: mult !== 1 ? 'Total (as shown)' : 'Total' }), totalEl),
      h('div', { class: 'lp-foot' }, h('button', { type: 'button', class: 'btn btn-primary btn-small', text: 'Done', onclick: () => finish(true) }))
    )
    host.append(panel)
    const box = host.getBoundingClientRect()
    const top = Math.min(rect.bottom - box.top + 6, box.height - panel.offsetHeight - 8)
    panel.style.top = `${Math.max(8, top)}px`
    const left = layoutNode.labelLeft ? rect.right - box.left - panel.offsetWidth : rect.left - box.left
    panel.style.left = `${Math.max(8, Math.min(left, box.width - panel.offsetWidth - 8))}px`
    inputs[0].focus()
    inputs[0].select()

    const outside = e => { if (!panel.contains(e.target)) finish(true) }
    setTimeout(() => document.addEventListener('pointerdown', outside, true), 0)
    function finish (commit) {
      if (!editor.clearActive(panel)) return
      document.removeEventListener('pointerdown', outside, true)
      if (commit) flows.forEach((link, i) => commitFlow(app.getDoc().links.find(l => l._uid === link._uid) || link, inputs[i].value))
      panel.remove()
    }
    editor.setActive(panel, finish)
  }

  function editDiagramTitle () {
    const doc = app.getDoc()
    const el = canvas.content.querySelector('text.diagram-title') || canvas.content.querySelector('text.title-placeholder')
    if (!doc || !el) return
    const before = getSetting(doc, 'title')
    inlineInput({
      rect: el.getBoundingClientRect(),
      px: Math.max(10, getSetting(doc, 'titleFontSize') * getSetting(doc, 'scaleCanvas') * canvas.transform.k),
      family: fontStack(getSetting(doc, 'font')),
      color: getSetting(doc, 'titleColor'),
      value: before,
      placeholder: 'Diagram title',
      label: 'Diagram title',
      onCommit: v => { if (v !== before) app.setSetting('title', v, false) }
    })
  }

  return {
    editTitle,
    editDiagramTitle,
    editValue,
    close,
    get open () { return editor.isOpen }
  }
}
