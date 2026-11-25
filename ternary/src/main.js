// Ternary editor: its model, canvas and actions, on the shared editor shell.

import { createEditor } from '../../shared/src/editor.js'
import * as commands from './model/commands.js'
import { emptyDocument, getSetting, SETTINGS_BY_KEY, isFiniteNumber, seriesIsVisible } from './model/schema.js'
import { buildModel } from './model/mix.js'
import { validateDocument, sortIssues } from './model/validate.js'
import { formatNumber, formatValue } from '../../shared/src/format.js'
import { createCanvas } from './render/canvas.js'
import { attachInteractions } from './render/interactions.js'
import { clampShares, fromEF, toEF } from './render/geometry.js'
import { readDocument, writeDocument } from './io/formats.js'
import { starterDocument, templateWorkbook } from './io/template.js'
import { buildSvg, buildPng } from './export/image.js'
import { createInspector } from './ui/inspector.js'
import { palette } from './ui/palette.js'
import { createOutline } from './ui/outline.js'
import { ternaryGridKinds } from './ui/gridConfig.js'
import { createLabelEditor } from './ui/labelEditor.js'
import { openHelpDialog, openAboutDialog, renderEmptyState } from './ui/dialogs.js'
import { MOD } from '../../shared/src/fileDialogs.js'
import { h } from '../../shared/src/dom.js'

