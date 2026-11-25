// The shell every editor in the suite shares: top bar, panels, files, autosave, undo,
// keyboard, drag and drop, and the render loop. An editor passes a spec with its
// document model and views and adds its own actions to the returned app.
//
// spec:
//   id, name            storage prefix ("sankey-editor"), tool name ("Sankey editor")
//   selection           { <issue target kind>: <document key> }, e.g. { node: 'nodes' }
//   prefs               editor preferences kept in this browser, with defaults
//   hint                text of the dismissable hint on the canvas
//   noIssuesText        shown in an empty Issues tab
//   model               { emptyDocument, getSetting, SETTINGS_BY_KEY, commands, validate, sortIssues, describe(doc) }
//   io                  { readDocument, writeDocument, starterDocument, templateWorkbook, templateName, exampleUrl, exampleName }
//   images              { buildSvg, buildPng }
//   views               { createCanvas(host), createInspector(root, app), createOutline(root, app), gridKinds(app) }
//   dialogs             { openHelp, openAbout, renderStart(root, app, draft) }
//   palette             what the palette mode colours, see paletteView.js
//   render(doc, flags)  draws the canvas; returns extra issues (asked for when flags.doc)
//   onLoad()            reset state for a newly opened document
//   onKey(e, info)      editor-specific shortcuts; return true when handled

import { createStore } from './store.js'
import { createAutosave } from './autosave.js'
import { createGrid } from './grid.js'
import { createDrawer } from './drawer.js'
import { createPaletteView } from './paletteView.js'
import { ensureTexts, attachTexts, addText, updateText, deleteTexts, orderTexts, duplicateTexts, textRowEdits, readTextsFrom, addTextsTo, textIssues, DEFAULT_WIDTH } from './textBoxes.js'
import { createTextPanel, textGridKind, createTextEditor } from './textBoxUi.js'
import { pickFile, readDroppedFile, writeToHandle, pickSaveHandle, download, hasFileSystemAccess } from './files.js'
import { FORMATS, detectFormat } from './formats.js'
import { openExportDialog, openSaveAsDialog, openChooseDialog, MOD } from './fileDialogs.js'
import { toast, log, confirmDialog, dialogOpen } from './feedback.js'
import { needsLibrary } from './icons.js'
import { loadIcons } from './iconLibrary.js'
import { h, icon, isTyping } from './dom.js'

const $ = id => document.getElementById(id)
const safeJson = s => { try { return JSON.parse(s) || {} } catch (e) { return {} } }
const blankFile = () => ({ name: null, format: null, handle: null, workbook: null, sheetNames: {} })

