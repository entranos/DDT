// Text boxes in the editors' panels: their form in the right panel, their table in the Data
// tab, and typing a text in place on the canvas.

import { h, icon, clear, shortcutIn } from './dom.js'
import { textAreaField, numberField, colorField, toggleField, segmentedField } from './fields.js'
import { columnsFromRows, optionalDot } from './grid.js'
import { parseBoolean } from './values.js'
import { TEXT_COLUMNS, WEIGHTS, ALIGNS, isShown, textDefaults, weightOf, alignOf, deleteTextColumn } from './textBoxes.js'

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`
const trimmed = v => String(v ?? '').trim()
const firstLine = t => trimmed(t.text).split(/\r?\n/)[0] || 'Empty text box'

// ---- the right panel ----

export function createTextPanel (root, app, getSetting) {
  let formKey = null
  let bindings = []
  let dynamics = []

  const bind = (field, get) => { bindings.push({ get, update: field.update }); return field.el }
  const section = (title, children) => h('details', { class: 'insp-section', open: true }, h('summary', {}, icon('chevron', 14), h('span', { text: title })), h('div', { class: 'insp-grid' }, children))
  const link = (text, onclick) => h('button', { type: 'button', class: 'link-btn small field-wide', text, onclick })
  const defaults = () => { const d = app.getDoc(); return textDefaults(k => getSetting(d, k)) }

  function render () {
    const doc = app.getDoc()
    const uids = [...app.selection.texts].filter(u => doc.texts.some(t => t._uid === u))
    if (!uids.length) return
    const key = uids.join()
    if (key !== formKey) {
      formKey = key
      bindings = []
      dynamics = []
      clear(root)
      root.dataset.mode = 'text'
      root.append(...build(uids))
      root.scrollTop = 0
    }
    bindings.forEach(b => b.update(b.get(app.getDoc())))
    dynamics.forEach(fn => fn(app.getDoc()))
  }

  function build (uids) {
    const rows = d => d.texts.filter(t => uids.includes(t._uid))
    const one = uids.length === 1
    const common = (d, key) => { const list = [...new Set(rows(d).map(t => trimmed(t[key])))]; return list.length === 1 ? list[0] : null }
    const set = (label, patch, live) => app.updateTexts(uids, patch, label, live)
    const out = [h('div', { class: 'insp-head' },
      h('div', { class: 'insp-kind', text: one ? 'Text box' : 'Text boxes' }),
      h('div', { class: 'insp-title-row' }, h('h2', { class: 'insp-title', text: one ? firstLine(rows(app.getDoc())[0]) : plural(uids.length, 'text box', 'text boxes') }),
        h('div', { class: 'insp-actions' },
          h('button', { class: 'icon-btn', type: 'button', title: 'Duplicate', 'aria-label': 'Duplicate', onclick: () => app.duplicateTexts(uids) }, icon('copy')),
          h('button', { class: 'icon-btn danger', type: 'button', title: 'Delete (Delete)', 'aria-label': 'Delete', onclick: () => app.deleteSelection() }, icon('trash')))))]
    if (one) dynamics.push(d => { const t = root.querySelector('.insp-title'); const r = rows(d)[0]; if (t && r) t.textContent = firstLine(r) })

    // ---- text ----
    const textFields = []
    if (one) {
      const area = textAreaField({ label: 'Text', value: rows(app.getDoc())[0].text, placeholder: 'Type here', onCommit: v => set('Edit text', { text: v }) })
      area.input.rows = 4
      area.input.addEventListener('input', () => set('Edit text', { text: area.input.value }, true))
      textFields.push(bind(area, d => rows(d)[0].text), link('Type on the canvas (Enter)', () => app.editText(uids[0])))
    }
    const size = d => { const v = common(d, 'size'); return v === null ? null : v === '' ? defaults().size : Number(v) }
    const sizeField = numberField({ label: 'Size', value: size(app.getDoc()), min: 4, max: 400, step: 1, suffix: 'px', onCommit: (v, { live }) => set('Change text size', { size: v }, live) })
    const sizeBack = link('Back to the size of the diagram’s texts', () => set('Change text size', { size: '' }))
    dynamics.push(d => { sizeBack.hidden = !rows(d).some(t => trimmed(t.size) !== '') })
    const color = d => { const v = common(d, 'color'); return v || defaults().color }
    const colorBack = link('Back to the colour of the diagram’s texts', () => set('Change text colour', { color: '' }))
    dynamics.push(d => { colorBack.hidden = !rows(d).some(t => trimmed(t.color) !== '') })
    const weight = d => { const w = common(d, 'weight'); return w === null ? null : (WEIGHTS.find(x => x.weight === weightOf(w)) || WEIGHTS[1]).value }
    const align = d => { const a = common(d, 'align'); return a === null ? null : alignOf(a) }
    textFields.push(
      bind(sizeField, size), sizeBack,
      bind(colorField({ label: 'Colour', value: color(app.getDoc()), onCommit: (v, { live }) => set('Change text colour', { color: v }, live) }), color), colorBack,
      wide(bind(segmentedField({ label: 'Weight', value: weight(app.getDoc()), options: WEIGHTS, onCommit: v => set('Change text weight', { weight: v }) }), weight)),
      wide(bind(segmentedField({ label: 'Align', value: align(app.getDoc()), options: ALIGNS, onCommit: v => set('Align text', { align: v }) }), align)))
    out.push(section('Text', textFields))

    // ---- box ----
    const fill = (key, label, initial) => {
      const on = d => rows(d).some(t => trimmed(t[key]) !== '')
      const value = d => common(d, key) || initial
      const picker = bind(colorField({ label: `${label} colour`, value: value(app.getDoc()), onCommit: (v, { live }) => set(`Change ${label.toLowerCase()}`, { [key]: v }, live) }), value)
      dynamics.push(d => { picker.hidden = !on(d) })
      return [bind(toggleField({ label, value: on(app.getDoc()), onCommit: v => set(`${v ? 'Add' : 'Remove'} ${label.toLowerCase()}`, { [key]: v ? initial : '' }) }), on), picker]
    }
    const boxFields = [...fill('background', 'Background', '#FFFFFF'), ...fill('border', 'Border', '#827D75')]
    if (one) {
      const drawn = () => app.textBox(uids[0])
      const num = (label, key, opts = {}) => bind(numberField({ label, value: 0, step: 1, suffix: 'px', ...opts, onCommit: (v, { live }) => set(key === 'x' || key === 'y' ? 'Move text' : 'Resize text', { [key]: v }, live) }), () => { const b = drawn(); return b ? Math.round(b[key]) : Number(rows(app.getDoc())[0][key]) || 0 })
      const fit = link('Height that fits the text', () => set('Resize text', { height: '' }))
      dynamics.push(d => { const t = rows(d)[0]; const b = drawn(); fit.hidden = !(t && trimmed(t.height) !== '' && b && b.height > b.needed + 0.5) })
      boxFields.push(num('X', 'x'), num('Y', 'y'), num('Width', 'width', { min: 16 }), num('Height', 'height', { min: 8 }), fit)
    }
    out.push(section('Box', boxFields))

    out.push(section('More', [
      bind(toggleField({ label: 'Visible', value: rows(app.getDoc()).every(isShown), onCommit: v => set(v ? 'Show text' : 'Hide text', { visible: v }) }), d => rows(d).every(isShown)),
      h('div', { class: 'field-wide btn-row' },
        h('button', { type: 'button', class: 'btn btn-small', text: 'To the front', onclick: () => app.orderTexts(uids, 'front') }),
        h('button', { type: 'button', class: 'btn btn-small', text: 'To the back', onclick: () => app.orderTexts(uids, 'back') })),
      h('p', { class: 'field-help field-wide', text: 'Drag a text box to move it and its edges to size it. Arrow keys move it a pixel, with Shift ten.' })
    ]))
    return out
  }
  const wide = el => { el.classList.add('field-wide'); return el }

  return { render, reset: () => { formKey = null } }
}

// ---- the Data tab ----

const LABELS = { text: 'Text', x: 'X', y: 'Y', width: 'Width', height: 'Height', size: 'Size', weight: 'Weight', color: 'Colour', align: 'Align', background: 'Background', border: 'Border', visible: 'Visible' }

export function textGridKind (app) {
  return {
    label: 'Texts',
    noun: 'text box',
    selection: 'texts',
    columns: doc => columnsFromRows({ std: TEXT_COLUMNS, meta: doc.meta.textColumns, rows: doc.texts, labels: LABELS, numeric: new Set(['x', 'y', 'width', 'height', 'size']), lists: { weight: 'dl-text-weights', align: 'dl-text-aligns', visible: 'dl-yes-no' } })
      .map(c => (c.key === 'visible' ? { ...c, format: v => (v === '' || v === undefined ? '' : parseBoolean(v) ? 'Yes' : 'No') } : c)),
    datalists: () => [
      { id: 'dl-text-weights', options: WEIGHTS.map(w => ({ value: w.value })) },
      { id: 'dl-text-aligns', options: ALIGNS.map(a => ({ value: a.value })) },
      { id: 'dl-yes-no', options: [{ value: 'Yes' }, { value: 'No' }] }
    ],
    swatch: (doc, col, row) => (['color', 'background', 'border'].includes(col) ? optionalDot(row[col]) : undefined),
    add: () => app.addText({ edit: false }),
    columnActions: {
      canDelete: key => !key.startsWith('_') && !TEXT_COLUMNS.includes(key),
      remove: key => { if (app.edit(`Delete column ${key}`, d => deleteTextColumn(d, key))) app.reportDeleted(`column ${key}`) }
    }
  }
}

// ---- typing on the canvas ----

// A text area over a text box, in its own font and size. Enter starts a new line; clicking
// elsewhere or Cmd/Ctrl+Enter keeps the text, Escape leaves it as it was.
export function createTextEditor (host, app, canvas) {
  let active = null

  // fresh: the box was just added; left empty, adding it is undone.
  function open (uid, { fresh = false } = {}) {
    close(true)
    const doc = app.getDoc()
    const row = doc && doc.texts.find(t => t._uid === uid)
    const drawn = canvas.textBox(uid)
    if (!row || !drawn) return false
    const m = canvas.content.getScreenCTM()
    const at = host.getBoundingClientRect()
    const k = m.a
    const l = drawn.layout
    const before = row.text
    const area = h('textarea', { class: 'text-edit', spellcheck: 'false', 'aria-label': 'Text', value: before })
    Object.assign(area.style, {
      left: `${m.e + drawn.x * k - at.left}px`,
      top: `${m.f + drawn.y * m.d - at.top}px`,
      width: `${drawn.width * k}px`,
      minHeight: `${drawn.height * k}px`,
      padding: `${l.pad * k}px`,
      fontFamily: l.font,
      fontSize: `${l.px * k}px`,
      fontWeight: String(l.weight),
      lineHeight: `${l.lineH * k}px`,
      textAlign: l.align,
      color: l.color,
      background: l.background || 'rgba(255, 255, 255, 0.9)'
    })
    host.append(area)
    const grow = () => { area.style.height = 'auto'; area.style.height = `${Math.max(drawn.height * k, area.scrollHeight)}px` }
    grow()
    area.addEventListener('input', grow)
    app.setTextEditing(uid)
    area.focus()
    area.select()
    const finish = commit => {
      if (!active || active.area !== area) return
      active = null
      area.remove()
      app.setTextEditing(null)
      const value = area.value.replace(/\s+$/, '')
      // A new box that is left empty, or cancelled, is not added after all.
      if (fresh && (!commit || !value.trim()) && app.store.undoLabel() === 'Add text' && app.getDoc().texts.at(-1)?._uid === uid) app.store.undo()
      else if (commit && !value.trim()) app.removeTexts([uid], 'Delete text')
      else if (commit && value !== before) app.updateTexts([uid], { text: value }, 'Edit text')
      canvas.svg.focus({ preventScroll: true })
    }
    area.addEventListener('keydown', e => {
      const shortcut = shortcutIn(e, area.value === before)
      if (shortcut) { finish(shortcut === 'commit'); return }
      e.stopPropagation()
      if (e.key === 'Escape') { e.preventDefault(); finish(false) }
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); finish(true) }
    })
    area.addEventListener('blur', () => finish(true))
    active = { area, finish }
    return true
  }

  function close (commit = true) { if (active) active.finish(commit) }

  return { open, close, get isOpen () { return !!active } }
}
