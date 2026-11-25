// Sankey editor: its model, canvas and actions, on the shared editor shell.

import { createEditor } from '../../shared/src/editor.js'
import * as commands from './model/commands.js'
import { emptyDocument, getSetting, SETTINGS_BY_KEY, iconRows } from './model/schema.js'
import { unknownIcons } from '../../shared/src/icons.js'
import { nextStandardColor } from '../../shared/src/standardPalette.js'
import { validateDocument, sortIssues } from './model/validate.js'
import { formatValue } from '../../shared/src/format.js'
import { computeLayout } from './render/layout.js'
import { createCanvas } from './render/canvas.js'
import { attachInteractions } from './render/interactions.js'
import { layoutIssues } from './render/layoutIssues.js'
import { readDocument, writeDocument } from './io/formats.js'
import { starterDocument, templateWorkbook } from './io/template.js'
import { buildSvg, buildPng } from './export/image.js'
import { createInspector } from './ui/inspector.js'
import { palette } from './ui/palette.js'
import { createOutline } from './ui/outline.js'
import { sankeyGridKinds } from './ui/gridConfig.js'
import { createLabelEditor } from './ui/labelEditor.js'
import { openNodeDetails } from './ui/nodeDetails.js'
import { openHelpDialog, openAboutDialog, renderEmptyState } from './ui/dialogs.js'
import { MOD } from '../../shared/src/fileDialogs.js'
import { h } from '../../shared/src/dom.js'


const app = createEditor({
  id: 'sankey-editor',
  name: 'Sankey editor',
  selection: { node: 'nodes', link: 'links', carrier: 'carriers' },
  prefs: { snap: true, gridSize: 20 },
  hint: `Drag a node’s round handle onto another node to add a flow (hold Shift to add a new node) · Double-click empty space to add a node · Scroll to pan, ${MOD} + scroll to zoom`,
  noIssuesText: 'No issues: every flow connects two nodes, every node with flows is in balance.',
  model: {
    emptyDocument,
    getSetting,
    SETTINGS_BY_KEY,
    commands,
    validate: validateDocument,
    sortIssues,
    describe: doc => `${doc.nodes.length} nodes, ${doc.links.length} flows, ${doc.carriers.length} carriers`
  },
  io: { readDocument, writeDocument, starterDocument, templateWorkbook, templateName: 'sankey_template.xlsx', exampleUrl: 'data/fluxdata_example_file.xlsx', exampleName: 'example.xlsx' },
  images: { buildSvg, buildPng },
  views: { createCanvas, createInspector, createOutline, gridKinds: sankeyGridKinds },
  dialogs: { openHelp: openHelpDialog, openAbout: openAboutDialog, renderStart: renderEmptyState },
  palette,
  render,
  onLoad,
  onKey
})
app.layout = null
app.preview = null
app.lastCarrier = null
app.iconPreview = null
window.sankeyEditor = app // handy for debugging in the console

const { canvas, scheduleRender } = app
const labelEditor = createLabelEditor(app.host, app, canvas)
app.host.addEventListener('zoomchange', () => labelEditor.close(true)) // the editor box would no longer line up with its label

function onLoad () {
  labelEditor.close(false)
  app.preview = null
  app.iconPreview = null
  app.layout = null
}

function render (doc, f) {
  if (f.doc || f.preview || !app.layout) app.layout = computeLayout(doc, app.preview)
  if (f.doc) app.ensureIcons(iconRows(doc))
  const result = canvas.render({ doc: app.withPreviews(doc), layout: app.layout, selection: app.selection, issueMarks: app.issueMarks('node'), gridSize: app.prefs.gridSize, iconPreview: app.iconPreview })
  if (!f.doc) return []
  const iconIssues = unknownIcons(iconRows(doc)).map(r => {
    const carrier = doc.carriers.includes(r)
    return { key: `icon-${r._uid}`, severity: 'warning', message: `The icon "${r.icon}" of ${carrier ? `carrier "${r.id}"` : `the flow from "${r.source}" to "${r.target}"`} is not a known icon.`, targets: [{ kind: carrier ? 'carrier' : 'link', uid: r._uid }] }
  })
  return [...layoutIssues(doc, app.layout, result.labelBoxes), ...iconIssues]
}

