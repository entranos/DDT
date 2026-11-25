// Waterfall editor: its model, canvas and actions, on the shared editor shell.

import { createEditor } from '../../shared/src/editor.js'
import * as commands from './model/commands.js'
import { emptyDocument, getSetting, SETTINGS_BY_KEY, isVisible, iconRows } from './model/schema.js'
import { buildModel } from './model/steps.js'
import { validateDocument, sortIssues } from './model/validate.js'
import { unknownIcons } from '../../shared/src/icons.js'
import { createCanvas } from './render/canvas.js'
import { attachInteractions } from './render/interactions.js'
import { formatAmount, formatChange, formatPercent } from './render/waterfall.js'
import { readDocument, writeDocument } from './io/formats.js'
import { starterDocument, templateWorkbook } from './io/template.js'
import { buildSvg, buildPng } from './export/image.js'
import { createInspector } from './ui/inspector.js'
import { palette } from './ui/palette.js'
import { createOutline } from './ui/outline.js'
import { waterfallGridKinds } from './ui/gridConfig.js'
import { createLabelEditor } from './ui/labelEditor.js'
import { openHelpDialog, openAboutDialog, renderEmptyState } from './ui/dialogs.js'
import { MOD } from '../../shared/src/fileDialogs.js'
import { h } from '../../shared/src/dom.js'

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`

const app = createEditor({
  id: 'waterfall-editor',
  name: 'Waterfall editor',
  selection: { diagram: 'diagrams', moment: 'moments', carrier: 'carriers', value: 'values' },
  prefs: {},
  hint: `Drag a step up or down, or click its number to type · Click a year or name to edit it · Scroll to pan, ${MOD} + scroll to zoom`,
  noIssuesText: 'No issues: every row has a diagram, a carrier and usable amounts.',
  model: {
    emptyDocument,
    getSetting,
    SETTINGS_BY_KEY,
    commands,
    validate: validateDocument,
    sortIssues,
    describe: doc => `${plural(doc.diagrams.length, 'diagram', 'diagrams')}, ${plural(doc.moments.length, 'moment', 'moments')}, ${plural(doc.carriers.length, 'carrier', 'carriers')}`
  },
  io: { readDocument, writeDocument, starterDocument, templateWorkbook, templateName: 'waterfall_template.xlsx', exampleUrl: 'data/waterfall_example_file.xlsx', exampleName: 'example.xlsx' },
  images: { buildSvg, buildPng },
  views: { createCanvas, createInspector, createOutline, gridKinds: waterfallGridKinds },
  dialogs: { openHelp: openHelpDialog, openAbout: openAboutDialog, renderStart: renderEmptyState },
  palette,
  render,
  onLoad,
  onKey
})
app.model = null
app.amountPreview = null
app.active = null // the step or part of a total last clicked
window.waterfallEditor = app // handy for debugging in the console

const { canvas, scheduleRender } = app
const labelEditor = createLabelEditor(app.host, app, canvas)
app.host.addEventListener('zoomchange', () => labelEditor.close(true)) // the editor box would no longer line up with its text

function onLoad () {
  labelEditor.close(false)
  app.model = null
  app.amountPreview = null
  app.active = null
}

function render (doc, f) {
  const p = app.amountPreview
  if (f.doc || f.preview || !app.model) app.model = buildModel(p ? commands.setAmount(doc, p.diagram, p.carrier, p.moment, p.amount) : doc)
  if (f.doc) app.ensureIcons(iconRows(doc))
  const result = canvas.render({ doc: app.withPreviews(doc), model: app.model, selection: app.selection, issueMarks: app.issueMarks('value'), frozen: p ? p.frozen : null })
  return f.doc ? drawingIssues(doc, result) : []
}

// Notes about the drawing itself, next to the data checks.
function drawingIssues (doc, result) {
  const issues = unknownIcons(iconRows(doc)).map(r => ({ key: `icon-${r._uid}`, severity: 'warning', message: `The icon "${r.icon}" of carrier "${r.title || r.id}" is not a known icon.`, targets: [{ kind: 'carrier', uid: r._uid }] }))
  if (result.columns && result.columns.overflow) issues.push({ key: 'too-wide', severity: 'warning', message: 'The columns don’t fit the width of the canvas. Make it wider, or show only carriers that change (Steps).', targets: [], fix: { label: 'Only changing carriers', action: 'onlyChanging' } })
  else if (!result.fits) issues.push({ key: 'scale-fit', severity: 'warning', message: `At ${getSetting(doc, 'pxPerUnit')} pixels per unit the diagram is higher than the canvas. Use fewer pixels per unit or a higher canvas.`, targets: [], fix: { label: 'Fill the canvas', action: 'fillCanvas' } })
  return issues
}

app.diagramName = row => row.title || (app.getDoc() && app.getDoc().diagrams.length > 1 ? `Diagram ${app.getDoc().diagrams.indexOf(row) + 1 || row.id}` : 'Diagram')

// ---------------------------------------------------------------- amounts

// item: a step or a part of a total on the canvas. Both are one carrier's amount in one
// diagram at one moment (for a step: the later one).
const target = item => ({ diagram: item.diagram.id, carrier: item.carrier.id, moment: item.period === undefined ? item.moment.id : item.to.id })

app.setActive = item => { app.active = item ? target(item) : null }

// Drags snap to round numbers about a screen pixel apart; fine: ten times finer.
app.snapAmount = (value, perUnit, fine) => {
  const raw = canvas.screenPx(1) / perUnit
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = (raw / mag <= 1 ? 1 : raw / mag <= 2 ? 2 : raw / mag <= 5 ? 5 : 10) * mag / (fine ? 10 : 1)
  return Math.round(Math.round(value / step) * step * 1e9) / 1e9
}

// amount: as shown (after unit conversion).
app.previewAmount = (item, amount, frozen) => {
  if (!item) {
    app.amountPreview = null
    scheduleRender({ doc: true })
    return
  }
  app.amountPreview = { ...target(item), amount: amount / app.model.multiply, frozen }
  scheduleRender({ preview: true })
}

app.commitAmount = (item, amount) => {
  app.amountPreview = null
  const t = target(item)
  const done = app.edit(item.period === undefined ? 'Change amount' : 'Change step', d => commands.setAmount(d, t.diagram, t.carrier, t.moment, amount / (getSetting(d, 'multiply') || 1)))
  if (!done) scheduleRender({ doc: true })
  else {
    const uids = app.getDoc().values.filter(v => v.diagram === t.diagram && v.carrier === t.carrier).map(v => v._uid)
    app.setSelection({ values: uids })
  }
}

app.amountText = (item, amount) => {
  const doc = app.getDoc()
  const name = item.carrier.title
  if (item.period === undefined) return `${name}, ${item.moment.title}: ${formatAmount(doc, amount)}`
  return `${name}, ${item.to.title}: ${formatAmount(doc, amount)} (${formatChange(doc, amount - item.step.before) || '±0'})`
}

// ---------------------------------------------------------------- selection and view

app.valuesInRect = m => {
  const x0 = Math.min(m.x0, m.x1); const x1 = Math.max(m.x0, m.x1)
  const y0 = Math.min(m.y0, m.y1); const y1 = Math.max(m.y0, m.y1)
  const res = canvas.result
  return [...new Set([...res.segments, ...res.bars.filter(b => b.node)].filter(t => t.box.x0 < x1 && t.box.x1 > x0 && t.box.y0 < y1 && t.box.y1 > y0).flatMap(t => t.uids))]
}

app.reveal = uids => {
  const res = canvas.result
  if (!res || !res.vertical) return
  const set = new Set(uids)
  canvas.reveal([
    ...[...res.segments, ...res.bars].filter(x => x.uids.some(u => set.has(u)) || set.has(x.carrier.uid)).map(x => x.box),
    ...res.totals.filter(t => set.has(t.moment.uid) || set.has(t.diagram.uid)).map(t => t.box)
  ])
}

const hideTooltipBox = app.hideTooltip
app.hideTooltip = () => { hideTooltipBox(); canvas.setHover(null) }
app.hoverCarrier = uid => { hideTooltipBox(); canvas.setHover(uid) }

const noteOf = uids => [...new Set(app.getDoc().values.filter(v => uids.includes(v._uid) && v.note).map(v => String(v.note)))].join('\n')
const tipHead = carrier => h('div', { class: 'tt-head' }, h('span', { class: 'dot', style: { background: carrier.color } }), h('strong', { text: carrier.title }))
const diagramLine = (item, rest) => h('div', { class: 'tt-route', text: [item.diagram.title, rest].filter(Boolean).join(' · ') })

app.showStepTooltip = (bar, x, y) => {
  const doc = app.getDoc()
  if (!bar || !doc) return app.hideTooltip()
  canvas.setHover(bar.carrier.uid)
  const { before, after, change } = bar.step
  const note = noteOf(bar.uids)
  app.showTooltip([
    diagramLine(bar, `${bar.from.title} → ${bar.to.title}`),
    tipHead(bar.carrier),
    h('div', { class: 'tt-amount' }, h('strong', { text: formatChange(doc, change, { unit: true }) || 'No change' }), before > 0 && change ? h('span', { class: 'muted', text: formatPercent(change / before) }) : null),
    h('div', { class: 'tt-route', text: `${formatAmount(doc, before, { unit: false })} → ${formatAmount(doc, after)}` }),
    note ? h('div', { class: 'tt-note', text: note }) : null
  ], x, y)
}

app.showSegmentTooltip = (seg, x, y) => {
  const doc = app.getDoc()
  if (!seg || !doc) return app.hideTooltip()
  canvas.setHover(seg.carrier.uid)
  const note = noteOf(seg.uids)
  app.showTooltip([
    diagramLine(seg, seg.moment.title),
    tipHead(seg.carrier),
    h('div', { class: 'tt-amount' }, h('strong', { text: formatAmount(doc, seg.value) }), seg.total > 0 ? h('span', { class: 'muted', text: `${Math.round(seg.value / seg.total * 100)}% of ${formatAmount(doc, seg.total)}` }) : null),
    note ? h('div', { class: 'tt-note', text: note }) : null
  ], x, y)
}

app.showHeadTooltip = (uid, x, y) => {
  const c = app.model && app.model.carriers.find(k => k.uid === uid)
  if (!c) return app.hideTooltip()
  canvas.setHover(uid)
  app.showTooltip([tipHead(c)], x, y)
}

// ---------------------------------------------------------------- texts and numbers in place

app.editDiagramTitle = () => labelEditor.editDiagramTitle()
app.editSubtitle = () => { app.hideTooltip(); labelEditor.editSubtitle() }
app.editMomentTitle = (uid, row) => { app.hideTooltip(); labelEditor.editMomentTitle(uid, row) }
app.editDiagramText = (uid, part) => { app.hideTooltip(); labelEditor.editDiagramText(uid, part) }
app.editChange = key => { app.hideTooltip(); labelEditor.editChange(key) }
app.editLegendTitle = uid => {
  app.hideTooltip()
  if (!labelEditor.editLegendTitle(uid)) { app.showInspector(); app.focusInspector('Title') }
}

// Double-clicking a part of a total: its cell in the Data tab, ready to type.
app.editAmountCell = item => {
  const uid = item.uids[0]
  if (!uid) return
  app.setSelection({ values: [uid] })
  app.editCell('values', uid, item.moment.id)
}

app.editValueCell = uid => {
  const m = app.getDoc().moments[0]
  app.setSelection({ values: [uid] })
  app.editCell('values', uid, m ? m.id : 'carrier')
}

app.editCarrierIcon = uid => {
  app.hideTooltip()
  app.setSelection({ carriers: [uid] })
  app.showInspector()
  requestAnimationFrame(() => requestAnimationFrame(() => app.inspector.openIconPicker()))
}

// ---------------------------------------------------------------- editing

const NOUNS = { diagrams: ['diagram', 'diagrams'], moments: ['moment', 'moments'], carriers: ['carrier', 'carriers'] }

app.deleteItems = ({ diagrams = [], moments = [], carriers = [], values = [] }) => {
  const doc = app.getDoc()
  if (!doc) return
  const ids = (key, uids) => new Set(doc[key].filter(x => uids.includes(x._uid)).map(x => x.id))
  const d = ids('diagrams', diagrams)
  const c = ids('carriers', carriers)
  const n = doc.values.filter(v => values.includes(v._uid) || d.has(v.diagram) || c.has(v.carrier)).length
  const parts = [...Object.entries({ diagrams, moments, carriers }).filter(([, list]) => list.length).map(([k, list]) => plural(list.length, ...NOUNS[k])), n && plural(n, 'row of values', 'rows of values')].filter(Boolean)
  if (!parts.length) return
  if (app.edit(`Delete ${parts.join(', ')}`, x => commands.deleteItems(x, { diagrams, moments, carriers, values }))) {
    app.setSelection({})
    app.reportDeleted(parts.join(' and '))
  }
}

app.toggleVisible = uid => {
  const doc = app.getDoc()
  const d = doc.diagrams.find(x => x._uid === uid)
  const m = doc.moments.find(x => x._uid === uid)
  const row = d || m
  if (!row) return
  const show = !isVisible(row)
  app.edit(`${show ? 'Show' : 'Hide'} ${d ? 'diagram' : 'moment'}`, x => (d ? commands.updateDiagram(x, uid, { visible: show }) : commands.updateMoment(x, uid, { visible: show })))
}

app.showDiagrams = uids => app.edit(uids.length > 1 ? 'Show both diagrams' : 'Show one diagram', d => commands.showDiagrams(d, uids))

// Rows of zeros, so a new diagram or carrier is ready to fill in the Data table.
const blankAmounts = doc => Object.fromEntries(doc.moments.map(m => [m.id, 0]))

// A second diagram starts with the same carriers as the first, all at zero.
app.addDiagram = ({ focus = true } = {}) => {
  if (!app.loaded) return null
  let added = null
  app.edit('Add diagram', d => {
    const id = commands.uniqueId(d.diagrams.map(x => x.id), 'diagram')
    let next = commands.addDiagram(d, { id, title: `Diagram ${d.diagrams.length + 1}` })
    added = next.diagrams[next.diagrams.length - 1]
    const used = new Set(d.values.map(v => v.carrier))
    d.carriers.filter(c => used.has(c.id)).forEach(c => { next = commands.addValue(next, { diagram: id, carrier: c.id, ...blankAmounts(d) }) })
    return next
  })
  if (!added) return null
  app.setSelection({ diagrams: [added._uid] })
  if (focus) { app.showInspector(); app.focusInspector('Title') }
  return added._uid
}

app.addMoment = ({ focus = true } = {}) => {
  if (!app.loaded) return null
  let added = null
  app.edit('Add moment', d => {
    const next = commands.addMoment(d)
    added = next.moments[next.moments.length - 1]
    return next
  })
  if (!added) return null
  app.setSelection({ moments: [added._uid] })
  if (focus) { app.showInspector(); app.focusInspector('Title') }
  return added._uid
}

// ---- columns of the values table: the moments

// Adds one at the end, or beside another. Returns its key.
app.addMomentColumn = (nearKey, after) => {
  const doc = app.getDoc()
  if (!doc) return null
  const near = nearKey && doc.moments.find(m => m.id === nearKey)
  const before = new Set(doc.moments.map(m => m._uid))
  let added = null
  app.edit('Add column', d => {
    const next = near ? commands.insertMoment(d, near._uid, after) : commands.addMoment(d)
    added = next.moments.find(m => !before.has(m._uid))
    return next
  })
  if (!added) return null
  app.setSelection({ moments: [added._uid] })
  return added.id
}

// Renames a moment, unless that name is taken. Returns whether it has the name now.
app.renameMoment = (uid, name) => {
  const doc = app.getDoc()
  const m = doc.moments.find(x => x._uid === uid)
  const title = String(name).trim()
  if (!m || !title || title === (m.title || m.id)) return false
  if (commands.momentNameTaken(doc, uid, title)) { app.toast(`There is already a column “${title}”.`); return false }
  return app.edit('Rename moment', d => commands.renameMoment(d, uid, title))
}

app.renameMomentColumn = (key, name) => {
  const m = app.getDoc().moments.find(x => x.id === key)
  if (!m || !app.renameMoment(m._uid, name)) return null
  return app.getDoc().moments.find(x => x._uid === m._uid).id
}

app.deleteColumn = (kind, key) => {
  const doc = app.getDoc()
  const m = kind === 'values' && doc.moments.find(x => x.id === key)
  const label = m ? m.title || m.id : key
  if (app.edit(`Delete column ${label}`, d => (m ? commands.deleteItems(d, { moments: [m._uid] }) : commands.deleteColumn(d, kind, key)))) app.reportDeleted(`column ${label}`)
}

app.addCarrier = ({ focus = true } = {}) => {
  if (!app.loaded) return null
  let added = null
  app.edit('Add carrier', d => {
    const id = commands.uniqueId(d.carriers.map(c => c.id), 'carrier')
    let next = commands.addCarrier(d, { id, title: id === 'carrier' ? 'New carrier' : `New carrier ${id.slice('carrier_'.length)}` })
    added = next.carriers[next.carriers.length - 1]
    d.diagrams.forEach(x => { next = commands.addValue(next, { diagram: x.id, carrier: id, ...blankAmounts(d) }) })
    return next
  })
  if (!added) return null
  app.setSelection({ carriers: [added._uid] })
  if (focus) { app.showInspector(); app.focusInspector('Title') }
  return added._uid
}

// A new row in the values table: the first carrier the active diagram doesn't have yet.
app.addEmptyValues = ({ focus = false } = {}) => {
  const doc = app.getDoc()
  if (!doc) return null
  const [uid] = app.selection.values
  const current = uid && doc.values.find(v => v._uid === uid)
  const [dUid] = app.selection.diagrams
  const diagram = (dUid && doc.diagrams.find(d => d._uid === dUid)) || (current && doc.diagrams.find(d => d.id === current.diagram)) || doc.diagrams.find(isVisible) || doc.diagrams[0]
  if (!diagram) return app.addDiagram({ focus })
  const used = new Set(doc.values.filter(v => v.diagram === diagram.id).map(v => v.carrier))
  const free = doc.carriers.find(c => !used.has(c.id))
  let added = null
  app.edit('Add values', d => {
    const next = commands.addValue(d, { diagram: diagram.id, carrier: free ? free.id : '', ...blankAmounts(d) })
    added = next.values[next.values.length - 1]
    return next
  })
  if (!added) return null
  app.setSelection({ values: [added._uid] })
  if (focus) app.editValueCell(added._uid)
  return added._uid
}

app.dropText = ({ uid, after }) => `${after ? 'After' : 'Before'} ${app.model.carriers.find(c => c.uid === uid).title}`
app.moveCarrier = (uid, targetUid, after) => app.edit('Move carrier', d => commands.moveCarrier(d, uid, targetUid, after))

app.stepRow = (kind, uid, dir) => {
  const doc = app.getDoc()
  app.edit(`Move ${NOUNS[kind][0]}`, d => commands.stepRow(d, kind, uid, dir, doc[kind].map(x => x._uid)))
}

// Switch from filling the canvas to a fixed scale, at the size shown now.
app.keepScale = () => {
  const per = canvas.result && canvas.result.perUnit
  if (!per) return
  const value = Number(per.toPrecision(4))
  app.edit('Keep this scale', d => commands.setSetting(commands.setSetting(d, 'pxPerUnit', value), 'scaleMode', 'fixed'))
  app.setStatus(`Drawn at ${value} pixels per unit`)
}

app.runFix = action => {
  const doc = app.getDoc()
  if (action === 'addMissing') app.edit('Add what is missing', d => commands.addMissing(d))
  else if (action === 'fillCanvas') app.setSetting('scaleMode', 'fit', false)
  else if (action === 'onlyChanging') app.setSetting('columns', 'changing', false)
  else if (action === 'purgeEmptyDiagrams') {
    const used = new Set(doc.values.map(v => v.diagram))
    app.deleteItems({ diagrams: doc.diagrams.filter(d => isVisible(d) && !used.has(d.id)).map(d => d._uid) })
  } else if (action === 'purgeUnusedCarriers') {
    const used = new Set(doc.values.map(v => v.carrier))
    app.deleteItems({ carriers: doc.carriers.filter(c => !used.has(c.id)).map(c => c._uid) })
  }
}

// ---------------------------------------------------------------- keyboard

function onKey (e, { mod, key }) {
  if (mod && key === 'a') { app.setSelection({ values: app.getDoc().values.map(v => v._uid) }); return true }
  const step = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[e.key]
  const kind = step && ['carriers', 'moments', 'diagrams'].find(k => app.selection[k].size === 1)
  if (!kind) return false
  app.stepRow(kind, [...app.selection[kind]][0], step)
  return true
}

// ---------------------------------------------------------------- start

attachInteractions(canvas, app)
app.start()