export function createEditor (spec) {
  const { id, name, model, io, dialogs } = spec
  const { getSetting, SETTINGS_BY_KEY, commands } = model
  const { saveDraft, loadDraft, clearDraft } = createAutosave(id)
  const PREFS_KEY = `${id}.prefs`
  const HINTS_KEY = `${id}.hints`
  // Every editor has text boxes too.
  const selectionMap = { ...spec.selection, text: 'texts' }
  const selectionKeys = Object.values(selectionMap)
  const blankSelection = () => Object.fromEntries(selectionKeys.map(k => [k, new Set()]))
  const lower = name.toLowerCase()

  const app = {
    store: createStore(model.emptyDocument()),
    loaded: false,
    file: blankFile(),
    selection: blankSelection(),
    issues: [],
    docIssues: null,
    canvasPreview: null,
    titlePreview: null,
    prefs: { ...spec.prefs, ...safeJson(localStorage.getItem(PREFS_KEY)) },
    // Edits of a table row go to text boxes or to the editor's own tables.
    commands: { ...commands, applyRowEdits: (d, kind, edits, newRows) => (kind === 'texts' ? textRowEdits(d, edits, newRows) : commands.applyRowEdits(d, kind, edits, newRows)) },
    textPreview: null, // Map uid → patch while text boxes are dragged
    textEditing: null // the text box being typed in
  }

  // ---------------------------------------------------------------- shell

  const topbar = $('topbar')
  const fileNameEl = h('span', { class: 'file-name', text: 'No file open' })
  const dirtyEl = h('span', { class: 'dirty-dot', title: 'Unsaved changes', hidden: true })
  const statusEl = h('span', { class: 'status', role: 'status', 'aria-live': 'polite' })
  const zoomLabel = h('button', { type: 'button', class: 'zoom-label', title: `Zoom to 100% (${MOD} 0)`, onclick: () => canvas.zoomTo100() }, '100%')
  const btn = (iconName, label, onclick, extra = {}) => h('button', { type: 'button', class: `tb-btn${extra.text ? ' with-text' : ''}`, title: label, 'aria-label': label, onclick, ...extra.attrs }, icon(iconName), extra.text ? h('span', { text: extra.text }) : null)
  const buttons = {
    open: btn('open', `Open (${MOD} O)`, () => openFile(), { text: 'Open' }),
    save: btn('save', `Save (${MOD} S)`, () => save(), { text: 'Save' }),
    saveAs: h('button', { type: 'button', class: 'tb-btn with-text', title: `Save as (${MOD} Shift S)`, onclick: () => saveAs() }, h('span', { text: 'Save as…' })),
    export: btn('export', `Export image (${MOD} E)`, () => exportImage(), { text: 'Export' }),
    text: btn('text', 'Add a text box (T)', () => app.addText(), { text: 'Text' }),
    settings: btn('sliders', 'Show the diagram settings', () => app.showSettings(), { text: 'Settings' }),
    undo: btn('undo', `Undo (${MOD} Z)`, () => undo()),
    redo: btn('redo', `Redo (${MOD} Shift Z)`, () => redo()),
    palette: btn('palette', 'Make a palette', () => palette.toggle(), { text: 'Palette' }),
    zoomOut: btn('zoomOut', 'Zoom out (−)', () => canvas.zoomAt(1 / 1.25)),
    zoomIn: btn('zoomIn', 'Zoom in (+)', () => canvas.zoomAt(1.25)),
    fit: btn('fit', 'Fit to window (Shift 1)', () => canvas.fit()),
    left: btn('panel', 'Show or hide the list panel', () => togglePanel('left')),
    right: btn('panelRight', 'Show or hide the inspector', () => togglePanel('right')),
    help: btn('help', 'Help (?)', () => dialogs.openHelp()),
    about: btn('info', `About the ${lower}`, () => dialogs.openAbout())
  }
  topbar.append(
    h('a', { class: 'tb-brand', href: '../', title: 'All energy diagram tools' }, h('span', { class: 'tb-name', text: name })),
    h('div', { class: 'tb-file' }, fileNameEl, dirtyEl),
    h('div', { class: 'tb-group' }, buttons.open, buttons.save, buttons.saveAs, buttons.export),
    h('div', { class: 'tb-group' }, buttons.undo, buttons.redo),
    h('div', { class: 'tb-group' }, buttons.text),
    statusEl,
    h('span', { class: 'spacer' }),
    h('div', { class: 'tb-group keep' }, buttons.settings, buttons.palette),
    h('div', { class: 'tb-group zoom keep' }, buttons.zoomOut, zoomLabel, buttons.zoomIn, buttons.fit),
    h('div', { class: 'tb-group' }, buttons.left, buttons.right, buttons.help, buttons.about)
  )

  const host = $('canvas')
  const canvas = spec.views.createCanvas(host)
  const tooltip = h('div', { class: 'tooltip', role: 'tooltip', hidden: true })
  const dragInfo = h('div', { class: 'drag-info', hidden: true })
  const emptyState = h('div', { class: 'empty-state' })
  const hints = h('div', { class: 'hints' },
    h('span', { text: spec.hint }),
    h('button', { type: 'button', class: 'icon-btn small', 'aria-label': 'Hide these hints', title: 'Hide these hints', onclick: () => { localStorage.setItem(HINTS_KEY, 'off'); hints.hidden = true } }, icon('close', 14)))
  hints.hidden = localStorage.getItem(HINTS_KEY) === 'off'
  host.append(tooltip, dragInfo, emptyState, hints)
  host.addEventListener('zoomchange', e => { zoomLabel.textContent = `${Math.round(e.detail.k * 100)}%` })

  const inspector = spec.views.createInspector($('inspector'), app)
  const outline = spec.views.createOutline($('outline'), app)
  const drawer = createDrawer($('drawer'), app, { storageKey: `${id}.drawer`, noIssuesText: spec.noIssuesText })
  const grid = createGrid(drawer.panes.data, app, { kinds: { ...spec.views.gridKinds(app), texts: textGridKind(app) } })
  const textPanel = createTextPanel($('inspector'), app, getSetting)
  const textEditor = createTextEditor(host, app, canvas)
  host.addEventListener('zoomchange', () => textEditor.close(true))
  Object.assign(app, { canvas, host, drawer, grid, inspector, outline })

  function togglePanel (side) {
    const el = document.body
    el.classList.toggle(`hide-${side}`)
    localStorage.setItem(`${id}.hide-${side}`, el.classList.contains(`hide-${side}`) ? '1' : '')
    window.dispatchEvent(new Event('resize'))
    updateToolbar()
  }
  ;['left', 'right'].forEach(side => { if (localStorage.getItem(`${id}.hide-${side}`)) document.body.classList.add(`hide-${side}`) })
  app.showInspector = () => { if (document.body.classList.contains('hide-right')) togglePanel('right') }

  // ---------------------------------------------------------------- app API shared by the UI modules

  app.hasDocument = () => app.loaded
  // While a palette is being made, another document is drawn and nothing can be edited.
  let previewDoc = null
  app.getDoc = () => (app.loaded ? previewDoc || app.store.doc : null)
  function setPreview (doc) {
    previewDoc = doc
    scheduleRender({ doc: true })
  }

  app.edit = (label, fn, opts) => (app.loaded && !previewDoc ? app.store.apply(label, fn, opts) : false)

  app.setSetting = (key, value, live) => {
    const def = SETTINGS_BY_KEY[key]
    app.edit(`Change ${def ? def.label.toLowerCase() : key}`, d => commands.setSetting(d, key, value), live ? { coalesce: `setting:${key}` } : {})
    if (key === 'font' && value) document.fonts.load(`300 12px "${value}"`).then(() => scheduleRender({ doc: true }), () => {})
  }

  app.setPref = (key, value) => {
    app.prefs[key] = value
    localStorage.setItem(PREFS_KEY, JSON.stringify(app.prefs))
    scheduleRender({ canvas: true })
  }

  // sel: { <document key>: uids }; keys left out are cleared.
  app.setSelection = (sel = {}) => {
    app.selection = Object.fromEntries(selectionKeys.map(k => [k, new Set(sel[k] || [])]))
    scheduleRender({ selection: true })
  }

  app.notify = (message, kind = 'info') => {
    log(message, kind === 'error' ? 'error' : 'info')
    toast(message, { kind })
  }

  app.renderGrid = () => grid.render()

  app.showTargets = targets => {
    const sel = Object.fromEntries(Object.entries(selectionMap).map(([kind, key]) => [key, targets.filter(t => t.kind === kind).map(t => t.uid)]))
    app.setSelection(sel)
    app.reveal(targets.map(t => t.uid))
  }

  app.deleteSelection = () => {
    const texts = [...app.selection.texts]
    const rest = Object.fromEntries(selectionKeys.filter(k => k !== 'texts').map(k => [k, [...app.selection[k]]]))
    if (texts.length) app.removeTexts(texts)
    if (Object.values(rest).some(list => list.length)) app.deleteItems(rest)
  }

  // ---- text boxes ----

  const onlyTexts = () => app.selection.texts.size > 0 && selectionKeys.every(k => k === 'texts' || app.selection[k].size === 0)
  const textCount = n => `${n} text box${n === 1 ? '' : 'es'}`
  app.textBox = uid => canvas.textBox(uid)

  // A click selects one; with Shift or Cmd/Ctrl it is added or taken out.
  app.selectText = (uid, additive) => {
    if (additive) {
      const sel = Object.fromEntries(selectionKeys.map(k => [k, [...app.selection[k]]]))
      sel.texts = app.selection.texts.has(uid) ? sel.texts.filter(u => u !== uid) : [...sel.texts, uid]
      app.setSelection(sel)
    } else if (!app.selection.texts.has(uid) || !onlyTexts()) app.setSelection({ texts: [uid] })
  }

  app.previewTexts = patches => { app.textPreview = patches; scheduleRender({ canvas: true }) }
  app.commitTexts = (patches, label) => {
    app.textPreview = null
    if (!app.edit(label, d => [...patches].reduce((x, [u, p]) => updateText(x, u, p), d))) scheduleRender({ canvas: true })
  }
  app.updateTexts = (uids, patch, label, live) => app.edit(label, d => uids.reduce((x, u) => updateText(x, u, patch), d), live ? { coalesce: `texts:${uids.join()}:${Object.keys(patch).join()}` } : {})
  app.removeTexts = (uids, label) => { if (app.edit(label || `Delete ${textCount(uids.length)}`, d => deleteTexts(d, uids))) { app.setSelection({}); if (!label) app.reportDeleted(textCount(uids.length)) } }
  app.orderTexts = (uids, where) => app.edit(where === 'front' ? 'Bring to the front' : 'Send to the back', d => orderTexts(d, uids, where))
  app.duplicateTexts = uids => {
    let made = []
    if (app.edit('Duplicate', d => { const r = duplicateTexts(d, uids); made = r.uids; return r.doc })) app.setSelection({ texts: made })
  }
  app.setTextEditing = uid => { app.textEditing = uid; scheduleRender({ canvas: true }) }
  app.editText = (uid, options) => { app.hideTooltip(); app.setSelection({ texts: [uid] }); requestAnimationFrame(() => requestAnimationFrame(() => textEditor.open(uid, options))) }

  // A new one in the middle of the view, ready to type in.
  app.addText = ({ edit = true } = {}) => {
    if (!app.loaded || palette.isOpen) return null
    const doc = app.getDoc()
    const c = app.viewCenter()
    const sc = getSetting(doc, 'scaleCanvas') || 1
    const w = getSetting(doc, 'canvasWidth') / sc
    const hgt = getSetting(doc, 'canvasHeight') / sc
    const x = Math.round(Math.max(0, Math.min(w - DEFAULT_WIDTH, c.x - DEFAULT_WIDTH / 2)))
    const y = Math.round(Math.max(0, Math.min(hgt - 40, c.y - 20)))
    let uid = null
    if (!app.edit('Add text', d => { const next = addText(d, { x, y, width: DEFAULT_WIDTH }); uid = next.texts[next.texts.length - 1]._uid; return next })) return null
    app.setSelection({ texts: [uid] })
    app.showInspector()
    if (edit) app.editText(uid, { fresh: true })
    return uid
  }

  // ---- the diagram settings ----

  // Whether the right panel shows the settings of the whole diagram.
  const settingsShown = () => app.loaded && !palette.isOpen && !document.body.classList.contains('hide-right') && selectionKeys.every(k => app.selection[k].size === 0)
  app.showSettings = () => {
    app.setSelection({})
    app.showInspector()
    requestAnimationFrame(() => { $('inspector').scrollTop = 0 })
  }

  // Reports a delete with an undo button.
  app.reportDeleted = text => {
    toast(`Deleted ${text}.`, { action: { label: 'Undo', onClick: undo } })
    log(`Deleted ${text}.`)
  }
  app.offerUndo = text => toast(text, { action: { label: 'Undo', onClick: undo } })
  app.toast = toast
  app.log = log

  // Marks per item of one kind with a warning or error (notes don't get one).
  app.issueMarks = kind => {
    const marks = new Map()
    ;(app.docIssues || []).forEach(issue => {
      if (issue.severity === 'info') return
      issue.targets.forEach(t => {
        if (t.kind !== kind) return
        const m = marks.get(t.uid) || { severity: 'warning', messages: [] }
        if (issue.severity === 'error') m.severity = 'error'
        m.messages.push(issue.message)
        marks.set(t.uid, m)
      })
    })
    return marks
  }

  // Clicking an issue mark: select the item and show its issues in the Issues tab.
  app.showIssuesOf = (key, uid) => {
    app.hideTooltip()
    app.setSelection({ [key]: [uid] })
    drawer.show('issues')
    requestAnimationFrame(() => drawer.highlightIssuesFor(uid))
  }

  // Open the Data tab on one cell, in edit mode with its content selected. Waits a
  // frame so the browser's own handling of the click can't take focus back.
  app.editCell = (kind, uid, col) => {
    app.hideTooltip()
    drawer.show('data')
    grid.showKind(kind)
    requestAnimationFrame(() => grid.editCell(uid, col))
  }

  // Canvas size: dragging an artboard edge previews the size, the drop commits it as one undo step.
  app.canvasSize = () => ({ w: getSetting(app.getDoc(), 'canvasWidth'), h: getSetting(app.getDoc(), 'canvasHeight') })

  app.previewCanvasSize = size => {
    app.canvasPreview = size
    scheduleRender({ canvas: true })
  }

  app.commitCanvasSize = ({ w, h: height }) => {
    app.canvasPreview = null
    const done = app.edit('Resize canvas', d => commands.setSetting(commands.setSetting(d, 'canvasWidth', w), 'canvasHeight', height))
    if (done) setStatus(`Canvas is now ${w} × ${height} px`)
    else scheduleRender({ canvas: true })
  }

  // Diagram title position: dragging the title previews it, the drop commits one undo step.
  app.titlePosition = () => ({ x: getSetting(app.getDoc(), 'titlePositionX'), y: getSetting(app.getDoc(), 'titlePositionY') })

  app.previewTitlePosition = pos => {
    app.titlePreview = pos
    scheduleRender({ canvas: true })
  }

  app.commitTitlePosition = ({ x, y }) => {
    app.titlePreview = null
    if (!app.edit('Move title', d => commands.setSetting(commands.setSetting(d, 'titlePositionX', x), 'titlePositionY', y))) scheduleRender({ canvas: true })
  }

  // The document with those previews applied, for drawing.
  app.withPreviews = doc => {
    let out = doc
    if (app.canvasPreview || app.titlePreview) {
      out = {
        ...out,
        settings: {
          ...out.settings,
          ...(app.canvasPreview ? { canvasWidth: app.canvasPreview.w, canvasHeight: app.canvasPreview.h } : {}),
          ...(app.titlePreview ? { titlePositionX: app.titlePreview.x, titlePositionY: app.titlePreview.y } : {})
        }
      }
    }
    const p = app.textPreview
    if (p && out.texts) out = { ...out, texts: out.texts.map(t => (p.has(t._uid) ? { ...t, ...p.get(t._uid) } : t)) }
    return out
  }

  // Clicking the size above the canvas opens the width and height fields.
  app.focusCanvasSettings = () => {
    app.setSelection({})
    app.showInspector()
    app.focusInspector('Width')
  }

  // Focus and select an inspector field by its label as soon as the inspector shows
  // it. Retries for a few frames because the panel is rebuilt asynchronously.
  app.focusInspector = label => {
    let tries = 0
    const attempt = () => {
      const field = [...$('inspector').querySelectorAll('.field')].find(f => f.querySelector('.field-label')?.textContent === label)
      const section = field && field.closest('details')
      if (section) section.open = true
      const input = field && field.querySelector('input, textarea, select')
      if (input && input.offsetParent !== null) {
        field.scrollIntoView({ block: 'nearest' })
        input.focus()
        if (input.select) input.select()
        return
      }
      if (++tries < 30) requestAnimationFrame(attempt)
    }
    requestAnimationFrame(() => requestAnimationFrame(attempt))
  }

  // Floating boxes next to the pointer.
  app.showTooltip = (children, x, y) => { tooltip.replaceChildren(...children.filter(Boolean)); placeFloating(tooltip, x, y) }
  app.hideTooltip = () => { tooltip.hidden = true }
  app.showDragInfo = (text, x, y) => { dragInfo.textContent = text; placeFloating(dragInfo, x, y) }
  app.hideDragInfo = () => { dragInfo.hidden = true }

  function placeFloating (el, x, y) {
    const r = host.getBoundingClientRect()
    el.hidden = false
    const w = el.offsetWidth
    const hgt = el.offsetHeight
    let left = x - r.left + 14
    let top = y - r.top + 16
    if (left + w > r.width - 8) left = x - r.left - w - 14
    if (top + hgt > r.height - 8) top = y - r.top - hgt - 12
    el.style.left = `${Math.max(4, left)}px`
    el.style.top = `${Math.max(4, top)}px`
  }

  // The canvas point at the middle of the view.
  app.viewCenter = () => {
    const r = canvas.svg.getBoundingClientRect()
    return canvas.clientToContent(r.left + r.width / 2, r.top + r.height / 2)
  }

  // Loads the full icon library when rows use icons from it, then draws again.
  let iconsFailed = false
  app.ensureIcons = rows => {
    if (iconsFailed || !needsLibrary(rows)) return
    loadIcons().then(() => scheduleRender({ doc: true }), e => { iconsFailed = true; app.notify(e.message, 'error') })
  }

  // ---------------------------------------------------------------- rendering

  let queued = false
  let flags = {}
  function scheduleRender (f = {}) {
    Object.assign(flags, f)
    if (queued) return
    queued = true
    requestAnimationFrame(renderNow)
  }
  app.scheduleRender = scheduleRender

  // A colour picker belongs to its input: rebuilding the list it is in would close it at the
  // first colour chosen. So the list waits until the picker is closed.
  const outlineRoot = $('outline')
  let outlineStale = false
  const picking = () => { const a = document.activeElement; return !!a && a.type === 'color' && outlineRoot.contains(a) }
  function renderOutline () {
    if (picking()) { outlineStale = true; return }
    outlineStale = false
    outline.render()
  }
  ;['change', 'focusout'].forEach(type => outlineRoot.addEventListener(type, e => {
    if (e.target.type !== 'color' || !outlineStale) return
    setTimeout(() => { if (!picking() && outlineStale) { outlineStale = false; outline.render(); outline.renderSelection() } })
  }))

  function renderNow () {
    queued = false
    const f = flags
    flags = {}
    document.body.classList.toggle('no-doc', !app.loaded)
    updateToolbar()
    if (!app.loaded) {
      inspector.render()
      outline.render()
      grid.render()
      drawer.renderIssues([])
      return
    }
    const doc = app.getDoc()
    if (f.doc || !app.docIssues) app.docIssues = model.validate(doc)
    canvas.setTextState({ selected: app.selection.texts, editing: app.textEditing })
    const extraIssues = [...(spec.render(doc, f) || []), ...(f.doc ? textIssues(doc) : [])]
    if (f.preview && !f.doc) return
    if (f.doc) {
      app.issues = model.sortIssues([...app.docIssues, ...extraIssues])
      drawer.renderIssues(app.issues)
      renderOutline()
      if (drawer.tab === 'data' && drawer.open) grid.render()
    }
    if (f.selection || f.doc) {
      outline.renderSelection()
      grid.renderSelection()
    }
    // Text boxes have a panel of their own; the editor's comes back when they are deselected.
    if (onlyTexts()) {
      if (panelMode !== 'text') { panelMode = 'text'; textPanel.reset() }
      textPanel.render()
    } else {
      if (panelMode === 'text') { panelMode = 'editor'; inspector.reset() }
      inspector.render()
    }
  }
  let panelMode = 'editor'

  function updateToolbar () {
    const s = app.store
    buttons.undo.disabled = !app.loaded || !s.canUndo()
    buttons.redo.disabled = !app.loaded || !s.canRedo()
    buttons.undo.title = s.canUndo() ? `Undo ${s.undoLabel().toLowerCase()} (${MOD} Z)` : 'Nothing to undo'
    buttons.redo.title = s.canRedo() ? `Redo ${s.redoLabel().toLowerCase()} (${MOD} Shift Z)` : 'Nothing to redo'
    ;['save', 'saveAs', 'export', 'palette', 'zoomIn', 'zoomOut', 'fit'].forEach(k => { buttons[k].disabled = !app.loaded })
    zoomLabel.disabled = !app.loaded
    buttons.text.disabled = !app.loaded
    buttons.settings.hidden = !app.loaded || palette.isOpen || settingsShown()
    const dirty = app.loaded && s.isDirty()
    dirtyEl.hidden = !dirty
    fileNameEl.textContent = app.loaded ? (app.file.name || 'Untitled diagram') : 'No file open'
    document.title = app.loaded ? `${dirty ? '• ' : ''}${app.file.name || 'Untitled diagram'} · ${name}` : name
  }

  const palette = createPaletteView({ app, spec: spec.palette, canvas, host, settings: SETTINGS_BY_KEY, getSetting, setPreview })
  app.palette = palette

  let statusTimer = null
  function setStatus (text) {
    statusEl.textContent = text
    statusEl.classList.add('show')
    clearTimeout(statusTimer)
    statusTimer = setTimeout(() => statusEl.classList.remove('show'), 2500)
  }
  app.setStatus = setStatus

  app.store.subscribe((doc, change) => {
    if (!app.loaded) return
    if (change.kind === 'saved') { updateToolbar(); scheduleAutosave(); return }
    // Drop selected items that no longer exist (after delete or undo).
    app.selection = Object.fromEntries(selectionKeys.map(k => [k, new Set([...app.selection[k]].filter(u => doc[k].some(r => r._uid === u)))]))
    if (change.kind === 'undo') setStatus(`Undid: ${change.label}`)
    if (change.kind === 'redo') setStatus(`Redid: ${change.label}`)
    scheduleRender({ doc: true, selection: true })
    if (change.kind !== 'load') scheduleAutosave()
  })

  // ---------------------------------------------------------------- history

  function undo () { if (app.loaded && !app.store.undo()) setStatus('Nothing to undo') }
  function redo () { if (app.loaded && !app.store.redo()) setStatus('Nothing to redo') }

  // ---------------------------------------------------------------- files

  async function confirmDiscard () {
    if (!app.loaded || !app.store.isDirty()) return true
    return confirmDialog('The open diagram has changes that are not saved to a file. Opening another one replaces it. You can still restore it from this browser later, until you make changes in the new one.', { title: 'Replace the open diagram?', confirmLabel: 'Replace', danger: true })
  }

  // message: shown instead of the notes about file format changes.
  function loadDocument (doc, file, { notes = [], dirty = false, source, message } = {}) {
    palette.close()
    textEditor.close(false)
    doc = ensureTexts(doc)
    app.textPreview = null
    app.textEditing = null
    app.file = { ...blankFile(), ...file }
    app.loaded = true
    app.canvasPreview = null
    app.titlePreview = null
    app.docIssues = null
    app.selection = blankSelection()
    if (spec.onLoad) spec.onLoad()
    app.store.load(doc, { dirty })
    inspector.reset()
    emptyState.hidden = true
    log(`Opened ${source || app.file.name || 'a new diagram'}: ${model.describe(doc)}.`)
    notes.forEach(n => log(n))
    if (message) { log(message); toast(message, { timeout: 12000 }) } else if (notes.length) toast(`Updated to the current file format: ${notes.join(' ')} Saving keeps these changes.`, { timeout: 9000 })
    scheduleRender({ doc: true, selection: true })
    // Fit once the labels have been measured.
    requestAnimationFrame(() => requestAnimationFrame(() => canvas.fit()))
    scheduleAutosave()
  }

  // The text boxes of a file, which every editor reads the same way.
  function withFileTexts (fileName, bytes, result) {
    if (!result || !result.doc) return result
    try {
      const found = readTextsFrom(detectFormat(fileName, bytes), bytes)
      return found ? { ...result, doc: attachTexts(result.doc, found.rows, found.header) } : result
    } catch (e) {
      return result
    }
  }

  async function openBytes (fileName, bytes, handle = null) {
    try {
      let result = io.readDocument(fileName, bytes)
      if (result.choose) {
        const make = result.choose.make
        result = { ...result, choose: { ...result.choose, make: value => withFileTexts(fileName, bytes, make(value)) } }
      } else result = withFileTexts(fileName, bytes, result)
      const loadNew = r => loadDocument(r.doc, { name: null, format: r.format }, { dirty: true, source: `a new diagram made from ${fileName}`, message: r.message })
      if (result.choose) {
        openChooseDialog(result.choose, value => loadNew(result.choose.make(value)))
        return true
      }
      if (result.asNew) {
        loadNew(result)
        return true
      }
      loadDocument(result.doc, { name: fileName, format: result.format, handle, workbook: result.workbook, sheetNames: result.sheetNames }, { notes: result.notes })
      return true
    } catch (e) {
      app.notify(`Could not open ${fileName}: ${e.message}`, 'error')
      return false
    }
  }

  async function openFile () {
    if (!(await confirmDiscard())) return
    try {
      const picked = await pickFile()
      if (picked) await openBytes(picked.name, picked.bytes, picked.handle)
    } catch (e) {
      app.notify(`Could not open the file: ${e.message}`, 'error')
    }
  }
  app.open = openFile

  app.loadExample = async () => {
    if (!(await confirmDiscard())) return
    try {
      const res = await fetch(io.exampleUrl)
      if (!res.ok) throw new Error(`the server answered ${res.status}`)
      await openBytes(io.exampleName, new Uint8Array(await res.arrayBuffer()))
      app.file.handle = null
    } catch (e) {
      app.notify(`Could not load the example: ${e.message}`, 'error')
    }
  }

  app.newFromTemplate = async () => {
    if (!(await confirmDiscard())) return
    loadDocument(io.starterDocument(), { name: null, format: 'xlsx' }, { dirty: true, source: 'a new diagram' })
  }

  app.downloadTemplate = () => {
    download(io.templateWorkbook(), io.templateName, FORMATS.xlsx.mime)
    log('Downloaded the xlsx template.')
  }

  // A file of the open document: what the editor writes, with the text boxes.
  app.fileData = (format, context = {}) => {
    const doc = app.getDoc()
    const { data, mime } = io.writeDocument(doc, format, context)
    return { data: addTextsTo(format, data, doc), mime }
  }
  app.openBytes = openBytes

  async function writeOut (format, fileName, handle) {
    const sameFormat = format === app.file.format
    const { data, mime } = app.fileData(format, sameFormat || format === 'xlsx' ? { workbook: app.file.workbook, sheetNames: app.file.sheetNames } : {})
    if (handle) await writeToHandle(handle, data)
    else download(data, fileName, mime)
    app.file = { ...app.file, name: fileName, format, handle: handle || null }
    app.store.markSaved()
    app.notify(handle ? `Saved ${fileName}.` : `Downloaded ${fileName}. Your browser saves it to its downloads folder.`, 'success')
  }

  async function save () {
    if (!app.loaded) return
    try {
      if (app.file.handle && app.file.format) return await writeOut(app.file.format, app.file.name, app.file.handle)
      if (!app.file.name) return saveAs()
      return await writeOut(app.file.format || 'xlsx', app.file.name, null)
    } catch (e) {
      app.notify(`Saving failed: ${e.message}`, 'error')
    }
  }

  function saveAs () {
    if (!app.loaded) return
    const baseName = app.file.name || getSetting(app.getDoc(), 'title')
    openSaveAsDialog(app, { format: app.file.format, baseName }, async (format, fileName) => {
      try {
        if (hasFileSystemAccess) {
          const handle = await pickSaveHandle(fileName, format)
          if (!handle) return false
          await writeOut(format, handle.name || fileName, handle)
        } else {
          await writeOut(format, fileName, null)
        }
      } catch (e) {
        app.notify(`Saving failed: ${e.message}`, 'error')
        return false
      }
    })
  }

  function exportImage () {
    if (!app.loaded) return
    const doc = app.getDoc()
    openExportDialog(app, {
      ...spec.images,
      download,
      size: { width: getSetting(doc, 'canvasWidth'), height: getSetting(doc, 'canvasHeight') },
      transparent: getSetting(doc, 'transparentBackground'),
      baseName: app.file.name || getSetting(doc, 'title')
    })
  }

  // ---------------------------------------------------------------- autosave

  let autosaveTimer = null
  function scheduleAutosave () {
    clearTimeout(autosaveTimer)
    autosaveTimer = setTimeout(() => {
      if (!app.loaded) return
      saveDraft({
        doc: app.store.doc,
        file: { name: app.file.name, format: app.file.format, handle: app.file.handle, workbook: app.file.workbook, sheetNames: app.file.sheetNames },
        savedAt: Date.now(),
        dirty: app.store.isDirty()
      }).catch(() => {})
    }, 800)
  }

  app.restoreDraft = draft => {
    loadDocument(draft.doc, draft.file || {}, { dirty: !!draft.dirty, source: `your unsaved work${draft.file && draft.file.name ? ` on ${draft.file.name}` : ''}` })
    toast('Restored your unsaved work. Save it to keep it in a file.', { kind: 'success' })
  }

  app.discardDraft = async () => {
    await clearDraft()
    dialogs.renderStart(emptyState, app, null)
  }

  window.addEventListener('beforeunload', e => {
    if (app.loaded && app.store.isDirty()) {
      e.preventDefault()
      e.returnValue = ''
    }
  })

  // ---------------------------------------------------------------- drag and drop

  let dragDepth = 0
  const dropOverlay = $('dropOverlay')
  const hasFiles = e => e.dataTransfer && [...e.dataTransfer.types].includes('Files')
  window.addEventListener('dragenter', e => { if (!hasFiles(e)) return; e.preventDefault(); dragDepth += 1; dropOverlay.hidden = false })
  window.addEventListener('dragover', e => { if (hasFiles(e)) e.preventDefault() })
  window.addEventListener('dragleave', e => { if (!hasFiles(e)) return; dragDepth -= 1; if (dragDepth <= 0) { dragDepth = 0; dropOverlay.hidden = true } })
  window.addEventListener('drop', async e => {
    if (!hasFiles(e)) return
    e.preventDefault()
    dragDepth = 0
    dropOverlay.hidden = true
    const file = e.dataTransfer.files[0]
    if (!file || !(await confirmDiscard())) return
    const picked = await readDroppedFile(file)
    await openBytes(picked.name, picked.bytes, null)
  })

  // ---------------------------------------------------------------- keyboard

  window.addEventListener('keydown', e => {
    const mod = e.metaKey || e.ctrlKey
    const key = e.key.toLowerCase()
    if (mod && key === 'o') { e.preventDefault(); openFile(); return }
    if (dialogOpen()) return
    if (mod && key === 's') { e.preventDefault(); e.shiftKey ? saveAs() : save(); return }
    if (mod && key === 'e') { e.preventDefault(); exportImage(); return }
    const typing = isTyping()
    if (mod && key === 'z' && !typing) { e.preventDefault(); e.shiftKey ? redo() : undo(); return }
    if (mod && key === 'y' && !typing) { e.preventDefault(); redo(); return }
    if (typing || !app.loaded) {
      if (!typing && (e.key === '?')) dialogs.openHelp()
      return
    }
    const inGrid = document.activeElement && document.activeElement.closest && document.activeElement.closest('.grid')
    if (inGrid) return
    if (key === 't' && !mod && !e.altKey && !palette.isOpen) { e.preventDefault(); app.addText(); return }
    if (onlyTexts()) {
      const uids = [...app.selection.texts]
      if (e.key === 'Enter' && uids.length === 1) { e.preventDefault(); app.editText(uids[0]); return }
      const step = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key]
      if (step && !mod) {
        e.preventDefault()
        const by = e.shiftKey ? 10 : 1
        const moves = new Map(uids.map(u => { const b = canvas.textBox(u); return [u, b ? { x: Math.round(b.x + step[0] * by), y: Math.round(b.y + step[1] * by) } : {}] }))
        app.edit(uids.length > 1 ? 'Move texts' : 'Move text', d => [...moves].reduce((x, [u, p]) => updateText(x, u, p), d), { coalesce: `nudge:${uids.join()}` })
        return
      }
    }
    if (spec.onKey && spec.onKey(e, { mod, key })) { e.preventDefault(); return }
    if (mod && e.key === '0') { e.preventDefault(); canvas.zoomTo100(); return }
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); app.deleteSelection(); return }
    if (e.key === 'Escape') { app.setSelection({}); return }
    if (e.key === '?') { dialogs.openHelp(); return }
    if (e.key === '/') { e.preventDefault(); if (document.body.classList.contains('hide-left')) togglePanel('left'); outline.focusSearch(); return }
    if (e.key === '+' || e.key === '=') { canvas.zoomAt(1.25); return }
    if (e.key === '-' || e.key === '_') { canvas.zoomAt(1 / 1.25); return }
    if (e.key === '!' || (e.shiftKey && e.code === 'Digit1')) canvas.fit()
  })

  // ---------------------------------------------------------------- start

  document.fonts.addEventListener('loadingdone', () => { if (app.loaded) scheduleRender({ doc: true }) })
  window.addEventListener('resize', () => { if (app.loaded) scheduleRender({ canvas: true }) })

  // Call once the editor has added its own actions.
  app.start = async () => {
    const draft = await loadDraft()
    dialogs.renderStart(emptyState, app, draft && draft.dirty && draft.doc ? draft : null)
    scheduleRender({})
    if (new URLSearchParams(location.search).get('example') !== null) app.loadExample()
  }

  return app
}