// ---------------------------------------------------------------- selection and view

app.snap = () => ({ enabled: !!app.prefs.snap, size: Number(app.prefs.gridSize) || 20 })

// A canvas point rounded to whole pixels, and to the grid when snapping is on.
app.snapPoint = p => {
  const { enabled, size } = app.snap()
  const snap = v => Math.round(enabled ? Math.round(v / size) * size : v)
  return { x: snap(p.x), y: snap(p.y) }
}

app.reveal = uids => {
  const doc = app.getDoc()
  if (!doc) return
  const nodeUids = []
  uids.forEach(u => {
    if (doc.nodes.some(n => n._uid === u)) nodeUids.push(u)
    const l = doc.links.find(x => x._uid === u)
    if (l) doc.nodes.forEach(n => { if (n.id === l.source || n.id === l.target) nodeUids.push(n._uid) })
  })
  canvas.reveal(nodeUids)
}

app.nodesInRect = m => {
  const x0 = Math.min(m.x0, m.x1); const x1 = Math.max(m.x0, m.x1)
  const y0 = Math.min(m.y0, m.y1); const y1 = Math.max(m.y0, m.y1)
  const w = getSetting(app.getDoc(), 'nodeWidth')
  return app.layout.nodes.filter(n => {
    const height = n.value > 0 ? n.dy : 14
    return n.x0 - 4 < x1 && n.x0 - 4 + w > x0 && n.y0 < y1 && n.y0 + height > y0
  }).map(n => n.uid)
}

app.handlePosition = uid => canvas.handlePosition(uid)
app.showIssuesFor = uid => app.showIssuesOf('nodes', uid)
app.openNodeDetails = uid => openNodeDetails(app, uid)
app.editLabel = (uid, part) => (part === 'value' ? labelEditor.editValue(uid) : labelEditor.editTitle(uid))
app.editDiagramTitle = () => labelEditor.editDiagramTitle()

const hideTooltipBox = app.hideTooltip
app.hideTooltip = () => { hideTooltipBox(); canvas.setHoverLink(null) }

app.showLinkTooltip = (uid, x, y) => {
  const doc = app.getDoc()
  const l = doc && doc.links.find(k => k._uid === uid)
  if (!l) return app.hideTooltip()
  canvas.setHoverLink(uid)
  const names = new Map(doc.nodes.map(n => [n.id, n.title || n.id]))
  const color = (doc.carriers.find(c => c.id === l.carrier) || {}).color || '#000'
  const layoutLink = app.layout.linkByUid.get(uid)
  const shown = layoutLink ? layoutLink.value : l.value
  app.showTooltip([
    h('div', { class: 'tt-head' }, h('span', { class: 'dot', style: { background: color } }), h('strong', { text: formatValue(shown, getSetting(doc, 'decimalsRoundValues'), getSetting(doc, 'unit')) }), h('span', { class: 'muted', text: l.carrier || '' })),
    h('div', { class: 'tt-route', text: `${names.get(l.source) || l.source} → ${names.get(l.target) || l.target}` }),
    l.annotate ? h('div', { class: 'tt-note', text: String(l.annotate) }) : null
  ], x, y)
}

// ---------------------------------------------------------------- editing

app.deleteItems = ({ nodes = [], links = [], carriers = [] }) => {
  const doc = app.getDoc()
  if (!doc) return
  const nodeIds = new Set(doc.nodes.filter(n => nodes.includes(n._uid)).map(n => n.id))
  const flowsWithNodes = doc.links.filter(l => !links.includes(l._uid) && (nodeIds.has(l.source) || nodeIds.has(l.target))).length
  const parts = [nodes.length && `${nodes.length} node${nodes.length > 1 ? 's' : ''}`, (links.length + flowsWithNodes) && `${links.length + flowsWithNodes} flow${links.length + flowsWithNodes > 1 ? 's' : ''}`, carriers.length && `${carriers.length} carrier${carriers.length > 1 ? 's' : ''}`].filter(Boolean)
  if (!parts.length) return
  if (app.edit(`Delete ${parts.join(', ')}`, d => commands.deleteItems(d, { nodes, links, carriers }))) {
    app.setSelection({})
    app.reportDeleted(parts.join(' and '))
  }
}

