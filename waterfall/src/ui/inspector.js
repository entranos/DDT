// The right-hand panel. Shows what is selected and lets you edit it in place:
//   nothing selected → diagram settings, grouped by what they change
//   one row of values / diagram / moment / carrier → its fields
//   several items → bulk actions

import { h, icon, clear } from '../../../shared/src/dom.js'
import { textField, textAreaField, numberField, colorField, toggleField, selectField, segmentedField } from '../../../shared/src/fields.js'
import { iconField } from '../../../shared/src/iconField.js'
import { patternField } from '../../../shared/src/patternField.js'
import { patternOf, fillOf } from '../../../shared/src/patterns.js'
import { iconOf } from '../../../shared/src/icons.js'
import { SETTINGS, SETTING_GROUPS, FONT_CHOICES, getSetting, isFiniteNumber, isVisible, carrierColor, iconRows } from '../model/schema.js'
import { momentIdAllowed, momentNameTaken } from '../model/commands.js'
import { formatAmount } from '../render/waterfall.js'
import { formatNumber } from '../../../shared/src/format.js'

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`

export function createInspector (root, app) {
  let formKey = null
  let bindings = [] // { get(doc), update(value) }
  let dynamics = [] // (doc) => void
  let iconPicker = null

  function bind (field, get) {
    bindings.push({ get, update: field.update })
    return field.el
  }

  function render () {
    const doc = app.getDoc()
    const sel = app.selection
    if (!doc) { clear(root); formKey = null; return }
    const lists = { diagram: 'diagrams', moment: 'moments', carrier: 'carriers', value: 'values' }
    const picked = Object.entries(lists).flatMap(([mode, key]) => [...sel[key]].map(uid => ({ mode, uid })))
    const mode = !picked.length ? 'settings' : picked.length > 1 ? 'multi' : picked[0].mode
    const target = lists[mode] ? doc[lists[mode]].find(x => x._uid === picked[0].uid) : null
    if (lists[mode] && !target) { app.setSelection({}); return }
    // Forms that list moments, diagrams or carriers are rebuilt when those change.
    const names = mode === 'settings' ? doc.diagrams.map(d => d._uid).join() : [doc.moments.map(m => `${m.id}|${m.title}|${isVisible(m)}`).join(), doc.diagrams.map(d => d.id + d.title).join(), doc.carriers.map(c => c.id + c.title).join(), getSetting(doc, 'unit'), getSetting(doc, 'multiply')].join(';')
    const key = `${mode}:${picked.map(p => p.uid).sort().join(',')}:${mode === 'value' || mode === 'settings' ? names : ''}`
    if (key !== formKey) {
      formKey = key
      bindings = []
      dynamics = []
      iconPicker = null
      const scroll = mode === 'settings' && root.dataset.mode === 'settings' ? root.scrollTop : 0
      clear(root)
      root.dataset.mode = mode
      const builders = { settings: buildSettings, diagram: buildDiagram, moment: buildMoment, carrier: buildCarrier, value: buildValue, multi: buildMulti }
      root.append(...[builders[mode](doc, target, sel)].flat())
      root.scrollTop = scroll
    }
    bindings.forEach(b => b.update(b.get(app.getDoc())))
    dynamics.forEach(fn => fn(app.getDoc()))
  }

  function header (kind, title, actions = []) {
    return h('div', { class: 'insp-head' },
      h('div', { class: 'insp-kind', text: kind }),
      h('div', { class: 'insp-title-row' }, h('h2', { class: 'insp-title', text: title }), h('div', { class: 'insp-actions' }, actions))
    )
  }
  const deleteButton = label => h('button', { class: 'icon-btn danger', type: 'button', title: `${label} (Delete)`, 'aria-label': label, onclick: () => app.deleteSelection() }, icon('trash'))
  const liveTitle = get => dynamics.push(d => { const t = root.querySelector('.insp-title'); if (t) t.textContent = get(d) })

  function section (title, children, { open = true, id } = {}) {
    return h('details', { class: 'insp-section', open, dataset: id ? { section: id } : {} },
      h('summary', {}, icon('chevron', 14), h('span', { text: title })),
      h('div', { class: 'insp-grid' }, children))
  }

  // ---- settings ----

  function settingField (def) {
    const commit = (v, { live }) => app.setSetting(def.key, v, live)
    const value = doc => getSetting(doc, def.key)
    const common = { label: def.label, help: def.help, onCommit: commit }
    if (def.type === 'number') {
      return bind(numberField({ ...common, value: value(app.getDoc()), min: def.min, max: def.max, step: def.step, suffix: def.suffix, integer: def.step === 1, wide: !!def.wide }), value)
    }
    if (def.type === 'color') return bind(colorField({ ...common, value: value(app.getDoc()) }), value)
    if (def.type === 'boolean') return bind(toggleField({ ...common, value: value(app.getDoc()) }), value)
    if (def.type === 'select') return bind(selectField({ ...common, value: value(app.getDoc()), options: def.options, wide: def.key !== 'decimals' }), value)
    if (def.type === 'font') {
      const current = value(app.getDoc())
      const options = FONT_CHOICES.some(o => o.value === current) ? FONT_CHOICES : [...FONT_CHOICES, { value: current, label: current }]
      return bind(selectField({ ...common, value: current, options }), value)
    }
    return bind(textField({ ...common, value: value(app.getDoc()), placeholder: def.placeholder, live: true, wide: def.key !== 'unit' }), value)
  }

  function buildSettings (doc) {
    // The heading is the diagram title itself: edit it here, on the canvas or in the Title section.
    const titleInput = h('input', {
      class: 'insp-title insp-title-input',
      type: 'text',
      value: getSetting(doc, 'title'),
      placeholder: 'Untitled diagram',
      spellcheck: 'false',
      autocomplete: 'off',
      'aria-label': 'Diagram title',
      title: 'Diagram title (click to edit)'
    })
    titleInput.addEventListener('input', () => app.setSetting('title', titleInput.value, true))
    titleInput.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === 'Escape') titleInput.blur() })
    bindings.push({ get: d => getSetting(d, 'title'), update: v => { if (document.activeElement !== titleInput) titleInput.value = v ?? '' } })
    const out = [h('div', { class: 'insp-head' },
      h('div', { class: 'insp-kind', text: 'Diagram' }),
      h('div', { class: 'insp-title-row' }, titleInput))]
    out.push(h('p', { class: 'insp-hint', text: 'Nothing is selected, so these settings apply to the whole diagram. Click a bar, year or name to edit it.' }))
    SETTING_GROUPS.forEach(group => {
      const fields = SETTINGS.filter(s => s.group === group.id).map(def => {
        const el = settingField(def)
        if (def.key === 'pxPerUnit') dynamics.push(d => { el.hidden = getSetting(d, 'scaleMode') !== 'fixed' })
        if (def.key === 'axisSync' || def.key === 'diagramGap') dynamics.push(d => { el.hidden = d.diagrams.filter(isVisible).length < 2 })
        return el
      })
      if (group.id === 'diagrams') fields.unshift(diagramChoice(doc))
      if (group.id === 'scale') fields.splice(2, 0, scaleReadout())
      out.push(section(group.label, fields, { id: group.id }))
    })
    return out
  }

  // Which diagrams are shown: both above each other, or one of them.
  function diagramChoice (doc) {
    const add = h('button', { type: 'button', class: 'btn btn-small', onclick: () => app.addDiagram() }, icon('plus', 14), doc.diagrams.length === 1 ? 'Add a second diagram' : 'Add a diagram')
    const box = h('div', { class: 'diagram-choice field-wide' })
    if (doc.diagrams.length === 2) {
      const value = d => { const shown = d.diagrams.filter(isVisible); return shown.length === 2 ? 'both' : shown.length === 1 ? shown[0]._uid : '' }
      const options = [{ value: 'both', label: 'Both' }, ...doc.diagrams.map(d => ({ value: d._uid, label: app.diagramName(d) }))]
      box.append(bind(segmentedField({ label: 'Show', value: value(doc), options, onCommit: v => app.showDiagrams(v === 'both' ? doc.diagrams.map(d => d._uid) : [v]) }), value))
      dynamics.push(d => box.querySelectorAll('.seg').forEach((b, i) => { if (i > 0 && d.diagrams[i - 1]) b.textContent = app.diagramName(d.diagrams[i - 1]) }))
    } else {
      doc.diagrams.forEach(row => box.append(bind(toggleField({ label: app.diagramName(row), value: isVisible(row), onCommit: () => app.toggleVisible(row._uid) }), d => isVisible(d.diagrams.find(x => x._uid === row._uid) || row))))
    }
    box.append(add)
    return box
  }

  // The scale the diagrams are drawn at, and a way to keep it for other diagrams.
  function scaleReadout () {
    const box = h('div', { class: 'scale-readout field-wide' })
    dynamics.push(d => {
      const res = app.canvas.result
      clear(box)
      if (!res || !res.perUnit) { box.hidden = true; return }
      box.hidden = false
      const per = res.perUnit
      const unit = getSetting(d, 'unit') || 'unit'
      const n = per >= 1 ? 1 : 10 ** Math.ceil(Math.log10(1 / per))
      box.append(
        h('span', { class: 'scale-stick', style: { height: `${Math.max(1, Math.min(34, n * per))}px` } }),
        h('p', {}, `${formatNumber(n, 0)} ${unit} is drawn `, h('strong', { text: `${formatNumber(n * per, 1)} px` }), ' high.'),
        getSetting(d, 'scaleMode') === 'fit'
          ? (getSetting(d, 'axisSync') === 'own' && d.diagrams.filter(isVisible).length > 1 ? '' : h('button', { type: 'button', class: 'btn btn-small', text: 'Keep this scale', title: 'Switch to fixed pixels per unit, at the current size', onclick: () => app.keepScale() }))
          : (res.fits ? '' : h('p', { class: 'warn-text', text: 'At this scale the diagram doesn’t fit the canvas.' })))
    })
    return box
  }

  // ---- shared parts ----

  // Amounts of a set of rows per moment, as a small table: label and one number per moment.
  function amountTable (d, rows) {
    const moments = d.moments.filter(m => isVisible(m) && m.id)
    const multiply = getSetting(d, 'multiply') || 1
    if (!rows.length || !moments.length) return h('p', { class: 'muted small', text: 'No values yet.' })
    return h('div', { class: 'amount-table-wrap' }, h('table', { class: 'amount-table' },
      h('thead', {}, h('tr', {}, h('th', {}), moments.map(m => h('th', { class: 'num', text: m.title || m.id })))),
      h('tbody', {}, rows.map(r => h('tr', { class: r.total ? 'total' : '' },
        h('th', { scope: 'row' }, r.uids ? h('button', { type: 'button', class: 'link-btn', text: r.label, onclick: () => { app.setSelection({ values: r.uids }); app.reveal(r.uids) } }) : r.label),
        moments.map(m => h('td', { class: 'num', text: formatAmount(d, r.amount(m) * multiply, { unit: false }) })))))))
  }
  // A patterned fill, of a carrier or (not own) of one carrier's values in one diagram.
  // set(patch, label, live): changes that row.
  const patternFieldFor = (get, carrierOf, set, own) => bind(patternField({
    label: 'Pattern',
    value: () => get(app.getDoc()).pattern,
    shown: () => { const d = app.getDoc(); return patternOf(get(d).pattern, own ? '' : (carrierOf(d) || {}).pattern) },
    color: () => { const d = app.getDoc(); const c = carrierOf(d); return c ? carrierColor(d, c) : '#857F78' },
    style: () => getSetting(app.getDoc(), 'patternStyle'),
    auto: own ? null : { label: 'From the carrier', title: 'The pattern of the carrier', text: 'from the carrier' },
    onCommit: v => set({ pattern: v }, 'Change pattern', false),
    mark: {
      value: () => get(app.getDoc()).patterncolor,
      shown: () => { const d = app.getDoc(); return fillOf(get(d), own ? null : carrierOf(d)).mark },
      onCommit: (v, { live }) => set({ patterncolor: v }, 'Change second colour', live)
    }
  }), () => null)
  const sumOf = rows => m => rows.reduce((s, v) => s + (isFiniteNumber(v[m.id]) ? v[m.id] : 0), 0)

  // ---- values: one carrier in one diagram ----

  function buildValue (doc, value) {
    const uid = value._uid
    const get = d => d.values.find(x => x._uid === uid) || value
    const edit = (label, patch, live) => app.edit(label, d => app.commands.updateValue(d, uid, patch), live ? { coalesce: `value:${uid}:${Object.keys(patch)[0]}` } : {})
    const title = d => {
      const v = get(d)
      const dia = d.diagrams.find(x => x.id === v.diagram)
      const car = d.carriers.find(x => x.id === v.carrier)
      return `${dia ? app.diagramName(dia) : v.diagram || '?'}, ${car ? car.title || car.id : v.carrier || '?'}`
    }
    const out = [header('Values', title(doc), [deleteButton('Delete these values')])]
    liveTitle(title)
    const unit = getSetting(doc, 'multiply') === 1 ? getSetting(doc, 'unit') || undefined : undefined
    out.push(section('Amounts', doc.moments.filter(m => m.id).map(m => bind(numberField({ label: m.title || m.id, value: value[m.id], step: 'any', suffix: unit, onCommit: (v, { live }) => edit('Change amount', { [m.id]: v }, live) }), d => get(d)[m.id]))))

    const moments = doc.moments.filter(m => isVisible(m) && m.id)
    if (moments.length > 1) {
      const multiply = d => getSetting(d, 'multiply') || 1
      const change = (a, b) => d => Math.round((app.commands.amountOf(d, get(d).diagram, get(d).carrier, b.id) - app.commands.amountOf(d, get(d).diagram, get(d).carrier, a.id)) * multiply(d) * 1e6) / 1e6
      out.push(section('Changes', moments.slice(1).map((m, i) => {
        const read = change(moments[i], m)
        return bind(numberField({
          label: `${moments[i].title || moments[i].id} → ${m.title || m.id}`,
          value: read(doc),
          step: 'any',
          suffix: getSetting(doc, 'unit') || undefined,
          onCommit: (v, { live }) => app.edit('Change step', d => app.commands.setChange(d, get(d).diagram, get(d).carrier, moments[i].id, m.id, v / multiply(d)), live ? { coalesce: `change:${uid}:${m.id}` } : {})
        }), read)
      })))
    }
    const options = (rows, current, name) => (rows.some(r => r.id === current) ? [] : [{ value: current || '', label: current ? `${current} (missing)` : '— choose —' }]).concat(rows.map(r => ({ value: r.id, label: name(r) })))
    out.push(section('Belongs to', [
      bind(selectField({ label: 'Diagram', value: value.diagram, options: options(doc.diagrams, value.diagram, app.diagramName), onCommit: v => edit('Move values to another diagram', { diagram: v }) }), d => get(d).diagram),
      bind(selectField({ label: 'Carrier', value: value.carrier, options: options(doc.carriers, value.carrier, c => c.title || c.id), onCommit: v => edit('Change carrier', { carrier: v }) }), d => get(d).carrier),
      patternFieldFor(get, d => d.carriers.find(c => c.id === get(d).carrier), (patch, label, live) => edit(label, patch, live)),
      carrierButton(get),
      bind(textAreaField({ label: 'Note', value: value.note, placeholder: 'Shown when hovering its bars', onCommit: v => edit('Edit note', { note: v }) }), d => get(d).note)
    ]))
    return out
  }

  function carrierButton (get) {
    const btn = h('button', { type: 'button', class: 'link-btn small field-wide' })
    btn.addEventListener('click', () => { const d = app.getDoc(); const c = d.carriers.find(x => x.id === get(d).carrier); if (c) app.setSelection({ carriers: [c._uid] }) })
    dynamics.push(d => { const c = d.carriers.find(x => x.id === get(d).carrier); btn.hidden = !c; if (c) btn.textContent = `Colour, pattern and icon of ${c.title || c.id}` })
    return btn
  }

  // ---- diagram ----

  function buildDiagram (doc, diagram) {
    const uid = diagram._uid
    const get = d => d.diagrams.find(x => x._uid === uid) || diagram
    const edit = (label, patch, live) => app.edit(label, d => app.commands.updateDiagram(d, uid, patch), live ? { coalesce: `diagram:${uid}:${Object.keys(patch)[0]}` } : {})
    const out = [header('Diagram', app.diagramName(diagram), [deleteButton('Delete diagram and its values')])]
    liveTitle(d => app.diagramName(get(d)))
    out.push(section('Diagram', [
      bind(textField({ label: 'Title', value: diagram.title, live: true, onCommit: (v, { live }) => edit('Rename diagram', { title: v }, live) }), d => get(d).title),
      bind(textField({ label: 'Subtitle', value: diagram.subtitle, live: true, onCommit: (v, { live }) => edit('Edit diagram subtitle', { subtitle: v }, live) }), d => get(d).subtitle),
      bind(textField({
        label: 'ID',
        value: diagram.id,
        mono: true,
        validate: v => (!v.trim() ? 'An ID is required' : app.getDoc().diagrams.some(x => x.id === v.trim() && x._uid !== uid) ? 'Another diagram already has this ID' : null),
        help: 'Values refer to this ID. Renaming keeps them attached.',
        onCommit: v => edit('Change diagram ID', { id: v.trim() })
      }), d => get(d).id),
      bind(toggleField({ label: 'Visible', value: isVisible(diagram), onCommit: () => app.toggleVisible(uid) }), d => isVisible(get(d))),
      h('div', { class: 'field-wide btn-row' },
        h('button', { type: 'button', class: 'btn btn-small', text: 'Move up', onclick: () => app.stepRow('diagrams', uid, -1) }),
        h('button', { type: 'button', class: 'btn btn-small', text: 'Move down', onclick: () => app.stepRow('diagrams', uid, 1) }))
    ]))
    const box = h('div', { class: 'field-wide' })
    dynamics.push(d => {
      const rows = d.values.filter(v => v.diagram === get(d).id)
      const list = d.carriers.map(c => ({ c, own: rows.filter(v => v.carrier === c.id) })).filter(x => x.own.length)
      clear(box).append(amountTable(d, [...list.map(x => ({ label: x.c.title || x.c.id, uids: x.own.map(v => v._uid), amount: sumOf(x.own) })), ...(list.length ? [{ label: 'Total', total: true, amount: sumOf(rows) }] : [])]))
    })
    out.push(section('Amounts', [box]))
    return out
  }

  // ---- moment ----

  function buildMoment (doc, moment) {
    const uid = moment._uid
    const get = d => d.moments.find(x => x._uid === uid) || moment
    const edit = (label, patch, live) => app.edit(label, d => app.commands.updateMoment(d, uid, patch), live ? { coalesce: `moment:${uid}:${Object.keys(patch)[0]}` } : {})
    const out = [header('Moment', moment.title || moment.id, [deleteButton('Delete moment and its amounts')])]
    liveTitle(d => get(d).title || get(d).id)
    out.push(section('Moment', [
      bind(textField({ label: 'Title', value: moment.title, validate: v => (!v.trim() ? 'A name is required' : momentNameTaken(app.getDoc(), uid, v) ? 'Another moment already has this name' : null), onCommit: v => app.renameMoment(uid, v) }), d => get(d).title),
      bind(textField({
        label: 'Data column',
        value: moment.id,
        mono: true,
        validate: v => (momentIdAllowed(app.getDoc(), uid, v.trim()) ? null : 'Use a name that is not empty, a column of the table itself, or another moment’s'),
        help: 'The column of the values table. Renaming moves its amounts along.',
        onCommit: v => edit('Rename data column', { id: v.trim() })
      }), d => get(d).id),
      bind(toggleField({ label: 'Visible', value: isVisible(moment), help: 'Hidden, the steps go from the moment before to the one after.', onCommit: () => app.toggleVisible(uid) }), d => isVisible(get(d))),
      h('div', { class: 'field-wide btn-row' },
        h('button', { type: 'button', class: 'btn btn-small', text: 'Move earlier', onclick: () => app.stepRow('moments', uid, -1) }),
        h('button', { type: 'button', class: 'btn btn-small', text: 'Move later', onclick: () => app.stepRow('moments', uid, 1) }))
    ]))
    const box = h('div', { class: 'flow-summary field-wide' })
    dynamics.push(d => {
      const m = get(d)
      const multiply = getSetting(d, 'multiply') || 1
      clear(box).append(...d.diagrams.map(x => {
        const total = d.values.filter(v => v.diagram === x.id).reduce((s, v) => s + (isFiniteNumber(v[m.id]) ? v[m.id] : 0), 0) * multiply
        return h('div', { class: 'mix-total' }, h('span', { text: app.diagramName(x) }), h('strong', { text: formatAmount(d, total) }))
      }))
    })
    out.push(section('Totals', [box]))
    return out
  }

  // ---- carrier ----

  function buildCarrier (doc, carrier) {
    const uid = carrier._uid
    const get = d => d.carriers.find(x => x._uid === uid) || carrier
    const edit = (label, patch, live) => app.edit(label, d => app.commands.updateCarrier(d, uid, patch), live ? { coalesce: `carrier:${uid}:${Object.keys(patch)[0]}` } : {})
    const out = [header('Carrier', carrier.title || carrier.id, [deleteButton('Delete carrier and its values')])]
    liveTitle(d => get(d).title || get(d).id)
    iconPicker = iconField({ label: 'Icon', value: () => get(app.getDoc()).icon, shown: () => iconOf(get(app.getDoc())), rows: () => iconRows(app.getDoc()), onCommit: v => edit('Change icon', { icon: v }) })
    out.push(section('Carrier', [
      bind(textField({ label: 'Title', value: carrier.title, live: true, onCommit: (v, { live }) => edit('Edit carrier title', { title: v }, live) }), d => get(d).title),
      bind(textField({
        label: 'ID',
        value: carrier.id,
        mono: true,
        validate: v => (!v.trim() ? 'An ID is required' : app.getDoc().carriers.some(x => x.id === v.trim() && x._uid !== uid) ? 'Another carrier already has this ID' : null),
        help: 'Renaming updates every row that uses it.',
        onCommit: v => edit('Rename carrier', { id: v.trim() })
      }), d => get(d).id),
      bind(colorField({ label: 'Colour', value: carrierColor(doc, carrier), onCommit: (v, { live }) => edit('Change carrier colour', { color: v }, live) }), d => carrierColor(d, get(d))),
      patternFieldFor(get, get, (patch, label, live) => edit(label, patch, live), true),
      bind(iconPicker, () => null),
      h('div', { class: 'field-wide btn-row' },
        h('button', { type: 'button', class: 'btn btn-small', text: 'Move earlier', onclick: () => app.stepRow('carriers', uid, -1) }),
        h('button', { type: 'button', class: 'btn btn-small', text: 'Move later', onclick: () => app.stepRow('carriers', uid, 1) }))
    ]))
    const box = h('div', { class: 'field-wide' })
    dynamics.push(d => {
      const list = d.diagrams.map(x => ({ x, own: d.values.filter(v => v.diagram === x.id && v.carrier === get(d).id) })).filter(i => i.own.length)
      clear(box).append(amountTable(d, list.map(i => ({ label: app.diagramName(i.x), uids: i.own.map(v => v._uid), amount: sumOf(i.own) }))))
    })
    out.push(section('Amounts', [box]))
    return out
  }

  // ---- several ----

  function buildMulti (doc, _target, sel) {
    const diagrams = [...sel.diagrams]
    const moments = [...sel.moments]
    const carriers = [...sel.carriers]
    const values = [...sel.values]
    const parts = [diagrams.length && plural(diagrams.length, 'diagram', 'diagrams'), moments.length && plural(moments.length, 'moment', 'moments'), carriers.length && plural(carriers.length, 'carrier', 'carriers'), values.length && plural(values.length, 'row of values', 'rows of values')].filter(Boolean)
    const out = [header('Selection', parts.join(', '), [deleteButton('Delete selection')])]
    const shown = (label, uids, command) => segmentedField({ label, value: null, options: [{ value: 'on', label: 'Show' }, { value: 'off', label: 'Hide' }], onCommit: v => app.edit('Change visibility', d => uids.reduce((acc, u) => command(acc, u, { visible: v === 'on' }), d)) }).el
    if (diagrams.length) out.push(section('Diagrams', [shown('Visible', diagrams, app.commands.updateDiagram)]))
    if (moments.length) out.push(section('Moments', [shown('Visible', moments, app.commands.updateMoment)]))
    if (values.length) {
      const box = h('div', { class: 'field-wide' })
      dynamics.push(d => {
        const rows = d.values.filter(v => values.includes(v._uid))
        clear(box).append(amountTable(d, rows.length ? [{ label: 'Together', total: true, amount: sumOf(rows) }] : []))
      })
      const setAll = (label, patch) => app.edit(label, d => values.reduce((acc, u) => app.commands.updateValue(acc, u, patch), d))
      out.push(section('Values', [
        box,
        selectField({ label: 'Move to diagram', value: '', options: [{ value: '', label: '— choose —' }, ...doc.diagrams.map(d => ({ value: d.id, label: app.diagramName(d) }))], onCommit: v => { if (v) setAll('Move values to another diagram', { diagram: v }) } }).el
      ]))
    }
    return out
  }

  return { render, openIconPicker: () => { if (iconPicker) iconPicker.open() }, reset: () => { formKey = null } }
}

