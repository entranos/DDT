// Chord editor: its model, canvas and actions, on the shared editor shell.

import { createEditor } from '../../shared/src/editor.js'
import * as commands from './model/commands.js'
import { emptyDocument, getSetting, SETTINGS_BY_KEY, isVisible, isFiniteNumber, shownScenario, iconRows } from './model/schema.js'
import { buildModel, untangle } from './model/chords.js'
import { validateDocument, sortIssues } from './model/validate.js'
import { unknownIcons } from '../../shared/src/icons.js'
import { createCanvas } from './render/canvas.js'
import { attachInteractions } from './render/interactions.js'
import { formatAmount, formatShare } from './render/chord.js'
import { polar } from './render/layout.js'
import { readDocument, writeDocument } from './io/formats.js'
import { starterDocument, templateWorkbook } from './io/template.js'
import { buildSvg, buildPng } from './export/image.js'
import { createInspector } from './ui/inspector.js'
import { palette } from './ui/palette.js'
import { createOutline } from './ui/outline.js'
import { chordGridKinds } from './ui/gridConfig.js'
import { createLabelEditor } from './ui/labelEditor.js'
import { openHelpDialog, openAboutDialog, renderEmptyState } from './ui/dialogs.js'
import { MOD } from '../../shared/src/fileDialogs.js'
import { h } from '../../shared/src/dom.js'

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`

const app = createEditor({
  id: 'chord-editor',
  name: 'Chord editor',
  selection: { flow: 'flows', node: 'nodes', group: 'groups', carrier: 'carriers', scenario: 'scenarios', detail: 'details' },
  prefs: {},
  hint: `Drag the handle outside a node onto another one to add a flow · Drag an arc to reorder · Scroll to pan, ${MOD} + scroll to zoom`,
  noIssuesText: 'No issues: every flow has its nodes, a carrier and usable amounts.',
  model: {
    emptyDocument,
    getSetting,
    SETTINGS_BY_KEY,
    commands,
    validate: validateDocument,
    sortIssues,
    describe: doc => `${plural(doc.nodes.length, 'node', 'nodes')}, ${plural(doc.flows.length, 'flow', 'flows')}, ${plural(doc.scenarios.length, 'scenario', 'scenarios')}`
  },
  io: { readDocument, writeDocument, starterDocument, templateWorkbook, templateName: 'chord_template.xlsx', exampleUrl: 'data/chord_example_file.xlsx', exampleName: 'example.xlsx' },
  images: { buildSvg, buildPng },
  views: { createCanvas, createInspector, createOutline, gridKinds: chordGridKinds },
  dialogs: { openHelp: openHelpDialog, openAbout: openAboutDialog, renderStart: renderEmptyState },
  palette,
  render,
  onLoad,
  onKey
})
app.model = null
app.labelPreview = null
app.lastCarrier = null
window.chordEditor = app // handy for debugging in the console

const { canvas, scheduleRender } = app
const labelEditor = createLabelEditor(app.host, app, canvas)
app.host.addEventListener('zoomchange', () => labelEditor.close(true)) // the editor box would no longer line up with its text

function onLoad () {
  labelEditor.close(false)
  app.model = null
  app.labelPreview = null
  app.lastCarrier = null
}

function render (doc, f) {
  if (f.doc || f.preview || !app.model) app.model = buildModel(doc)
  if (f.doc) app.ensureIcons(iconRows(doc))
  const result = canvas.render({ doc: app.withPreviews(doc), model: app.model, selection: app.selection, issueMarks: app.issueMarks('flow'), labelPreview: app.labelPreview })
  return f.doc ? drawingIssues(doc, result) : []
}

// Notes about the drawing itself, next to the data checks.
function drawingIssues (doc, result) {
  const issues = unknownIcons(iconRows(doc)).map(r => {
    const kind = doc.nodes.includes(r) ? 'node' : doc.carriers.includes(r) ? 'carrier' : 'flow'
    return { key: `icon-${r._uid}`, severity: 'warning', message: `The icon "${r.icon}" of ${kind === 'flow' ? `the flow from "${r.source}" to "${r.target}"` : `${kind} "${r.title || r.id}"`} is not a known icon.`, targets: [{ kind, uid: r._uid }] }
  })
  if (result.r && !result.fits) issues.push({ key: 'no-room', severity: 'warning', message: 'There is hardly room for the circle beside its labels. Make the canvas larger, or the labels narrower.', targets: [] })
  return issues
}

const nodeName = id => { const n = app.getDoc().nodes.find(x => x.id === id); return n ? n.title || n.id : id || '?' }

// ---------------------------------------------------------------- selection and view

// The ribbon made of exactly these rows, if any.
app.ribbonOfAll = uids => {
  const r = app.model && app.model.ribbonByUid.get(uids[0])
  return r && r.uids.length === uids.length && uids.every(u => r.uids.includes(u)) ? r : null
}
app.ribbonInfo = uid => {
  const r = app.model && app.model.ribbonByUid.get(uid)
  return r ? { ribbon: r, total: app.model.total } : null
}

app.nodesInRect = m => {
  const x0 = Math.min(m.x0, m.x1); const x1 = Math.max(m.x0, m.x1)
  const y0 = Math.min(m.y0, m.y1); const y1 = Math.max(m.y0, m.y1)
  return canvas.result.nodes.filter(n => n.label && n.label.box.x0 < x1 && n.label.box.x1 > x0 && n.label.box.y0 < y1 && n.label.box.y1 > y0).map(n => n.uid)
}

app.reveal = uids => {
  const res = canvas.result
  if (!res || !res.r) return
  const set = new Set(uids)
  const around = (a0, a1, r) => { const pts = [a0, (a0 + a1) / 2, a1].map(a => polar(r, a)); const xs = pts.map(p => p[0] + res.cx); const ys = pts.map(p => p[1] + res.cy); return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) } }
  canvas.reveal([
    ...res.nodes.filter(n => set.has(n.uid)).flatMap(n => [around(n.a0, n.a1, n.r1), n.label && n.label.box].filter(Boolean)),
    ...res.groups.filter(g => set.has(g.uid)).map(g => around(g.a0, g.a1, g.r1)),
    ...res.ribbons.filter(x => x.ribbon.uids.some(u => set.has(u)) || set.has(x.ribbon.carrier.uid)).flatMap(x => [around(x.place.s0, x.place.s1, res.r), around(x.place.t0, x.place.t1, res.r)])
  ])
}

const hideTooltipBox = app.hideTooltip
app.hideTooltip = () => { hideTooltipBox(); canvas.setHover(null) }
app.hoverCarrier = uid => { hideTooltipBox(); canvas.setHover({ carrier: uid }) }

const head = (color, text) => h('div', { class: 'tt-head' }, h('span', { class: 'dot', style: { background: color } }), h('strong', { text }))

app.showFlowTooltip = (key, x, y) => {
  const doc = app.getDoc()
  const item = canvas.ribbon(key)
  if (!item || !doc) return app.hideTooltip()
  const r = item.ribbon
  canvas.setHover({ ribbon: key })
  const parts = r.parts.filter(p => p.label)
  const notes = [...new Set(r.parts.map(p => p.note).filter(Boolean).map(String))]
  app.showTooltip([
    h('div', { class: 'tt-route', text: `${nodeName(r.source)} → ${nodeName(r.target)}` }),
    r.carrier.title ? head(r.color, r.carrier.title) : null,
    h('div', { class: 'tt-amount' }, h('strong', { text: formatAmount(doc, r.value) }), h('span', { class: 'muted', text: formatShare(r.value / app.model.total) })),
    ...(parts.length > 1 || (parts.length === 1 && r.parts.length > 1) ? r.parts.slice(0, 12).map(p => h('div', { class: 'tt-route', text: `${p.label || 'Other'}: ${formatAmount(doc, p.value, { unit: false })}` })) : parts.map(p => h('div', { class: 'tt-route', text: p.label }))),
    notes.length ? h('div', { class: 'tt-note', text: notes.join('\n') }) : null
  ], x, y)
}

app.showNodeTooltip = (uid, kind, x, y) => {
  const doc = app.getDoc()
  const item = canvas.nodeOf(uid)
  if (!item || !doc) return app.hideTooltip()
  const n = item.node
  canvas.setHover(n.empty ? null : { node: uid })
  if (kind !== 'node') { hideTooltipBox(); return }
  app.showTooltip([
    h('div', { class: 'tt-head' }, h('span', { class: 'dot', style: { background: n.color } }), h('strong', { text: n.title })),
    n.into > 0 ? h('div', { class: 'tt-route', text: `In ${formatAmount(doc, n.into)}` }) : null,
    n.out > 0 ? h('div', { class: 'tt-route', text: `Out ${formatAmount(doc, n.out)}` }) : null,
    n.empty ? h('div', { class: 'tt-route', text: 'No flows in this scenario' }) : null,
    n.note ? h('div', { class: 'tt-note', text: String(n.note) }) : null
  ], x, y)
}

app.showGroupTooltip = (uid, x, y) => {
  const doc = app.getDoc()
  const item = canvas.groupOf(uid)
  if (!item || !doc) return app.hideTooltip()
  canvas.setHover(null)
  app.showTooltip([
    h('div', { class: 'tt-head' }, h('strong', { text: item.group.title })),
    ...item.group.nodes.map(n => h('div', { class: 'tt-route', text: `${n.title}: ${formatAmount(doc, n.amount)}` }))
  ], x, y)
}

// ---------------------------------------------------------------- labels

app.previewLabel = at => {
  app.labelPreview = at
  scheduleRender({ canvas: true })
}
app.commitLabel = at => {
  app.labelPreview = null
  const same = Math.abs(at.dx) + Math.abs(at.dy) < 1
  if (!app.edit('Move label', d => commands.updateNode(d, at.uid, same ? { labelx: '', labely: '' } : { labelx: at.dx, labely: at.dy }))) scheduleRender({ canvas: true })
}

// ---------------------------------------------------------------- texts in place

app.editDiagramTitle = () => labelEditor.editDiagramTitle()
app.editSubtitle = () => { app.hideTooltip(); labelEditor.editSubtitle() }
app.editNodeTitle = uid => { app.hideTooltip(); labelEditor.editNodeTitle(uid) }
app.editGroupTitle = uid => { app.hideTooltip(); labelEditor.editGroupTitle(uid) }
app.editLegendTitle = uid => {
  app.hideTooltip()
  if (!labelEditor.editLegendTitle(uid)) { app.showInspector(); app.focusInspector('Title') }
}

// Double-clicking a flow: its cell in the Data tab, ready to type.
app.editFlowCell = uid => {
  const s = shownScenario(app.getDoc())
  app.setSelection({ flows: [uid] })
  app.editCell('flows', uid, s ? s.id : 'source')
}

app.editNodeIcon = uid => {
  app.hideTooltip()
  app.setSelection({ nodes: [uid] })
  app.showInspector()
  requestAnimationFrame(() => requestAnimationFrame(() => app.inspector.openIconPicker()))
}

// ---------------------------------------------------------------- editing

const NOUNS = { flows: ['flow', 'flows'], nodes: ['node', 'nodes'], groups: ['group', 'groups'], carriers: ['carrier', 'carriers'], scenarios: ['scenario', 'scenarios'], details: ['detail', 'details'] }

app.deleteItems = sel => {
  const doc = app.getDoc()
  if (!doc) return
  if ((sel.scenarios || []).length >= doc.scenarios.length && (sel.scenarios || []).length) { app.toast('The last scenario can’t be deleted: it holds the amounts.'); return }
  const next = commands.deleteItems(doc, sel)
  if (next === doc) return
  const parts = Object.keys(NOUNS).map(k => [doc[k].length - next[k].length, NOUNS[k]]).filter(([n]) => n > 0).map(([n, noun]) => plural(n, ...noun))
  if (app.edit(`Delete ${parts.join(', ')}`, x => commands.deleteItems(x, sel))) {
    app.setSelection({})
    app.reportDeleted(parts.join(' and '))
  }
}

app.toggleVisible = uid => {
  const doc = app.getDoc()
  const node = doc.nodes.find(x => x._uid === uid)
  const carrier = doc.carriers.find(x => x._uid === uid)
  const row = node || carrier
  if (!row) return
  const show = !isVisible(row)
  app.edit(`${show ? 'Show' : 'Hide'} ${node ? 'node' : 'carrier'}`, x => (node ? commands.updateNode(x, uid, { visible: show }) : commands.updateCarrier(x, uid, { visible: show })))
}

app.addNode = ({ focus = true, group } = {}) => {
  if (!app.loaded) return null
  let added = null
  app.edit('Add node', d => {
    const next = commands.addNode(d, group === undefined ? {} : { group })
    added = next.nodes[next.nodes.length - 1]
    return next
  })
  if (!added) return null
  app.setSelection({ nodes: [added._uid] })
  if (focus) requestAnimationFrame(() => requestAnimationFrame(() => { const n = canvas.nodeOf(added._uid); if (n && n.label && n.label.titleNode) labelEditor.editNodeTitle(added._uid); else { app.showInspector(); app.focusInspector('Title') } }))
  return added._uid
}

app.addGroup = ({ focus = true } = {}) => {
  if (!app.loaded) return null
  let added = null
  // A new group takes the selected nodes.
  const nodes = [...app.selection.nodes]
  app.edit('Add group', d => {
    let next = commands.addGroup(d)
    added = next.groups[next.groups.length - 1]
    nodes.forEach(u => { next = commands.updateNode(next, u, { group: added.id }) })
    return next
  })
  if (!added) return null
  app.setSelection({ groups: [added._uid] })
  if (focus) { app.showInspector(); app.focusInspector('Title') }
  return added._uid
}

app.addCarrier = ({ focus = true } = {}) => {
  if (!app.loaded) return null
  let added = null
  app.edit('Add carrier', d => {
    const next = commands.addCarrier(d)
    added = next.carriers[next.carriers.length - 1]
    return next
  })
  if (!added) return null
  app.setSelection({ carriers: [added._uid] })
  if (focus) { app.showInspector(); app.focusInspector('Title') }
  return added._uid
}

// A new flow starts at a size that can be seen: a part of the middle one.
function startAmount (doc) {
  const s = shownScenario(doc)
  const list = s ? doc.flows.map(f => f[s.id]).filter(v => isFiniteNumber(v) && v > 0).sort((a, b) => a - b) : []
  const middle = list.length ? list[Math.floor(list.length / 2)] : 0
  return middle ? Number(middle.toPrecision(1)) : 10
}

app.createFlow = (sourceUid, targetUid) => {
  const doc = app.getDoc()
  const source = doc.nodes.find(n => n._uid === sourceUid)
  const target = doc.nodes.find(n => n._uid === targetUid)
  if (!source || !target) return
  const used = doc.flows.filter(f => f.source === source.id).map(f => f.carrier)
  let added = null
  app.edit('Add flow', d => {
    const carrier = used[0] || (d.carriers.some(c => c.id === app.lastCarrier) ? app.lastCarrier : '') || (d.carriers[0] || {}).id
    let next = carrier ? d : commands.addCarrier(d, { title: 'Carrier', id: 'carrier' })
    const id = carrier || next.carriers[0].id
    next = commands.addFlow(next, { source: source.id, target: target.id, carrier: id, ...Object.fromEntries(d.scenarios.map(s => [s.id, startAmount(d)])) })
    added = next.flows[next.flows.length - 1]
    return next
  })
  if (!added) return
  app.setSelection({ flows: [added._uid] })
  app.showInspector()
  const s = shownScenario(doc)
  app.focusInspector(doc.scenarios.length > 1 ? s.title || s.id : 'Value')
}

app.addEmptyFlow = ({ focus = false } = {}) => {
  const doc = app.getDoc()
  if (!doc) return null
  let added = null
  app.edit('Add flow', d => {
    const [n] = app.selection.nodes
    const node = n && d.nodes.find(x => x._uid === n)
    const next = commands.addFlow(d, { source: node ? node.id : '', target: '', carrier: app.lastCarrier || (d.carriers[0] || {}).id || '', ...Object.fromEntries(d.scenarios.map(s => [s.id, 0])) })
    added = next.flows[next.flows.length - 1]
    return next
  })
  if (!added) return null
  app.setSelection({ flows: [added._uid] })
  if (focus) app.editCell('flows', added._uid, 'source')
  return added._uid
}

app.addDetail = ({ node, focus = false } = {}) => {
  const doc = app.getDoc()
  if (!doc) return null
  const [uid] = app.selection.nodes
  const at = node || (doc.nodes.find(n => n._uid === uid) || {}).id || ''
  let added = null
  app.edit('Add detail', d => {
    const next = commands.addDetail(d, { node: at, title: '', ...Object.fromEntries(d.scenarios.map(s => [s.id, 0])) })
    added = next.details[next.details.length - 1]
    return next
  })
  if (!added) return null
  app.setSelection({ details: [added._uid] })
  if (focus) { app.showInspector(); app.focusInspector('Title') }
  return added._uid
}

// ---- scenarios: the columns of amounts

app.showScenario = uid => {
  const s = app.getDoc().scenarios.find(x => x._uid === uid)
  if (s && s !== shownScenario(app.getDoc())) app.edit('Show scenario', d => commands.showScenario(d, s.id))
}

app.addScenario = ({ focus = true, near = null, after = true } = {}) => {
  if (!app.loaded) return null
  let added = null
  app.edit('Add scenario', d => {
    const before = new Set(d.scenarios.map(s => s._uid))
    const next = commands.addScenario(d, { near, after })
    added = next.scenarios.find(s => !before.has(s._uid))
    return commands.showScenario(next, added.id)
  })
  if (!added) return null
  app.setSelection({ scenarios: [added._uid] })
  if (focus) { app.showInspector(); app.focusInspector('Title') }
  return added._uid
}

// Adds one at the end, or beside another. Returns its key.
app.addScenarioColumn = (nearKey, after) => {
  const near = nearKey && app.getDoc().scenarios.find(s => s.id === nearKey)
  const uid = app.addScenario({ focus: false, near: near ? near._uid : null, after })
  const s = uid && app.getDoc().scenarios.find(x => x._uid === uid)
  return s ? s.id : null
}

app.renameScenario = (uid, name) => {
  const doc = app.getDoc()
  const s = doc.scenarios.find(x => x._uid === uid)
  const title = String(name).trim()
  if (!s || !title || title === (s.title || s.id)) return false
  if (commands.scenarioNameTaken(doc, uid, title)) { app.toast(`There is already a scenario “${title}”.`); return false }
  return app.edit('Rename scenario', d => commands.renameScenario(d, uid, title))
}

app.renameScenarioColumn = (key, name) => {
  const s = app.getDoc().scenarios.find(x => x.id === key)
  if (!s || !app.renameScenario(s._uid, name)) return null
  return app.getDoc().scenarios.find(x => x._uid === s._uid).id
}

app.deleteColumn = (kind, key) => {
  const doc = app.getDoc()
  const s = ['flows', 'details'].includes(kind) && doc.scenarios.find(x => x.id === key)
  if (s) { app.deleteItems({ scenarios: [s._uid] }); return }
  if (app.edit(`Delete column ${key}`, d => commands.deleteColumn(d, kind, key))) app.reportDeleted(`column ${key}`)
}

// ---- order

app.dropText = (kind, uid, target) => {
  if (!target) return `Drag along the circle to move this ${kind}`
  const doc = app.getDoc()
  const rows = kind === 'node' ? doc.nodes : doc.groups
  const to = rows.find(r => r._uid === target.uid)
  const own = rows.find(r => r._uid === uid)
  const group = kind === 'node' && (to.group || '') !== (own.group || '') ? ` in ${(doc.groups.find(g => g.id === to.group) || {}).title || to.group || 'no group'}` : ''
  return `${target.after ? 'After' : 'Before'} ${to.title || to.id}${group}`
}
app.moveAround = (kind, uid, targetUid, after) => app.edit(`Move ${kind}`, d => (kind === 'node' ? commands.moveNode(d, uid, targetUid, after) : commands.moveGroup(d, uid, targetUid, after)))

app.stepRow = (kind, uid, dir) => {
  const doc = app.getDoc()
  const drawn = { nodes: () => app.model.nodes.map(n => n.uid), groups: () => app.model.groups.map(g => g.uid).filter(Boolean) }[kind]
  const uids = drawn && drawn().includes(uid) ? drawn() : doc[kind].map(x => x._uid)
  app.edit(`Move ${NOUNS[kind][0]}`, d => commands.stepRow(d, kind, uid, dir, uids))
}

// Reorders for fewer crossings, looking at all scenarios.
app.arrange = withGroups => {
  const doc = app.getDoc()
  const ids = doc.scenarios.map(s => s.id)
  const links = doc.flows.map(f => ({ source: f.source, target: f.target, value: ids.reduce((t, id) => t + (isFiniteNumber(f[id]) && f[id] > 0 ? f[id] : 0), 0) })).filter(l => l.value > 0)
  const groups = app.model.groups
  const result = untangle(groups.map(g => g.nodes.map(n => n.id)), links, { withGroups })
  const uidOf = new Map(app.model.nodes.map(n => [n.id, n.uid]))
  const groupUid = new Map(groups.flatMap(g => g.nodes.map(n => [n.id, g.uid])))
  const done = app.edit('Reorder', d => {
    const next = commands.orderNodes(d, result.flat().map(id => uidOf.get(id)))
    return withGroups ? commands.orderGroups(next, result.map(list => groupUid.get(list[0])).filter(Boolean)) : next
  })
  app.setStatus(done ? 'Reordered for fewer crossings' : 'This order already has the fewest crossings found')
}

// Fix the amount of a full circle, as it is now.
app.keepScale = () => {
  const res = canvas.result
  if (!res || !(res.full > 0)) return
  const value = Number(res.full.toPrecision(6))
  app.edit('Keep this scale', d => commands.setSetting(commands.setSetting(d, 'fullCircle', value), 'scaleMode', 'fixed'))
  app.setStatus(`A full circle is ${formatAmount(app.getDoc(), value)}`)
}

app.runFix = action => {
  const doc = app.getDoc()
  if (action === 'addMissing') app.edit('Add what is missing', d => commands.addMissing(d))
  else if (action === 'fitCircle') app.setSetting('scaleMode', 'largest', false)
  else if (action === 'purgeNodes') { const used = new Set(doc.flows.flatMap(f => [f.source, f.target])); app.deleteItems({ nodes: doc.nodes.filter(n => n.id && !used.has(n.id)).map(n => n._uid) }) } else if (action === 'purgeCarriers') { const used = new Set(doc.flows.map(f => f.carrier)); app.deleteItems({ carriers: doc.carriers.filter(c => c.id && !used.has(c.id)).map(c => c._uid) }) } else if (action === 'purgeGroups') { const used = new Set(doc.nodes.map(n => n.group)); app.deleteItems({ groups: doc.groups.filter(g => g.id && !used.has(g.id)).map(g => g._uid) }) }
}

// ---------------------------------------------------------------- keyboard

function onKey (e, { mod, key }) {
  const doc = app.getDoc()
  if (mod && key === 'a') { app.setSelection({ nodes: doc.nodes.map(n => n._uid) }); return true }
  if (e.key === 'PageDown' || e.key === 'PageUp') {
    const i = doc.scenarios.indexOf(shownScenario(doc)) + (e.key === 'PageDown' ? 1 : -1)
    if (doc.scenarios[i]) app.showScenario(doc.scenarios[i]._uid)
    return true
  }
  const step = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[e.key]
  const kind = step && ['nodes', 'groups', 'carriers', 'scenarios'].find(k => app.selection[k].size === 1)
  if (!kind) return false
  app.stepRow(kind, [...app.selection[kind]][0], step)
  return true
}

// ---------------------------------------------------------------- start

attachInteractions(canvas, app)
app.start()