// Returns the new node's uid. focus: false leaves the keyboard where it is (the data grid).
app.addNodeAt = (point, { focus = true } = {}) => {
  if (!app.loaded) return null
  const p = app.snapPoint(point || app.viewCenter())
  const doc = app.getDoc()
  const id = commands.uniqueId(doc.nodes.map(n => n.id), 'new_node')
  let added = null
  app.edit('Add node', d => {
    const next = commands.addNode(d, { id, title: 'New node', x: p.x, y: p.y, direction: 'right', labelposition: 'right' })
    added = next.nodes[next.nodes.length - 1]
    return next
  })
  if (!added) return null
  app.setSelection({ nodes: [added._uid] })
  if (focus) app.focusInspector('Title')
  return added._uid
}

// A blank flow row for the data grid; returns its uid.
app.addEmptyFlow = () => {
  let added = null
  app.edit('Add flow', d => {
    const carrier = app.lastCarrier || (d.carriers[0] && d.carriers[0].id) || ''
    const next = commands.addLink(d, { source: '', target: '', value: 0, carrier })
    added = next.links[next.links.length - 1]
    return next
  })
  return added ? added._uid : null
}

app.addFlowFromSelection = () => {
  const nodes = [...app.selection.nodes]
  if (nodes.length === 2) app.createFlow(nodes[0], nodes[1])
  else app.toast('To add a flow, drag the round handle next to a node onto another node, or select two nodes and click + again.')
}

function defaultCarrier (doc) {
  return app.lastCarrier && doc.carriers.some(c => c.id === app.lastCarrier) ? app.lastCarrier : (doc.carriers[0] && doc.carriers[0].id) || ''
}

app.createFlow = (sourceUid, targetUid) => {
  const doc = app.getDoc()
  const s = doc.nodes.find(n => n._uid === sourceUid)
  const t = doc.nodes.find(n => n._uid === targetUid)
  if (!s || !t || s === t) return
  const carrier = defaultCarrier(doc)
  let added = null
  app.edit('Add flow', d => {
    const next = commands.addLink(d, { source: s.id, target: t.id, value: 1, carrier })
    added = next.links[next.links.length - 1]
    return next
  })
  if (added) {
    app.setSelection({ links: [added._uid] })
    app.log(`Added a flow from "${s.title || s.id}" to "${t.title || t.id}".`)
    app.focusInspector('Value')
  }
}

// Shift + drag from a handle onto empty canvas: a new node at that point, with
// the flow routed to it. One undo step; the flow's value is ready to type.
app.createFlowToNewNode = (sourceUid, point) => {
  const doc = app.getDoc()
  const s = doc.nodes.find(n => n._uid === sourceUid)
  if (!s) return
  const id = commands.uniqueId(doc.nodes.map(n => n.id), 'new_node')
  let added = null
  app.edit('Add node and flow', d => {
    let next = commands.addNode(d, { id, title: 'New node', x: point.x, y: point.y, direction: s.direction || 'right', labelposition: 'right' })
    next = commands.addLink(next, { source: s.id, target: id, value: 1, carrier: defaultCarrier(d) })
    added = next.links[next.links.length - 1]
    return next
  })
  if (added) {
    app.setSelection({ links: [added._uid] })
    app.log(`Added node "${id}" with a flow from "${s.title || s.id}".`)
    app.focusInspector('Value')
  }
}

// Double-clicking a flow: its value cell in the Data tab, ready to type.
app.editFlowValue = uid => {
  app.setSelection({ links: [uid] })
  app.editCell('links', uid, 'value')
}

app.addCarrier = ({ focus = true } = {}) => {
  if (!app.loaded) return null
  const doc = app.getDoc()
  const color = nextStandardColor(doc.carriers.map(c => c.color))
  const id = commands.uniqueId(doc.carriers.map(c => c.id), 'carrier')
  let added = null
  app.edit('Add carrier', d => {
    const next = commands.addCarrier(d, { id, color })
    added = next.carriers[next.carriers.length - 1]
    return next
  })
  if (!added) return null
  app.setSelection({ carriers: [added._uid] })
  if (focus) app.focusInspector('ID')
  return added._uid
}

app.previewMove = positions => {
  app.preview = positions
  scheduleRender({ preview: true })
}