const CORNER_ORDER = ['left', 'right', 'bottom']
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`

const app = createEditor({
  id: 'ternary-editor',
  name: 'Ternary editor',
  selection: { series: 'series', point: 'points', axis: 'axes' },
  prefs: {},
  hint: `Drag a point to change its mix · Double-click inside the triangle to add a point to the selected series · Scroll to pan, ${MOD} + scroll to zoom`,
  noIssuesText: 'No issues: every point belongs to a series and has three usable values.',
  model: {
    emptyDocument,
    getSetting,
    SETTINGS_BY_KEY,
    commands,
    validate: validateDocument,
    sortIssues,
    describe: doc => `${plural(doc.series.length, 'series', 'series')}, ${plural(doc.points.length, 'point', 'points')}`
  },
  io: { readDocument, writeDocument, starterDocument, templateWorkbook, templateName: 'ternary_template.xlsx', exampleUrl: 'data/ternary_example_file.xlsx', exampleName: 'example.xlsx' },
  images: { buildSvg, buildPng },
  views: { createCanvas, createInspector, createOutline, gridKinds: ternaryGridKinds },
  dialogs: { openHelp: openHelpDialog, openAbout: openAboutDialog, renderStart: renderEmptyState },
  palette,
  render,
  onLoad,
  onKey
})
app.model = null
app.pointPreview = null
window.ternaryEditor = app // handy for debugging in the console

const { canvas, scheduleRender } = app
const labelEditor = createLabelEditor(app.host, app, canvas)
app.host.addEventListener('zoomchange', () => labelEditor.close(true)) // the editor box would no longer line up with its text

function onLoad () {
  labelEditor.close(false)
  app.model = null
  app.pointPreview = null
  canvas.setGuides(null)
}

function render (doc, f) {
  const preview = app.pointPreview
  if (f.doc || f.preview || !app.model) app.model = buildModel(preview ? withPointPreview(doc, preview) : doc)
  canvas.render({ doc: app.withPreviews(doc), model: app.model, selection: app.selection, issueMarks: app.issueMarks('point'), domain: preview ? preview.domain : null })
  const dragged = preview && app.pointInfo(preview.uid)
  if (dragged) canvas.setGuides(dragged.point.shares, dragged.series.color)
  return []
}

// ---------------------------------------------------------------- mixes

app.pointInfo = uid => (app.model ? app.model.pointByUid.get(uid) || null : null)

// A point's shares by corner ID ({ bio: 0.2, … }), or null when it has no usable values.
app.sharesOf = point => {
  const axes = app.getDoc().axes
  const values = axes.map(a => point[a.id])
  if (!axes.length || values.some(v => !isFiniteNumber(v) || v < 0)) return null
  const total = values.reduce((a, b) => a + b, 0)
  return total > 0 ? Object.fromEntries(axes.map((a, i) => [a.id, values[i] / total])) : null
}

// Shares as text, in the order of the corners table. shares: by corner position.
app.shareText = shares => app.getDoc().axes.map(a => `${a.label || a.id} ${formatNumber(shares[a.corner] * 100, 1)}%`).join(' · ')

// Nearest valid mix; whole: rounded to whole percents.
app.clampShares = (shares, whole = false) => {
  const s = clampShares(shares)
  if (!whole) return s
  const right = Math.round(s.right * 100)
  const bottom = Math.min(100 - right, Math.round(s.bottom * 100))
  return { left: (100 - right - bottom) / 100, right: right / 100, bottom: bottom / 100 }
}

// Shares by corner position → by corner ID, as the commands expect them.
const byAxisId = (doc, shares) => Object.fromEntries(doc.axes.map(a => [a.id, shares[a.corner]]))

function withPointPreview (doc, { uid, shares, total }) {
  return commands.setPointShares(doc, uid, byAxisId(doc, shares), total)
}

app.previewPoint = (uid, shares, domain) => {
  const info = uid && app.pointInfo(uid)
  if (!info) {
    app.pointPreview = null
    canvas.setGuides(null)
    scheduleRender({ doc: true })
    return
  }
  app.pointPreview = { uid, shares, domain, total: app.pointPreview ? app.pointPreview.total : info.point.total }
  scheduleRender({ preview: true })
}

app.commitPoint = (uid, shares, total) => {
  app.pointPreview = null
  canvas.setGuides(null)
  if (!app.edit('Move point', d => commands.setPointShares(d, uid, byAxisId(d, shares), total))) scheduleRender({ doc: true })
}

// ---------------------------------------------------------------- selection and view

app.reveal = uids => {
  if (!app.model) return
  const shares = uids.flatMap(u => {
    const p = app.model.pointByUid.get(u)
    if (p) return [p.point.shares]
    const s = app.model.seriesByUid.get(u)
    return s ? s.points.map(x => x.shares) : []
  })
  canvas.reveal(shares)
}

const showTargets = app.showTargets
app.showTargets = targets => {
  showTargets(targets)
  if (targets.some(t => t.kind === 'axis')) {
    app.showInspector()
    requestAnimationFrame(() => requestAnimationFrame(() => app.inspector.showSection('axes')))
  }
}

app.pointsInRect = m => {
  const x0 = Math.min(m.x0, m.x1); const x1 = Math.max(m.x0, m.x1)
  const y0 = Math.min(m.y0, m.y1); const y1 = Math.max(m.y0, m.y1)
  const geo = canvas.result.geometry
  return canvas.result.seriesShown.flatMap(s => s.points).filter(p => {
    const [x, y] = geo.at(p.shares)
    return x >= x0 && x <= x1 && y >= y0 && y <= y1
  }).map(p => p.uid)
}

app.editDiagramTitle = () => labelEditor.editDiagramTitle()
app.editAxisText = (corner, part) => labelEditor.editAxisText(corner, part)

app.editSeriesTitle = uid => {
  app.hideTooltip()
  app.setSelection({ series: [uid] })
  if (labelEditor.editSeriesTitle(uid)) return
  app.showInspector()
  app.focusInspector('Title')
}

// Double-clicking a point: its first value in the Data tab, ready to type.
app.editPointCell = uid => {
  app.setSelection({ points: [uid] })
  const axis = app.getDoc().axes[0]
  app.editCell('points', uid, axis ? axis.id : 'year')
}

const hideTooltipBox = app.hideTooltip
app.hideTooltip = () => {
  hideTooltipBox()
  canvas.setHoverSeries(null)
  if (!app.pointPreview) canvas.setGuides(null)
}

app.showPointTooltip = (uid, x, y) => {
  const info = app.pointInfo(uid)
  const doc = app.getDoc()
  if (!info || !doc) return app.hideTooltip()
  const { series, point } = info
  canvas.setHoverSeries(series.uid)
  canvas.setGuides(point.shares, series.color)
  app.showTooltip([
    h('div', { class: 'tt-head' }, h('span', { class: 'dot', style: { background: series.color } }), h('strong', { text: series.title }), h('span', { class: 'muted', text: point.label })),
    h('div', { class: 'tt-shares' }, doc.axes.map(a => [h('span', { text: a.label || a.id }), h('strong', { text: `${formatNumber(point.shares[a.corner] * 100, 1)}%` })])),
    h('div', { class: 'tt-route', text: `Total ${formatValue(point.total, getSetting(doc, 'decimals'), getSetting(doc, 'unit'))}` })
  ], x, y)
}

app.showSeriesTooltip = (uid, x, y) => {
  const series = app.model && app.model.seriesByUid.get(uid)
  if (!series) return app.hideTooltip()
  canvas.setHoverSeries(uid)
  canvas.setGuides(null)
  const years = series.points.map(p => p.year).filter(isFiniteNumber)
  const span = years.length ? ` · ${Math.min(...years)}–${Math.max(...years)}` : ''
  app.showTooltip([
    h('div', { class: 'tt-head' }, h('span', { class: 'dot', style: { background: series.color } }), h('strong', { text: series.title })),
    h('div', { class: 'tt-route', text: `${series.group ? `${series.group} · ` : ''}${plural(series.points.length, 'point', 'points')}${span}` })
  ], x, y)
}

// ---------------------------------------------------------------- editing

app.deleteItems = ({ series = [], points = [] }) => {
  const doc = app.getDoc()
  if (!doc) return
  const ids = new Set(doc.series.filter(s => series.includes(s._uid)).map(s => s.id))
  const nPoints = doc.points.filter(p => points.includes(p._uid) || ids.has(p.series)).length
  const parts = [series.length && plural(series.length, 'series', 'series'), nPoints && plural(nPoints, 'point', 'points')].filter(Boolean)
  if (!parts.length) return
  if (app.edit(`Delete ${parts.join(', ')}`, d => commands.deleteItems(d, { series, points }))) {
    app.setSelection({})
    app.reportDeleted(parts.join(' and '))
  }
}

app.toggleSeries = uid => {
  const s = app.getDoc().series.find(x => x._uid === uid)
  if (!s) return
  const show = !seriesIsVisible(s)
  app.edit(show ? 'Show series' : 'Hide series', d => commands.updateSeries(d, uid, { visible: show }))
}

const newSeriesRow = doc => {
  const id = commands.uniqueId(doc.series.map(s => s.id), 'new_series')
  return { id, title: id === 'new_series' ? 'New series' : `New series ${id.slice('new_series_'.length)}` }
}

// Returns the new series' uid. focus: false leaves the keyboard where it is (the data grid).
app.addSeries = ({ focus = true } = {}) => {
  if (!app.loaded) return null
  let added = null
  app.edit('Add series', d => {
    const next = commands.addSeries(d, newSeriesRow(d))
    added = next.series[next.series.length - 1]
    return next
  })
  if (!added) return null
  app.setSelection({ series: [added._uid] })
  if (focus) { app.showInspector(); app.focusInspector('Title') }
  return added._uid
}

// The series new points go to: the selected one, or the selected point's.
function activeSeries (doc) {
  const [s] = app.selection.series
  if (s) return doc.series.find(x => x._uid === s) || null
  const [p] = app.selection.points
  const point = p && doc.points.find(x => x._uid === p)
  return (point && doc.series.find(x => x.id === point.series)) || null
}

// The mix and total a series' next point starts from: its last point, or an even split of 100.
function lastMix (seriesId) {
  const s = app.model && app.model.series.find(x => x.id === seriesId)
  const last = s && s.points[s.points.length - 1]
  return last ? { shares: last.shares, total: last.total } : { shares: { left: 0.3, right: 0.4, bottom: 0.3 }, total: 100 }
}

// Adds a point to a series (a new one when none is given). One undo step.
function addPoint (series, shares, { focus = true, label = 'Add point' } = {}) {
  let added = null
  app.edit(series ? label : 'Add series and point', d => {
    let doc = d
    let id = series && series.id
    if (!series) {
      const row = newSeriesRow(d)
      id = row.id
      doc = commands.addSeries(d, row)
    }
    const from = lastMix(id)
    const next = commands.addPoint(doc, { series: id, year: commands.nextYear(doc, id), ...commands.valuesForShares(doc, byAxisId(doc, shares || from.shares), from.total) })
    added = next.points[next.points.length - 1]
    return next
  })
  if (!added) return null
  app.setSelection({ points: [added._uid] })
  app.log(`Added a point for ${added.year} to "${added.series}".`)
  if (focus) { app.showInspector(); app.focusInspector('Year') }
  return added._uid
}

app.activeSeriesUid = () => {
  const s = app.loaded && activeSeries(app.getDoc())
  return s ? s._uid : null
}

// Double-clicking inside the triangle. seriesUid: the series that was selected, if any.
app.addPointAt = (p, seriesUid = null) => {
  const doc = app.getDoc()
  if (!doc || !app.model.complete) return
  const shares = canvas.result.geometry.sharesAt(p.x, p.y)
  const { lo } = canvas.result.domain
  if (CORNER_ORDER.some(c => shares[c] < lo[c] - 0.01)) {
    app.toast('Double-click inside the triangle to add a point.')
    return
  }
  addPoint(doc.series.find(s => s._uid === seriesUid) || null, app.clampShares(shares))
}

app.addPointToSeries = uid => {
  const doc = app.getDoc()
  const s = doc && doc.series.find(x => x._uid === uid)
  if (s) addPoint(s, null)
}

// The + next to Points in the left panel.
app.addPointToSelection = () => {
  const doc = app.getDoc()
  if (doc) addPoint(activeSeries(doc) || (doc.series.length === 1 ? doc.series[0] : null) || doc.series[doc.series.length - 1] || null, null)
}

// A new row in the data grid; returns its uid.
app.addEmptyPoint = () => {
  const doc = app.getDoc()
  if (!doc) return null
  return addPoint(activeSeries(doc) || doc.series[doc.series.length - 1] || null, null, { focus: false })
}

app.runFix = action => {
  const doc = app.getDoc()
  if (action === 'addMissingSeries') app.edit('Add missing series', d => commands.addMissingSeries(d))
  else if (action === 'purgeEmptySeries') {
    const used = new Set(doc.points.map(p => p.series))
    app.deleteItems({ series: doc.series.filter(s => !used.has(s.id)).map(s => s._uid) })
  }
}

// ---------------------------------------------------------------- keyboard

// Arrow keys shift the mix of the selected points: left/right trades the two top
// corners, up/down moves away from or towards the bottom one.
function nudge (dx, dy, step) {
  const sel = app.selection.points
  app.edit(sel.size > 1 ? 'Nudge points' : 'Nudge point', d => {
    const model = buildModel(d)
    return [...sel].reduce((doc, uid) => {
      const info = model.pointByUid.get(uid)
      if (!info) return doc
      const [e, f] = toEF(info.point.shares)
      const moved = app.clampShares(fromEF([e + (dx - dy / 2) * step, f + dy * step]))
      return commands.setPointShares(doc, uid, byAxisId(doc, moved), info.point.total)
    }, d)
  }, { coalesce: 'nudge' })
}

function onKey (e, { mod, key }) {
  if (mod && key === 'a') { app.setSelection({ points: canvas.result.seriesShown.flatMap(s => s.points.map(p => p.uid)) }); return true }
  const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }
  if (arrows[e.key] && app.selection.points.size) {
    nudge(...arrows[e.key], e.shiftKey ? 0.02 : 0.005)
    return true
  }
  return false
}

// ---------------------------------------------------------------- start

attachInteractions(canvas, app)
app.start()
