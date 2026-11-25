// Treemap editor: its model, canvas and actions, on the shared editor shell.

import { createEditor } from '../../shared/src/editor.js'
import * as commands from './model/commands.js'
import { emptyDocument, getSetting, SETTINGS_BY_KEY, isFiniteNumber, blockIsVisible, iconRows } from './model/schema.js'
import { buildModel } from './model/tiles.js'
import { unknownIcons } from '../../shared/src/icons.js'
import { validateDocument, sortIssues } from './model/validate.js'
import { createCanvas } from './render/canvas.js'
import { attachInteractions } from './render/interactions.js'
import { formatAmount, formatShare } from './render/treemap.js'
import { readDocument, writeDocument } from './io/formats.js'
import { starterDocument, templateWorkbook } from './io/template.js'
import { buildSvg, buildPng } from './export/image.js'
import { createInspector } from './ui/inspector.js'
import { palette } from './ui/palette.js'
import { createOutline } from './ui/outline.js'
import { treemapGridKinds } from './ui/gridConfig.js'
import { createLabelEditor } from './ui/labelEditor.js'
import { openHelpDialog, openAboutDialog, renderEmptyState } from './ui/dialogs.js'
import { MOD } from '../../shared/src/fileDialogs.js'
import { h } from '../../shared/src/dom.js'

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`

const app = createEditor({
  id: 'treemap-editor',
  name: 'Treemap editor',
  selection: { block: 'blocks', value: 'values', carrier: 'carriers' },
  prefs: {},
  hint: `Double-click a tile to change its value · Click a block’s + to add one · Drag a block’s header to move it · Scroll to pan, ${MOD} + scroll to zoom`,
  noIssuesText: 'No issues: every value has a block, a carrier and an amount.',
  model: {
    emptyDocument,
    getSetting,
    SETTINGS_BY_KEY,
    commands,
    validate: validateDocument,
    sortIssues,
    describe: doc => `${plural(doc.blocks.length, 'block', 'blocks')}, ${plural(doc.values.length, 'value', 'values')}, ${plural(doc.carriers.length, 'carrier', 'carriers')}`
  },
  io: { readDocument, writeDocument, starterDocument, templateWorkbook, templateName: 'treemap_template.xlsx', exampleUrl: 'data/treemap_example_file.xlsx', exampleName: 'example.xlsx' },
  images: { buildSvg, buildPng },
  views: { createCanvas, createInspector, createOutline, gridKinds: treemapGridKinds },
  dialogs: { openHelp: openHelpDialog, openAbout: openAboutDialog, renderStart: renderEmptyState },
  palette,
  render,
  onLoad,
  onKey
})
app.model = null
window.treemapEditor = app // handy for debugging in the console

const { canvas } = app
const labelEditor = createLabelEditor(app.host, app, canvas)
app.host.addEventListener('zoomchange', () => labelEditor.close(true)) // the editor box would no longer line up with its text

function onLoad () {
  labelEditor.close(false)
  app.model = null
}

function render (doc, f) {
  if (f.doc || !app.model) app.model = buildModel(doc)
  if (f.doc) app.ensureIcons(iconRows(doc))
  const result = canvas.render({ doc: app.withPreviews(doc), model: app.model, selection: app.selection, issueMarks: app.issueMarks('value') })
  return f.doc ? drawingIssues(doc, result) : []
}

// Notes about the drawing itself, next to the data checks.
function drawingIssues (doc, result) {
  const issues = []
  unknownIcons(iconRows(doc)).forEach(r => {
    const kind = doc.blocks.includes(r) ? 'block' : doc.carriers.includes(r) ? 'carrier' : 'value'
    issues.push({ key: `icon-${r._uid}`, severity: 'warning', message: `The icon "${r.icon}" of ${kind} "${kind === 'value' ? `${r.block}, ${r.carrier}` : r.title || r.id}" is not a known icon.`, targets: [{ kind, uid: r._uid }] })
  })
  if (!result.layout) return issues
  const skipped = result.layout.skipped
  if (skipped.length) {
    issues.push({
      key: 'too-small',
      severity: 'info',
      message: `${plural(skipped.length, 'value is', 'values are')} too small to draw at this scale (under 0.5%): ${skipped.slice(0, 4).map(t => `${app.model.blockOfTile.get(t.key).title}, ${t.label}`).join('; ')}${skipped.length > 4 ? '; …' : ''}. Totals include ${skipped.length === 1 ? 'it' : 'them'}.`,
      targets: skipped.flatMap(t => t.uids.map(uid => ({ kind: 'value', uid })))
    })
  }
  if (!result.fits) issues.push({ key: 'scale-fit', severity: 'warning', message: `At ${getSetting(doc, 'areaPerUnit')} px² per unit the diagram is larger than the canvas. Use a smaller area per unit or a larger canvas.`, targets: [], fix: { label: 'Fill the canvas', action: 'fillCanvas' } })
  return issues
}

// ---------------------------------------------------------------- tiles

const drawnTile = uid => canvas.result && canvas.result.tiles.find(t => t.tile.uids.includes(uid))

app.tileUids = uid => { const t = app.model && app.model.tileByUid.get(uid); return t ? t.uids : [uid] }

// The drawn tile a value belongs to: { tile, box, share, block }.
app.tileInfo = uid => {
  const t = drawnTile(uid)
  return t ? { tile: t.tile, box: t.box, share: t.share, block: app.model.blockOfTile.get(t.tile.key) } : null
}

// The tile made of exactly these values, if any.
app.tileOfAll = uids => {
  const t = app.model && app.model.tileByUid.get(uids[0])
  return t && t.uids.length === uids.length && uids.every(u => t.uids.includes(u)) ? t : null
}

app.valuesInRect = m => {
  const x0 = Math.min(m.x0, m.x1); const x1 = Math.max(m.x0, m.x1)
  const y0 = Math.min(m.y0, m.y1); const y1 = Math.max(m.y0, m.y1)
  return canvas.result.tiles.filter(t => t.box.x0 < x1 && t.box.x1 > x0 && t.box.y0 < y1 && t.box.y1 > y0).flatMap(t => t.tile.uids)
}

app.reveal = uids => {
  const res = canvas.result
  if (!res) return
  canvas.reveal(uids.flatMap(u => {
    const t = drawnTile(u)
    const b = res.blocks.find(x => x.uid === u)
    return t ? [t.box] : b ? [b.box] : []
  }))
}

const hideTooltipBox = app.hideTooltip
app.hideTooltip = () => { hideTooltipBox(); canvas.setHover(null) }
app.hoverLegend = uid => { hideTooltipBox(); canvas.setHover(uid) }

app.showTileTooltip = (uid, x, y) => {
  const info = app.tileInfo(uid)
  const doc = app.getDoc()
  if (!info || !doc) return app.hideTooltip()
  const { tile, block, share } = info
  canvas.setHover(tile.highlight)
  const named = tile.parts.filter(p => p.label)
  const notes = [...new Set(tile.parts.map(p => p.note).filter(Boolean).map(String))]
  app.showTooltip([
    h('div', { class: 'tt-route', text: block.title }),
    h('div', { class: 'tt-head' }, h('span', { class: 'dot', style: { background: tile.color } }), h('strong', { text: tile.label })),
    h('div', { class: 'tt-amount' }, h('strong', { text: formatAmount(doc, tile.value) }), h('span', { class: 'muted', text: `${formatShare(share)} of ${formatAmount(doc, block.total)}` })),
    tile.parts.length > 1 && named.length ? h('div', { class: 'tt-shares tt-parts' }, tile.parts.slice(0, 10).map(p => [h('span', { text: p.label || '—' }), h('strong', { text: formatAmount(doc, p.value) })]), tile.parts.length > 10 ? h('span', { class: 'muted', text: `and ${tile.parts.length - 10} more` }) : null) : null,
    notes.length ? h('div', { class: 'tt-note', text: notes.join('\n') }) : null
  ], x, y)
}

// ---------------------------------------------------------------- texts in place

app.editDiagramTitle = () => labelEditor.editDiagramTitle()
app.editGroupName = name => labelEditor.editGroupName(name)
app.editBlockTitle = uid => labelEditor.editBlockTitle(uid)
app.editLegendTitle = uid => {
  app.hideTooltip()
  if (!labelEditor.editLegendTitle(uid)) { app.showInspector(); app.focusInspector('Title') }
}

// Double-clicking a tile: its value in the Data tab, ready to type.
app.editTileValue = uid => {
  const uids = app.tileUids(uid)
  const row = uids.includes(uid) ? uid : uids[0]
  app.setSelection({ values: [row] })
  app.editCell('values', row, 'value')
}

// ---------------------------------------------------------------- editing

app.deleteItems = ({ blocks = [], values = [], carriers = [] }) => {
  const doc = app.getDoc()
  if (!doc) return
  const b = new Set(doc.blocks.filter(x => blocks.includes(x._uid)).map(x => x.id))
  const c = new Set(doc.carriers.filter(x => carriers.includes(x._uid)).map(x => x.id))
  const n = doc.values.filter(v => values.includes(v._uid) || b.has(v.block) || c.has(v.carrier)).length
  const parts = [blocks.length && plural(blocks.length, 'block', 'blocks'), carriers.length && plural(carriers.length, 'carrier', 'carriers'), n && plural(n, 'value', 'values')].filter(Boolean)
  if (!parts.length) return
  if (app.edit(`Delete ${parts.join(', ')}`, d => commands.deleteItems(d, { blocks, values, carriers }))) {
    app.setSelection({})
    app.reportDeleted(parts.join(' and '))
  }
}

app.toggleBlock = uid => {
  const b = app.getDoc().blocks.find(x => x._uid === uid)
  if (!b) return
  const show = !blockIsVisible(b)
  app.edit(show ? 'Show block' : 'Hide block', d => commands.updateBlock(d, uid, { visible: show }))
}

// Reordering by drag. target: { uid, after }
app.dropText = ({ uid, after }) => {
  const b = app.model.blockByUid.get(uid)
  const sorted = getSetting(app.getDoc(), 'order') === 'size'
  return sorted ? `Into the group of ${b.title} (order is by size)` : `${after ? 'After' : 'Before'} ${b.title}`
}

app.moveBlock = (uid, targetUid, after) => {
  app.edit(app.model.perBlock ? 'Move block' : 'Move carrier', d => (app.model.perBlock ? commands.moveBlock(d, uid, targetUid, after) : commands.moveCarrier(d, uid, targetUid, after)))
}

const newBlockRow = doc => {
  const id = commands.uniqueId(doc.blocks.map(b => b.id), 'new_block')
  return { id, title: id === 'new_block' ? 'New block' : `New block ${id.slice('new_block_'.length)}` }
}

// A new block with one value, so there is something to see. Returns the block's uid.
app.addBlock = ({ focus = true } = {}) => {
  if (!app.loaded) return null
  let added = null
  app.edit('Add block', d => {
    let next = commands.addBlock(d, newBlockRow(d))
    added = next.blocks[next.blocks.length - 1]
    if (focus) {
      const carrier = next.carriers[0] || (next = commands.addCarrier(next, { id: 'carrier', title: 'Carrier' })).carriers[0]
      const totals = app.model ? app.model.blocks.map(b => b.total) : []
      const multiply = getSetting(d, 'multiply') || 1
      const value = totals.length ? Math.max(1, Math.round(totals.reduce((a, b) => a + b, 0) / totals.length / 2 / multiply)) : 100
      next = commands.addValue(next, { block: added.id, carrier: carrier.id, value })
    }
    return next
  })
  if (!added) return null
  app.setSelection({ blocks: [added._uid] })
  if (focus) { app.showInspector(); app.focusInspector('Title') }
  return added._uid
}

// Adds a value to a block (or, in the per-carrier view, to a carrier): the first
// counterpart it doesn't have yet. Its amount is ready to type.
app.addValueTo = (uid, { focus = true } = {}) => {
  const doc = app.getDoc()
  if (!doc) return null
  const block = doc.blocks.find(b => b._uid === uid)
  const carrier = doc.carriers.find(c => c._uid === uid)
  if (!block && !carrier) return null
  const own = block ? doc.values.filter(v => v.block === block.id) : doc.values.filter(v => v.carrier === carrier.id)
  const multiplied = own.filter(v => isFiniteNumber(v.value)).reduce((s, v) => s + v.value, 0)
  const value = multiplied > 0 ? Math.max(1, Math.round(multiplied * 0.1)) : 100
  let added = null
  app.edit('Add value', d => {
    let next = d
    let blockId = block && block.id
    let carrierId = carrier && carrier.id
    if (block) {
      const used = new Set(own.map(v => v.carrier))
      const free = d.carriers.find(c => !used.has(c.id))
      if (free) carrierId = free.id
      else {
        carrierId = commands.uniqueId(d.carriers.map(c => c.id), 'carrier')
        next = commands.addCarrier(next, { id: carrierId, title: `Carrier ${d.carriers.length + 1}` })
      }
    } else {
      const used = new Set(own.map(v => v.block))
      const free = d.blocks.find(b => !used.has(b.id) && blockIsVisible(b))
      if (free) blockId = free.id
      else {
        const row = newBlockRow(d)
        blockId = row.id
        next = commands.addBlock(next, row)
      }
    }
    next = commands.addValue(next, { block: blockId, carrier: carrierId, value })
    added = next.values[next.values.length - 1]
    return next
  })
  if (!added) return null
  app.setSelection({ values: [added._uid] })
  app.log(`Added a value to "${(block || carrier).title || (block || carrier).id}".`)
  if (focus) { app.showInspector(); app.focusInspector('Value') }
  return added._uid
}

// The block new values go to: the selected one, or the selected value's.
function activeBlock (doc) {
  const [b] = app.selection.blocks
  if (b) return doc.blocks.find(x => x._uid === b) || null
  const [v] = app.selection.values
  const value = v && doc.values.find(x => x._uid === v)
  return (value && doc.blocks.find(x => x.id === value.block)) || doc.blocks[doc.blocks.length - 1] || null
}

app.addValueToSelection = () => {
  const doc = app.getDoc()
  if (!doc) return
  const block = activeBlock(doc)
  if (block) app.addValueTo(block._uid)
  else app.addBlock()
}

// A new row in the data grid; returns its uid.
app.addEmptyValue = () => {
  const doc = app.getDoc()
  const block = doc && activeBlock(doc)
  if (block) return app.addValueTo(block._uid, { focus: false })
  let added = null
  app.edit('Add value', d => {
    const next = commands.addValue(d, { block: '', carrier: '', value: 0 })
    added = next.values[next.values.length - 1]
    return next
  })
  return added ? added._uid : null
}

app.addCarrier = ({ focus = true } = {}) => {
  if (!app.loaded) return null
  let added = null
  app.edit('Add carrier', d => {
    const id = commands.uniqueId(d.carriers.map(c => c.id), 'carrier')
    const next = commands.addCarrier(d, { id, title: id === 'carrier' ? 'New carrier' : `New carrier ${id.slice('carrier_'.length)}` })
    added = next.carriers[next.carriers.length - 1]
    return next
  })
  if (!added) return null
  app.setSelection({ carriers: [added._uid] })
  if (focus) { app.showInspector(); app.focusInspector('Title') }
  return added._uid
}

// Where a tile's icon comes from when it has none of its own: its carrier (per block)
// or its block (per carrier).
app.iconSource = value => {
  const doc = app.getDoc()
  const perBlock = getSetting(doc, 'view') === 'block'
  const row = perBlock ? doc.carriers.find(c => c.id === value.carrier) : doc.blocks.find(b => b.id === value.block)
  return row ? { row, key: perBlock ? 'carriers' : 'blocks', noun: perBlock ? 'carrier' : 'block' } : null
}

// Select that carrier or block with its icon picker open.
app.editSourceIcon = value => {
  const source = app.iconSource(value)
  if (!source) return
  app.setSelection({ [source.key]: [source.row._uid] })
  app.showInspector()
  requestAnimationFrame(() => requestAnimationFrame(() => app.inspector.openIconPicker()))
}

// Switch from filling the canvas to a fixed scale, at the size shown now.
app.keepScale = () => {
  const per = canvas.result && canvas.result.perUnit
  if (!per) return
  const value = Number(per.toPrecision(4))
  app.edit('Keep this scale', d => commands.setSetting(commands.setSetting(d, 'areaPerUnit', value), 'scaleMode', 'fixed'))
  app.setStatus(`Drawn at ${value} px² per unit`)
}

app.runFix = action => {
  const doc = app.getDoc()
  if (action === 'addMissing') app.edit('Add what is missing', d => commands.addMissing(d))
  else if (action === 'fillCanvas') app.setSetting('scaleMode', 'fit', false)
  else if (action === 'purgeEmptyBlocks') {
    const used = new Set(doc.values.map(v => v.block))
    app.deleteItems({ blocks: doc.blocks.filter(b => blockIsVisible(b) && !used.has(b.id)).map(b => b._uid) })
  } else if (action === 'purgeUnusedCarriers') {
    const used = new Set(doc.values.map(v => v.carrier))
    app.deleteItems({ carriers: doc.carriers.filter(c => !used.has(c.id)).map(c => c._uid) })
  }
}

// ---------------------------------------------------------------- keyboard

function onKey (e, { mod, key }) {
  if (mod && key === 'a') { app.setSelection({ values: canvas.result.tiles.flatMap(t => t.tile.uids) }); return true }
  const step = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[e.key]
  const kind = app.model && app.model.perBlock ? 'blocks' : 'carriers'
  if (step && app.selection[kind].size === 1) {
    const [uid] = app.selection[kind]
    app.edit(kind === 'blocks' ? 'Move block' : 'Move carrier', d => commands.stepRow(d, kind, uid, step, app.model.blocks.map(b => b.uid)))
    return true
  }
  return false
}

// ---------------------------------------------------------------- start

attachInteractions(canvas, app)
app.start()
