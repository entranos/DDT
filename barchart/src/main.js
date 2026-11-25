// Bar chart editor: its model, canvas and actions, on the shared editor shell.

import { createEditor } from '../../shared/src/editor.js'
import * as commands from './model/commands.js'
import { emptyDocument, getSetting, SETTINGS_BY_KEY, isVisible, isFiniteNumber, iconRows } from './model/schema.js'
import { buildModel, amountForShare } from './model/chart.js'
import { validateDocument, sortIssues } from './model/validate.js'
import { unknownIcons } from '../../shared/src/icons.js'
import { createCanvas } from './render/canvas.js'
import { attachInteractions } from './render/interactions.js'
import { formatAmount, formatShare } from './render/chart.js'
import { readDocument, writeDocument } from './io/formats.js'
import { starterDocument, templateWorkbook } from './io/template.js'
import { buildSvg, buildPng } from './export/image.js'
import { createInspector } from './ui/inspector.js'
import { palette } from './ui/palette.js'
import { createOutline } from './ui/outline.js'
import { barchartGridKinds } from './ui/gridConfig.js'
import { createLabelEditor } from './ui/labelEditor.js'
import { openHelpDialog, openAboutDialog, renderEmptyState } from './ui/dialogs.js'
import { MOD } from '../../shared/src/fileDialogs.js'
import { h } from '../../shared/src/dom.js'

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`

const app = createEditor({
  id: 'barchart-editor',
  name: 'Bar chart editor',
  selection: { bar: 'bars', series: 'series' },
  prefs: {},
  hint: `Drag a part of a bar to change it, or click its number to type · Drag a name to reorder · Scroll to pan, ${MOD} + scroll to zoom`,
  noIssuesText: 'No issues: every bar has a name and usable amounts.',
  model: {
    emptyDocument,
    getSetting,
    SETTINGS_BY_KEY,
    commands,
    validate: validateDocument,
    sortIssues,
    describe: doc => `${plural(doc.bars.length, 'bar', 'bars')}, ${doc.series.length} series`
  },
  io: { readDocument, writeDocument, starterDocument, templateWorkbook, templateName: 'barchart_template.xlsx', exampleUrl: 'data/barchart_example_file.xlsx', exampleName: 'example.xlsx' },
  images: { buildSvg, buildPng },
  views: { createCanvas, createInspector, createOutline, gridKinds: barchartGridKinds },
  dialogs: { openHelp: openHelpDialog, openAbout: openAboutDialog, renderStart: renderEmptyState },
  palette,
  render,
  onLoad,
  onKey
})
app.model = null
app.amountPreview = null
app.cell = null // the part of a bar last clicked: { bar, series } (uids)
window.barchartEditor = app // handy for debugging in the console

const { canvas, scheduleRender } = app
const labelEditor = createLabelEditor(app.host, app, canvas)
app.host.addEventListener('zoomchange', () => labelEditor.close(true)) // the editor box would no longer line up with its text

// Selecting a bar shows all of it; with a cell, that part.
const setSelection = app.setSelection
app.setSelection = (sel = {}, cell = null) => {
  app.cell = cell
  setSelection(sel)
}

function onLoad () {
  labelEditor.close(false)
  app.model = null
  app.amountPreview = null
  app.cell = null
}

function render (doc, f) {
  const p = app.amountPreview
  if (f.doc || f.preview || !app.model) app.model = p ? buildModel(commands.setValue(doc, p.bar, p.series, p.amount), { keepOrder: p.order }) : buildModel(doc)
  if (f.doc) app.ensureIcons(iconRows(doc))
  const result = canvas.render({ doc: app.withPreviews(doc), model: app.model, selection: app.selection, cell: app.cell, issueMarks: app.issueMarks('bar'), frozen: p ? p.frozen : null })
  return f.doc ? drawingIssues(doc, result) : []
}

// Notes about the drawing itself, next to the data checks.
function drawingIssues (doc, result) {
  const issues = unknownIcons(iconRows(doc)).map(r => {
    const series = doc.series.includes(r)
    const uid = r._uid
    return { key: `icon-${uid}-${r.part || ''}`, severity: 'warning', message: `The icon "${r.icon}" of ${series ? 'series' : r.part ? 'the part' : 'bar'} "${r.title || r.id}" is not a known icon.`, targets: [{ kind: series ? 'series' : 'bar', uid }] }
  })
  if (!result.fits && app.model.bars.length) {
    const fixed = getSetting(doc, 'scaleMode') === 'fixed' && getSetting(doc, 'mode') !== 'share'
    issues.push(fixed
      ? { key: 'scale-fit', severity: 'warning', message: `At ${getSetting(doc, 'pxPerUnit')} pixels per unit the chart doesn’t fit the canvas. Use fewer pixels per unit or a larger canvas.`, targets: [], fix: { label: 'Fill the canvas', action: 'fillCanvas' } }
      : { key: 'no-room', severity: 'warning', message: 'There is no room for the bars beside their names and labels. Make the canvas larger.', targets: [] })
  }
  return issues
}

// ---------------------------------------------------------------- amounts

// Drags snap to round numbers about a screen pixel apart; fine: ten times finer.
const snapAmount = (value, perUnit, fine) => {
  const raw = canvas.screenPx(1) / perUnit
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = (raw / mag <= 1 ? 1 : raw / mag <= 2 ? 2 : raw / mag <= 5 ? 5 : 10) * mag / (fine ? 10 : 1)
  return Math.round(Math.round(value / step) * step * 1e9) / 1e9
}

// item: a drawn part. by: how far it was dragged along the axis, in the axis' units.
app.draggedAmount = (item, by, per, fine) => {
  const { part } = item
  if (app.model.mode !== 'share') return snapAmount(part.amount + by, per, fine)
  const bar = item.bar
  if (!(bar.whole > 0)) return part.amount
  const sign = part.amount < 0 ? -1 : 1
  return sign * Math.max(0, snapAmount(amountForShare(bar, part, part.share + by * sign), per / bar.whole, fine))
}

// amount: as shown (after unit conversion).
app.previewAmount = (item, amount, frozen) => {
  if (!item) {
    app.amountPreview = null
    scheduleRender({ doc: true })
    return
  }
  const order = app.amountPreview ? app.amountPreview.order : app.model.bars.map(b => b.uid)
  app.amountPreview = { bar: item.uid, series: item.part.series.id, amount: amount / app.model.multiply, frozen, order }
  scheduleRender({ preview: true })
}

app.commitAmount = (item, amount) => {
  app.amountPreview = null
  const done = app.edit('Change amount', d => commands.setValue(d, item.uid, item.part.series.id, amount / (getSetting(d, 'multiply') || 1)))
  if (!done) scheduleRender({ doc: true })
}

// Another total: all amounts of the bar in proportion, or the only one.
app.commitTotal = (uid, total) => {
  const bar = app.model.barByUid.get(uid)
  if (!bar) return
  const parts = bar.parts.filter(p => !p.empty)
  const multiply = app.model.multiply
  if (bar.parts.length === 1) app.edit('Change amount', d => commands.setValue(d, uid, bar.parts[0].series.id, total / multiply))
  else if (!parts.length || Math.abs(bar.total) < 1e-12) app.toast('This bar has no amounts yet to scale. Type them in the Data table.')
  else app.edit('Change total', d => parts.reduce((acc, p) => commands.setValue(acc, uid, p.series.id, p.amount * (total / bar.total) / multiply), d))
}

app.amountText = (item, amount) => {
  const doc = app.getDoc()
  const part = app.model.partByKey.get(item.key)
  return `${item.bar.title ? `${item.bar.title}, ` : ''}${item.part.series.title}: ${formatAmount(doc, amount)}${app.model.mode === 'share' && part ? ` (${formatShare(part.share)})` : ''}`
}

app.partInfo = (barUid, seriesUid) => {
  const p = app.model && app.model.partByKey.get(`${barUid}|${seriesUid}`)
  return p ? { share: p.share, total: app.model.barByUid.get(barUid).total } : null
}

// ---------------------------------------------------------------- selection and view

app.barsInRect = m => {
  const x0 = Math.min(m.x0, m.x1); const x1 = Math.max(m.x0, m.x1)
  const y0 = Math.min(m.y0, m.y1); const y1 = Math.max(m.y0, m.y1)
  const touches = b => b && b.x0 < x1 && b.x1 > x0 && b.y0 < y1 && b.y1 > y0
  return canvas.result.bars.filter(b => touches(b.box) || touches(b.nameBox)).map(b => b.uid)
}

app.reveal = uids => {
  const res = canvas.result
  if (!res) return
  const set = new Set(uids)
  canvas.reveal([
    ...res.bars.filter(b => set.has(b.uid)).flatMap(b => [b.box, b.nameBox].filter(Boolean)),
    ...res.parts.filter(p => set.has(p.part.series.uid) && !p.part.empty).map(p => p.box)
  ])
}

const hideTooltipBox = app.hideTooltip
app.hideTooltip = () => { hideTooltipBox(); canvas.setHover(null) }
app.hoverSeries = uid => { hideTooltipBox(); canvas.setHover(uid) }

const place = bar => h('div', { class: 'tt-route', text: [bar.group, bar.title].filter(Boolean).join(' · ') })
const noteOf = bar => (bar.note ? h('div', { class: 'tt-note', text: String(bar.note) }) : null)

app.showPartTooltip = (item, x, y) => {
  const doc = app.getDoc()
  if (!item || !doc) return app.hideTooltip()
  const { part, bar } = item
  canvas.setHover(part.series.uid)
  app.showTooltip([
    place(bar),
    app.model.single ? null : h('div', { class: 'tt-head' }, h('span', { class: 'dot', style: { background: part.color } }), h('strong', { text: part.series.title })),
    h('div', { class: 'tt-amount' }, h('strong', { text: formatAmount(doc, part.amount) }), app.model.single ? null : h('span', { class: 'muted', text: `${formatShare(part.share)} of ${formatAmount(doc, bar.total)}` })),
    noteOf(bar)
  ], x, y)
}

app.showBarTooltip = (uid, x, y) => {
  const doc = app.getDoc()
  const bar = app.model && app.model.barByUid.get(uid)
  if (!bar || !doc) return app.hideTooltip()
  canvas.setHover(null)
  app.showTooltip([
    place(bar),
    h('div', { class: 'tt-amount' }, h('strong', { text: formatAmount(doc, bar.total) })),
    ...(app.model.single ? [] : bar.parts.filter(p => !p.empty).map(p => h('div', { class: 'tt-head' }, h('span', { class: 'dot', style: { background: p.color } }), h('span', { text: `${p.series.title} ${formatAmount(doc, p.amount, { unit: false })}` })))),
    noteOf(bar)
  ], x, y)
}

// ---------------------------------------------------------------- texts and numbers in place

app.editDiagramTitle = () => labelEditor.editDiagramTitle()
app.editSubtitle = () => { app.hideTooltip(); labelEditor.editSubtitle() }
app.editAxisTitle = () => { app.hideTooltip(); labelEditor.editAxisTitle() }
app.editBarName = uid => { app.hideTooltip(); labelEditor.editBarName(uid) }
app.editGroup = name => { app.hideTooltip(); labelEditor.editGroup(name) }
app.editAmount = (item, kind) => { app.hideTooltip(); labelEditor.editAmount(item, kind) }
app.editTotal = uid => { app.hideTooltip(); labelEditor.editTotal(uid) }
app.editLegendTitle = uid => {
  app.hideTooltip()
  if (!labelEditor.editLegendTitle(uid)) { app.showInspector(); app.focusInspector('Title') }
}

// Double-clicking a part: its cell in the Data tab, ready to type.
app.editAmountCell = item => {
  app.setSelection({ bars: [item.uid] }, { bar: item.uid, series: item.part.series.uid })
  app.editCell('bars', item.uid, item.part.series.id)
}

app.editBarCell = uid => {
  const s = app.getDoc().series.find(x => isVisible(x) && x.id)
  app.setSelection({ bars: [uid] })
  app.editCell('bars', uid, s ? s.id : 'title')
}

app.editBarIcon = uid => {
  app.hideTooltip()
  app.setSelection({ bars: [uid] })
  app.showInspector()
  requestAnimationFrame(() => requestAnimationFrame(() => app.inspector.openIconPicker()))
}

// ---------------------------------------------------------------- editing

app.deleteItems = ({ bars = [], series = [] }) => {
  const doc = app.getDoc()
  if (!doc) return
  const parts = [bars.length && plural(bars.length, 'bar', 'bars'), series.length && `${series.length} series`].filter(Boolean)
  if (!parts.length) return
  if (app.edit(`Delete ${parts.join(', ')}`, x => commands.deleteItems(x, { bars, series }))) {
    app.setSelection({})
    app.reportDeleted(parts.join(' and '))
  }
}

app.toggleVisible = uid => {
  const doc = app.getDoc()
  const bar = doc.bars.find(x => x._uid === uid)
  const series = doc.series.find(x => x._uid === uid)
  const row = bar || series
  if (!row) return
  const show = !isVisible(row)
  app.edit(`${show ? 'Show' : 'Hide'} ${bar ? 'bar' : 'series'}`, x => (bar ? commands.updateBar(x, uid, { visible: show }) : commands.updateSeries(x, uid, { visible: show })))
}

// A new bar starts at the middle of the others, so there is something to drag.
app.addBar = ({ focus = true } = {}) => {
  if (!app.loaded) return null
  let added = null
  app.edit('Add bar', d => {
    const start = {}
    d.series.filter(s => s.id).forEach(s => {
      const list = d.bars.filter(isVisible).map(b => b[s.id]).filter(isFiniteNumber)
      const mean = list.length ? list.reduce((a, b) => a + b, 0) / list.length : 0
      start[s.id] = mean ? Number(mean.toPrecision(2)) : 0
    })
    const base = d.series.length ? d : commands.addSeries(d, {})
    if (!d.series.length) start[base.series[0].id] = 10
    const next = commands.addBar(base, start)
    added = next.bars[next.bars.length - 1]
    return next
  })
  if (!added) return null
  app.setSelection({ bars: [added._uid] })
  if (focus) requestAnimationFrame(() => requestAnimationFrame(() => { if (canvas.barOf(added._uid)) labelEditor.editBarName(added._uid) }))
  return added._uid
}

app.addSeries = ({ focus = true } = {}) => {
  if (!app.loaded) return null
  let added = null
  app.edit('Add series', d => {
    const next = commands.addSeries(d)
    added = next.series[next.series.length - 1]
    return added ? next.bars.reduce((acc, b) => commands.updateBar(acc, b._uid, { [added.id]: 0 }), next) : next
  })
  if (!added) return null
  app.setSelection({ series: [added._uid] })
  if (focus) { app.showInspector(); app.focusInspector('Title') }
  return added._uid
}

// ---- columns of the bars table: the series

// Adds one at the end, or beside another. Returns its key.
app.addSeriesColumn = (nearKey, after) => {
  const doc = app.getDoc()
  if (!doc) return null
  const at = nearKey ? doc.series.findIndex(s => s.id === nearKey) : -1
  let added = null
  app.edit('Add column', d => {
    const before = new Set(d.series.map(s => s._uid))
    const next = commands.addSeries(d, {}, at < 0 ? d.series.length : at + (after ? 1 : 0))
    added = next.series.find(s => !before.has(s._uid))
    return next.bars.reduce((acc, b) => commands.updateBar(acc, b._uid, { [added.id]: 0 }), next)
  })
  if (!added) return null
  app.setSelection({ series: [added._uid] })
  return added.id
}

// Renames a series, unless that name is taken. Returns whether it has the name now.
app.renameSeries = (uid, name) => {
  const doc = app.getDoc()
  const s = doc.series.find(x => x._uid === uid)
  const title = String(name).trim()
  if (!s || !title || title === (s.title || s.id)) return false
  if (commands.seriesNameTaken(doc, uid, title)) { app.toast(`There is already a series “${title}”.`); return false }
  return app.edit('Rename series', d => commands.renameSeries(d, uid, title))
}

app.renameSeriesColumn = (key, name) => {
  const s = app.getDoc().series.find(x => x.id === key)
  if (!s || !app.renameSeries(s._uid, name)) return null
  return app.getDoc().series.find(x => x._uid === s._uid).id
}

app.deleteColumn = (kind, key) => {
  const doc = app.getDoc()
  const s = kind === 'bars' && doc.series.find(x => x.id === key)
  const label = s ? s.title || s.id : key
  if (app.edit(`Delete column ${label}`, d => (s ? commands.deleteItems(d, { series: [s._uid] }) : commands.deleteColumn(d, kind, key)))) app.reportDeleted(`column ${label}`)
}

app.dropText = (uid, target) => {
  if (!target) return 'Drag onto another bar to move it there'
  const doc = app.getDoc()
  const bar = doc.bars.find(b => b._uid === uid)
  const to = doc.bars.find(b => b._uid === target.uid)
  const group = (to.group || '') !== (bar.group || '') ? ` in ${to.group || 'no group'}` : ''
  return getSetting(doc, 'order') === 'listed' ? `${target.after ? 'After' : 'Before'} ${to.title || '(no name)'}${group}` : group ? `Move to ${to.group || 'no group'}` : 'Bars are ordered by size'
}

app.moveBar = (uid, targetUid, after) => {
  if (app.edit('Move bar', d => commands.moveBar(d, uid, targetUid, after)) && getSetting(app.getDoc(), 'order') !== 'listed') app.toast('Bars are drawn by size. Choose “As listed” under Order to use your own order.')
}

// One step earlier or later in the order they are listed.
app.stepRow = (kind, uid, dir) => {
  const doc = app.getDoc()
  const uids = kind === 'bars' && app.model.barByUid.has(uid) ? app.model.groups.flatMap(g => g.bars.map(b => b.uid)) : doc[kind].map(x => x._uid)
  app.edit(`Move ${kind === 'bars' ? 'bar' : 'series'}`, d => commands.stepRow(d, kind, uid, dir, uids))
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
  if (action === 'fillCanvas') app.setSetting('scaleMode', 'fit', false)
  else if (action === 'purgeEmptySeries') {
    const blank = v => v === undefined || v === null || String(v).trim() === ''
    app.deleteItems({ series: doc.series.filter(s => s.id && isVisible(s) && doc.bars.every(b => blank(b[s.id]))).map(s => s._uid) })
  }
}

// ---------------------------------------------------------------- keyboard

function onKey (e, { mod, key }) {
  if (mod && key === 'a') { app.setSelection({ bars: app.getDoc().bars.map(b => b._uid) }); return true }
  const step = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[e.key]
  const kind = step && ['series', 'bars'].find(k => app.selection[k].size === 1)
  if (!kind) return false
  app.stepRow(kind, [...app.selection[kind]][0], step)
  return true
}

// ---------------------------------------------------------------- start

attachInteractions(canvas, app)
app.start()