app.commitMove = positions => {
  app.preview = null
  const moves = [...positions].map(([uid, p]) => ({ uid, x: p.x, y: p.y }))
  if (!app.edit(moves.length > 1 ? `Move ${moves.length} nodes` : 'Move node', d => commands.moveNodes(d, moves))) scheduleRender({ doc: true })
}

// Icons on flows. Choosing one turns icons on when they were off.
app.setIcon = (kind, uids, value) => {
  const label = kind === 'carriers' ? 'Change carrier icon' : 'Change flow icon'
  app.edit(label, d => {
    const next = uids.reduce((acc, u) => (kind === 'carriers' ? commands.updateCarrier(acc, u, { icon: value }) : commands.updateLink(acc, u, { icon: value })), d)
    return next !== d && value && value !== 'none' && getSetting(d, 'flowIcons') === 'none' ? commands.setSetting(next, 'flowIcons', 'chosen') : next
  })
}

app.previewIcon = preview => {
  app.iconPreview = preview
  scheduleRender({ canvas: true })
}

app.commitIconPosition = (uid, t) => {
  app.iconPreview = null
  if (!app.edit('Move icon', d => commands.updateLink(d, uid, { iconposition: Math.round(t * 100) }))) scheduleRender({ canvas: true })
}

// Double-clicking an icon: the flow's icon picker. Choosing for the carrier instead is one click away.
app.editFlowIcon = uid => {
  app.setSelection({ links: [uid] })
  app.openIconPicker()
}

app.editCarrierIcon = uid => {
  app.setSelection({ carriers: [uid] })
  app.openIconPicker()
}

app.openIconPicker = () => {
  app.hideTooltip()
  app.showInspector()
  requestAnimationFrame(() => requestAnimationFrame(() => app.inspector.openIconPicker()))
}

app.runFix = action => {
  const doc = app.getDoc()
  if (action === 'purgeUnusedNodes') {
    app.deleteItems({ nodes: commands.unusedNodeUids(doc) })
  } else if (action === 'purgeUnusedCarriers') {
    app.deleteItems({ carriers: commands.unusedCarrierUids(doc) })
  } else if (action === 'roundPositions') {
    app.edit('Round node positions', d => commands.moveNodes(d, d.nodes
      .filter(n => Number.isFinite(n.x) && Number.isFinite(n.y))
      .map(n => ({ uid: n._uid, x: Math.round(n.x), y: Math.round(n.y) }))))
  } else if (action === 'bringIntoView') {
    const sc = getSetting(doc, 'scaleCanvas')
    const w = getSetting(doc, 'canvasWidth') / sc
    const hgt = getSetting(doc, 'canvasHeight') / sc
    const moves = app.layout.nodes.filter(n => n.value > 0).map(n => ({
      uid: n.uid,
      x: Math.round(Math.min(Math.max(n.x0, 20), Math.max(20, w - 80))),
      y: Math.round(Math.min(Math.max(n.y0, 20), Math.max(20, hgt - n.dy - 20)))
    })).filter(m => { const n = app.layout.nodeByUid.get(m.uid); return m.x !== n.x0 || m.y !== n.y0 })
    if (app.edit(`Move ${moves.length} node(s) inside the canvas`, d => commands.moveNodes(d, moves))) {
      app.offerUndo(`Moved ${moves.length} node${moves.length > 1 ? 's' : ''} inside the canvas.`)
    }
  }
}

// ---------------------------------------------------------------- keyboard

function onKey (e, { mod, key }) {
  if (mod && key === 'a') { app.setSelection({ nodes: app.getDoc().nodes.map(n => n._uid) }); return true }
  const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }
  if (arrows[e.key] && app.selection.nodes.size) {
    const step = e.shiftKey ? 10 : 1
    const [dx, dy] = arrows[e.key]
    const sel = app.selection.nodes
    app.edit('Nudge nodes', d => commands.moveNodes(d, d.nodes.filter(n => sel.has(n._uid)).map(n => ({ uid: n._uid, x: Math.round((Number(n.x) || 0) + dx * step), y: Math.round((Number(n.y) || 0) + dy * step) }))), { coalesce: 'nudge' })
    return true
  }
  return false
}

// ---------------------------------------------------------------- start

attachInteractions(canvas, app)
app.start()
