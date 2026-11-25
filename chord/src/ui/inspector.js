// The right-hand panel. Shows what is selected and lets you edit it in place:
//   nothing selected → diagram settings, grouped by what they change
//   one flow (or ribbon) / node / group / carrier / scenario / detail → its fields
//   several items → bulk actions

import { h, icon, clear } from '../../../shared/src/dom.js'
import { textField, textAreaField, numberField, colorField, toggleField, selectField, segmentedField } from '../../../shared/src/fields.js'
import { iconField } from '../../../shared/src/iconField.js'
import { patternField } from '../../../shared/src/patternField.js'
import { iconOf, namedIcon } from '../../../shared/src/icons.js'
import { patternOf, fillOf } from '../../../shared/src/patterns.js'
import { SETTINGS, SETTING_GROUPS, FONT_CHOICES, PLACES, getSetting, isFiniteNumber, isVisible, hasLabel, carrierColor, hexColor, shownScenario, iconRows } from '../model/schema.js'
import { scenarioIdAllowed, scenarioNameTaken } from '../model/commands.js'
import { formatAmount, formatShare } from '../render/chord.js'
import { formatNumber } from '../../../shared/src/format.js'

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`
const trimmed = v => String(v ?? '').trim()
const NOUNS = { flows: ['flow', 'flows'], nodes: ['node', 'nodes'], groups: ['group', 'groups'], carriers: ['carrier', 'carriers'], scenarios: ['scenario', 'scenarios'], details: ['detail', 'details'] }

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
    const lists = { flow: 'flows', node: 'nodes', group: 'groups', carrier: 'carriers', scenario: 'scenarios', detail: 'details' }
    const picked = Object.entries(lists).flatMap(([mode, key]) => [...sel[key]].map(uid => ({ mode, uid })))
    let mode = !picked.length ? 'settings' : picked.length > 1 ? 'multi' : picked[0].mode
    const target = lists[mode] ? doc[lists[mode]].find(x => x._uid === picked[0].uid) : null
    if (lists[mode] && !target) { app.setSelection({}); return }
    // The rows of one ribbon are shown together.
    if (mode === 'multi' && picked.every(p => p.mode === 'flow') && app.ribbonOfAll(picked.map(p => p.uid))) mode = 'ribbon'
    // Forms that list nodes, groups, carriers or scenarios are rebuilt when those change.
    const refs = ['flow', 'ribbon', 'node', 'detail'].includes(mode)
      ? [doc.scenarios.map(s => `${s.id}|${s.title}`).join(), doc.nodes.map(n => `${n.id}|${n.title}`).join(), doc.groups.map(g => `${g.id}|${g.title}`).join(), doc.carriers.map(c => `${c.id}|${c.title}`).join(), getSetting(doc, 'unit'), getSetting(doc, 'multiply')].join(';')
      : mode === 'settings' ? doc.scenarios.map(s => `${s.id}|${s.title}`).join() : ''
    const key = `${mode}:${picked.map(p => p.uid).sort().join(',')}:${refs}`
    if (key !== formKey) {
      formKey = key
      bindings = []
      dynamics = []
      iconPicker = null
      const scroll = mode === 'settings' && root.dataset.mode === 'settings' ? root.scrollTop : 0
      clear(root)
      root.dataset.mode = mode
      const builders = { settings: buildSettings, flow: buildFlow, ribbon: buildRibbon, node: buildNode, group: buildGroup, carrier: buildCarrier, scenario: buildScenario, detail: buildDetail, multi: buildMulti }
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
  const link = (text, onclick) => h('button', { type: 'button', class: 'link-btn small field-wide', text, onclick })
  const moveButtons = (kind, uid) => h('div', { class: 'field-wide btn-row' },
    h('button', { type: 'button', class: 'btn btn-small', text: 'Move earlier', onclick: () => app.stepRow(kind, uid, -1) }),
    h('button', { type: 'button', class: 'btn btn-small', text: 'Move later', onclick: () => app.stepRow(kind, uid, 1) }))

  function section (title, children, { open = true, id } = {}) {
    return h('details', { class: 'insp-section', open, dataset: id ? { section: id } : {} },
      h('summary', {}, icon('chevron', 14), h('span', { text: title })),
      h('div', { class: 'insp-grid' }, children))
  }

  const pickIcon = field => { iconPicker = field; return bind(field, () => null) }
  const rows = () => iconRows(app.getDoc())
  const nodeName = (d, id) => { const n = d.nodes.find(x => x.id === id); return n ? n.title || n.id : id || '?' }
  const carrierOf = (d, id) => d.carriers.find(c => c.id === id)
  const unitSuffix = d => (getSetting(d, 'multiply') === 1 ? getSetting(d, 'unit') || undefined : undefined)

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
    if (def.control === 'segmented') {
      const el = bind(segmentedField({ ...common, value: value(app.getDoc()), options: def.options }), value)
      el.classList.add('field-wide')
      return el
    }
    if (def.type === 'select') return bind(selectField({ ...common, value: value(app.getDoc()), options: def.options, wide: def.key !== 'decimals' }), value)
    if (def.type === 'font') {
      const current = value(app.getDoc())
      const options = FONT_CHOICES.some(o => o.value === current) ? FONT_CHOICES : [...FONT_CHOICES, { value: current, label: current }]
      return bind(selectField({ ...common, value: current, options }), value)
    }
    return bind(textField({ ...common, value: value(app.getDoc()), placeholder: def.placeholder, live: true, wide: def.key !== 'unit' }), value)
  }

  const anyPattern = d => [...d.carriers, ...d.flows].some(r => trimmed(r.pattern))
  const manyGroups = d => d.groups.length > 1
  const HIDE = {
    fullCircle: d => getSetting(d, 'scaleMode') !== 'fixed',
    spacing: d => getSetting(d, 'scaleMode') === 'shown' || (getSetting(d, 'scaleMode') === 'largest' && d.scenarios.length < 2),
    groupGap: d => !d.groups.length,
    showScenario: d => d.scenarios.length < 2,
    discColor: d => !getSetting(d, 'showDisc'),
    showGroups: d => !d.groups.length,
    groupPlace: d => !d.groups.length || !getSetting(d, 'showGroups'),
    groupWidth: d => !d.groups.length || !getSetting(d, 'showGroups'),
    groupColor: d => !d.groups.length || !getSetting(d, 'showGroups'),
    groupBorder: d => !d.groups.length || !getSetting(d, 'showGroups'),
    showGroupNames: d => !d.groups.length || !getSetting(d, 'showGroups'),
    showDetails: d => !d.details.length,
    patternSize: d => !anyPattern(d),
    patternWeight: d => !anyPattern(d)
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
    out.push(h('p', { class: 'insp-hint', text: 'Nothing is selected, so these settings apply to the whole diagram. Click a flow, node or group to edit it.' }))
    SETTING_GROUPS.forEach(group => {
      if (group.id === 'scenario') { out.push(scenarioSection(doc)); return }
      const fields = SETTINGS.filter(s => s.group === group.id).map(def => {
        const el = settingField(def)
        if (HIDE[def.key]) dynamics.push(d => { el.hidden = HIDE[def.key](d) })
        return el
      })
      if (group.id === 'scale') fields.splice(2, 0, scaleReadout())
      if (group.id === 'nodes') fields.unshift(arrangeButtons())
      if (group.id === 'fills') {
        const hint = h('p', { class: 'field-help field-wide', text: 'Choose a pattern with a carrier or a flow.' })
        dynamics.push(d => { hint.hidden = anyPattern(d) })
        fields.push(hint)
      }
      out.push(section(group.label, fields, { id: group.id }))
    })
    return out
  }

  // Which scenario is shown; with a single one only how to add another.
  function scenarioSection (doc) {
    const add = h('button', { type: 'button', class: 'btn btn-small', onclick: () => app.addScenario() }, icon('plus', 14), 'Add a scenario')
    const shown = d => { const s = shownScenario(d); return s ? s._uid : '' }
    const options = doc.scenarios.map(s => ({ value: s._uid, label: s.title || s.id }))
    const short = options.length <= 5 && options.every(o => o.label.length <= 8)
    const fields = []
    if (options.length > 1) {
      const el = bind((short ? segmentedField : selectField)({ label: 'Show', value: shown(doc), options, onCommit: v => app.showScenario(v) }), shown)
      el.classList.add('field-wide')
      fields.push(el)
    }
    fields.push(h('div', { class: 'field-wide' }, add))
    return section('Scenario', fields, { id: 'scenario' })
  }

  function arrangeButtons () {
    const groupsBtn = h('button', { type: 'button', class: 'btn btn-small', text: 'Nodes and groups', title: 'Reorder groups too', onclick: () => app.arrange(true) })
    dynamics.push(d => { groupsBtn.hidden = !manyGroups(d) })
    return h('div', { class: 'field field-wide' },
      h('span', { class: 'field-label', text: 'Reorder for fewer crossings' }),
      h('div', { class: 'btn-row' }, h('button', { type: 'button', class: 'btn btn-small', text: 'Nodes', title: 'Reorder the nodes, within their groups', onclick: () => app.arrange(false) }), groupsBtn))
  }

  // The scale the diagram is drawn at, and a way to keep it for other diagrams.
  function scaleReadout () {
    const box = h('div', { class: 'scale-readout field-wide' })
    dynamics.push(d => {
      const res = app.canvas.result
      clear(box)
      if (!res || !res.layout || !(app.model.total > 0)) { box.hidden = true; return }
      box.hidden = false
      const part = app.model.total / res.full
      box.append(
        h('span', { class: 'scale-ring', style: { background: `conic-gradient(var(--accent) ${Math.round(part * 360)}deg, var(--border) 0)` } }),
        h('p', {}, 'A full circle is ', h('strong', { text: formatAmount(d, res.full) }), part < 0.9995 ? `; what is shown is ${formatNumber(part * 100, 0)}% of it.` : '.'),
        getSetting(d, 'scaleMode') !== 'fixed' ? h('button', { type: 'button', class: 'btn btn-small', text: 'Keep this scale', title: 'Fix the amount of a full circle', onclick: () => app.keepScale() }) : '')
    })
    return box
  }

  // ---- flows ----

  const nodeOptions = (d, current) => withMissing(d.nodes.map(n => ({ value: n.id, label: n.title && n.title !== n.id ? `${n.title} (${n.id})` : n.id })), current)
  const carrierOptions = (d, current) => withMissing(d.carriers.map(c => ({ value: c.id, label: c.title || c.id })), current)
  function withMissing (options, current) {
    return options.some(o => o.value === current) ? options : [{ value: current || '', label: current ? `${current} (missing)` : '— choose —' }, ...options]
  }

  // The amounts of rows, per scenario; several rows change in proportion.
  function amountFields (doc, uids) {
    const sum = (d, s) => { const list = d.flows.filter(f => uids.includes(f._uid)).map(f => f[s.id]).filter(isFiniteNumber); return list.length ? Math.round(list.reduce((a, b) => a + b, 0) * 1e6) / 1e6 : '' }
    const shown = shownScenario(doc)
    return doc.scenarios.filter(s => s.id).map(s => {
      const now = d => sum(d, d.scenarios.find(x => x._uid === s._uid) || s)
      const el = bind(numberField({
        label: doc.scenarios.length > 1 ? s.title || s.id : 'Value',
        value: now(doc),
        step: 'any',
        suffix: unitSuffix(doc),
        wide: doc.scenarios.length === 1,
        onCommit: (v, { live }) => app.edit('Change value', d => app.commands.setAmount(d, uids, (d.scenarios.find(x => x._uid === s._uid) || s).id, v), live ? { coalesce: `flow:${uids.join()}:${s._uid}` } : {})
      }), now)
      if (doc.scenarios.length > 1 && s === shown) el.classList.add('shown-scenario')
      return el
    })
  }

  // Icon and pattern of one or more flows.
  function lookFields (uids) {
    const own = (d, key) => { const list = [...new Set(d.flows.filter(f => uids.includes(f._uid)).map(f => trimmed(f[key])))]; return list.length === 1 ? list[0] : list.length ? null : '' }
    const first = d => d.flows.find(f => f._uid === uids[0]) || {}
    const carrier = () => carrierOf(app.getDoc(), first(app.getDoc()).carrier)
    const set = (label, patch) => app.edit(label, d => uids.reduce((acc, u) => app.commands.updateFlow(acc, u, patch), d))
    const iconEl = pickIcon(iconField({
      label: 'Icon',
      value: () => own(app.getDoc(), 'icon'),
      shown: () => { const v = own(app.getDoc(), 'icon'); const c = carrier(); return v ? namedIcon(v) : c ? iconOf({ id: c.id, icon: c.icon }) : null },
      rows,
      auto: { label: 'From the carrier', title: 'The icon of the carrier', text: 'from the carrier' },
      onCommit: v => set('Change icon', { icon: v })
    }))
    const hint = h('p', { class: 'field-help field-wide', text: 'Icons on flows are off: choose them under Flows in the settings.' })
    dynamics.push(d => { hint.hidden = getSetting(d, 'flowLabels') === 'icons' })
    return [
      bind(patternField({
        label: 'Pattern',
        value: () => own(app.getDoc(), 'pattern'),
        shown: () => patternOf(own(app.getDoc(), 'pattern') || '', (carrier() || {}).pattern),
        color: () => { const c = carrier(); return c ? carrierColor(app.getDoc(), c) : '#857F78' },
        style: () => getSetting(app.getDoc(), 'patternStyle'),
        auto: { label: 'From the carrier', title: 'The pattern of the carrier', text: 'from the carrier' },
        onCommit: v => set('Change pattern', { pattern: v }),
        mark: {
          value: () => own(app.getDoc(), 'patterncolor') || '',
          shown: () => fillOf({ pattern: own(app.getDoc(), 'pattern'), patterncolor: own(app.getDoc(), 'patterncolor') }, carrier()).mark,
          onCommit: (v, { live }) => app.edit('Change second colour', d => uids.reduce((acc, u) => app.commands.updateFlow(acc, u, { patterncolor: v }), d), live ? { coalesce: `flow:${uids[0]}:patterncolor` } : {})
        }
      }), () => null),
      iconEl,
      hint
    ]
  }

  const flowTitle = (d, f) => `${nodeName(d, f.source)} → ${nodeName(d, f.target)}`

  function buildFlow (doc, flow) {
    const uid = flow._uid
    const get = d => d.flows.find(x => x._uid === uid) || flow
    const edit = (label, patch) => app.edit(label, d => app.commands.updateFlow(d, uid, patch))
    const out = [header('Flow', flowTitle(doc, flow), [deleteButton('Delete flow')])]
    liveTitle(d => flowTitle(d, get(d)))
    out.push(section(doc.scenarios.length > 1 ? 'Amounts' : 'Amount', amountFields(doc, [uid])))
    const carrier = carrierOf(doc, flow.carrier)
    out.push(section('Flow', [
      bind(selectField({ label: 'From', value: flow.source, options: nodeOptions(doc, flow.source), onCommit: v => edit('Change source', { source: v }) }), d => get(d).source),
      bind(selectField({ label: 'To', value: flow.target, options: nodeOptions(doc, flow.target), onCommit: v => edit('Change target', { target: v }) }), d => get(d).target),
      bind(selectField({ label: 'Carrier', value: flow.carrier, options: carrierOptions(doc, flow.carrier), onCommit: v => { app.lastCarrier = v; edit('Change carrier', { carrier: v }) } }), d => get(d).carrier),
      bind(textField({ label: 'Part', value: flow.part, help: 'Only needed when a flow is made of several rows: they are listed in its tooltip.', onCommit: v => edit('Change part', { part: v }) }), d => get(d).part),
      ...lookFields([uid]),
      carrier ? link(`Colour, pattern and icon of ${carrier.title || carrier.id}`, () => app.setSelection({ carriers: [carrier._uid] })) : null,
      link('Swap source and target', () => app.edit('Swap flow', d => app.commands.updateFlow(d, uid, { source: get(d).target, target: get(d).source }))),
      bind(textAreaField({ label: 'Note', value: flow.note, placeholder: 'Shown when hovering the flow', onCommit: v => edit('Edit note', { note: v }) }), d => get(d).note)
    ]))
    const info = h('p', { class: 'field-help' })
    dynamics.push(d => { const r = app.ribbonInfo(uid); info.textContent = r ? `${formatShare(r.ribbon.value / r.total)} of everything that is shown.` : 'Not drawn: no amount in this scenario, hidden, or listed in the Issues tab.' })
    out.push(info)
    return out
  }

  // ---- a ribbon made of several rows ----

  function buildRibbon (doc, _target, sel) {
    const uids = [...sel.flows]
    const first = d => d.flows.find(f => f._uid === uids[0]) || {}
    const out = [header('Flow', flowTitle(doc, first(doc)), [deleteButton('Delete these flows')])]
    liveTitle(d => flowTitle(d, first(d)))
    out.push(section(doc.scenarios.length > 1 ? 'Amounts' : 'Amount', [...amountFields(doc, uids), h('p', { class: 'field-help field-wide', text: `Made of ${uids.length} rows, which change in proportion.` })]))
    const box = h('div', { class: 'flow-summary field-wide' })
    dynamics.push(d => {
      const s = shownScenario(d)
      const list = uids.map(u => d.flows.find(f => f._uid === u)).filter(Boolean).sort((a, b) => (b[s.id] || 0) - (a[s.id] || 0))
      clear(box).append(h('div', { class: 'flow-list' }, list.map(f => h('button', { type: 'button', class: 'flow-row', title: 'Select this row', onclick: () => app.setSelection({ flows: [f._uid] }) },
        h('span', { class: 'flow-row-name', text: f.part || '(no part)' }), h('span', { class: 'flow-row-value', text: isFiniteNumber(f[s.id]) ? formatAmount(d, f[s.id] * (getSetting(d, 'multiply') || 1)) : '' })))))
    })
    out.push(section('Made of', [box]))
    const carrier = carrierOf(doc, first(doc).carrier)
    out.push(section('Look', [...lookFields(uids), carrier ? link(`Colour, pattern and icon of ${carrier.title || carrier.id}`, () => app.setSelection({ carriers: [carrier._uid] })) : null]))
    return out
  }

  // ---- node ----

  function flowList (d, match) {
    const model = app.model
    const list = model ? model.ribbons.filter(match).sort((a, b) => b.value - a.value) : []
    return list.length ? h('div', { class: 'flow-list' }, list.map(r => h('button', { type: 'button', class: 'flow-row', title: 'Select this flow', onclick: () => { app.setSelection({ flows: r.uids }); app.reveal(r.uids) } },
      h('span', { class: 'dot', style: { background: r.color } }),
      h('span', { class: 'flow-row-name', text: `${nodeName(d, r.source)} → ${nodeName(d, r.target)}` }),
      h('span', { class: 'flow-row-value', text: formatAmount(d, r.value, { unit: false }) })))) : h('p', { class: 'muted small', text: 'No flows in this scenario.' })
  }

  function buildNode (doc, node) {
    const uid = node._uid
    const get = d => d.nodes.find(x => x._uid === uid) || node
    const edit = (label, patch, live) => app.edit(label, d => app.commands.updateNode(d, uid, patch), live ? { coalesce: `node:${uid}:${Object.keys(patch)[0]}` } : {})
    const out = [header('Node', node.title || node.id, [deleteButton('Delete node and its flows')])]
    liveTitle(d => get(d).title || get(d).id)
    const groupList = h('datalist', { id: 'insp-groups' })
    dynamics.push(d => clear(groupList).append(...d.groups.map(g => h('option', { value: g.id, label: g.title || '' }))))
    const own = d => hexColor(get(d).color)
    const auto = d => { const m = app.model && app.model.nodeByUid.get(uid); return own(d) || (m ? m.color : getSetting(d, 'nodeColor')) }
    const clearColor = link('Back to the automatic colour', () => edit('Change node colour', { color: '' }))
    dynamics.push(d => { clearColor.hidden = !own(d) })
    const place = link('Back to the automatic place of its label', () => edit('Move label', { labelx: '', labely: '' }))
    dynamics.push(d => { place.hidden = !(Math.abs(Number(get(d).labelx) || 0) + Math.abs(Number(get(d).labely) || 0) > 0) })
    out.push(section('Node', [
      bind(textField({ label: 'Title', value: node.title, live: true, onCommit: (v, { live }) => edit('Rename node', { title: v }, live) }), d => get(d).title),
      bind(textField({
        label: 'ID',
        value: node.id,
        mono: true,
        validate: v => (!v.trim() ? 'An ID is required' : app.getDoc().nodes.some(x => x.id === v.trim() && x._uid !== uid) ? 'Another node already has this ID' : null),
        help: 'Flows refer to this ID. Renaming keeps them attached.',
        onCommit: v => edit('Change node ID', { id: v.trim() })
      }), d => get(d).id),
      bind(textField({ label: 'Group', value: node.group, list: 'insp-groups', help: 'Optional. Nodes of one group stand together, with its arc around them.', onCommit: v => edit('Change group', { group: v.trim() }) }), d => get(d).group),
      groupList,
      pickIcon(iconField({ label: 'Icon', value: () => get(app.getDoc()).icon, shown: () => iconOf({ id: get(app.getDoc()).id, icon: get(app.getDoc()).icon }), rows, onCommit: v => edit('Change icon', { icon: v }) })),
      bind(colorField({ label: 'Colour', value: auto(doc), onCommit: (v, { live }) => edit('Change node colour', { color: v }, live) }), auto),
      clearColor,
      bind(toggleField({ label: 'Arc and label of its own', value: hasLabel(node), help: 'Without, it is only a part of its group: its flows end at the arc of a group inside the circle.', onCommit: v => edit(v ? 'Show label' : 'Hide label', { label: v }) }), d => hasLabel(get(d))),
      bind(toggleField({ label: 'Visible', value: isVisible(node), onCommit: () => app.toggleVisible(uid) }), d => isVisible(get(d))),
      place,
      bind(textAreaField({ label: 'Note', value: node.note, placeholder: 'Shown when hovering the node', onCommit: v => edit('Edit note', { note: v }) }), d => get(d).note),
      moveButtons('nodes', uid)
    ]))
    const details = h('div', { class: 'field-wide detail-list' })
    dynamics.push(d => {
      const s = shownScenario(d)
      const list = d.details.filter(x => x.node === get(d).id)
      clear(details).append(
        ...list.map(x => h('button', { type: 'button', class: 'flow-row', title: 'Edit this line', onclick: () => app.setSelection({ details: [x._uid] }) }, h('span', { class: 'flow-row-name', text: x.title || '(no title)' }), h('span', { class: 'flow-row-value', text: s && isFiniteNumber(x[s.id]) ? formatAmount(d, x[s.id] * (getSetting(d, 'multiply') || 1), { unit: false }) : '' }))),
        h('button', { type: 'button', class: 'btn btn-ghost btn-small', onclick: () => app.addDetail({ node: get(d).id, focus: true }) }, icon('plus', 14), 'Add a line under its label'))
    })
    out.push(section('Details', [details]))
    const box = h('div', { class: 'flow-summary field-wide' })
    dynamics.push(d => {
      const m = app.model && app.model.nodeByUid.get(uid)
      clear(box).append(
        h('div', { class: 'mix-total' }, h('span', { text: 'In' }), h('strong', { text: formatAmount(d, m ? m.into : 0) })),
        h('div', { class: 'mix-total' }, h('span', { text: 'Out' }), h('strong', { text: formatAmount(d, m ? m.out : 0) })),
        flowList(d, r => r.source === get(d).id || r.target === get(d).id))
    })
    out.push(section('Flows', [box]))
    return out
  }

  // ---- group ----

  function buildGroup (doc, group) {
    const uid = group._uid
    const get = d => d.groups.find(x => x._uid === uid) || group
    const edit = (label, patch, live) => app.edit(label, d => app.commands.updateGroup(d, uid, patch), live ? { coalesce: `group:${uid}:${Object.keys(patch)[0]}` } : {})
    const out = [header('Group', group.title || group.id, [deleteButton('Delete group (its nodes stay)')])]
    liveTitle(d => get(d).title || get(d).id)
    const color = d => hexColor(get(d).color) || getSetting(d, 'groupColor')
    const clearColor = link('Back to the colour of all groups', () => edit('Change group colour', { color: '' }))
    dynamics.push(d => { clearColor.hidden = !hexColor(get(d).color) })
    out.push(section('Group', [
      bind(textField({ label: 'Title', value: group.title, live: true, onCommit: (v, { live }) => edit('Rename group', { title: v }, live) }), d => get(d).title),
      bind(textField({
        label: 'ID',
        value: group.id,
        mono: true,
        validate: v => (!v.trim() ? 'An ID is required' : app.getDoc().groups.some(x => x.id === v.trim() && x._uid !== uid) ? 'Another group already has this ID' : null),
        help: 'Nodes refer to this ID. Renaming keeps them in the group.',
        onCommit: v => edit('Change group ID', { id: v.trim() })
      }), d => get(d).id),
      bind(selectField({ label: 'Place of its arc', value: trimmed(group.place).toLowerCase(), options: [{ value: '', label: 'As set for all groups' }, ...PLACES], onCommit: v => edit('Move arc', { place: v }) }), d => trimmed(get(d).place).toLowerCase()),
      bind(colorField({ label: 'Colour', value: color(doc), onCommit: (v, { live }) => edit('Change group colour', { color: v }, live) }), color),
      clearColor,
      moveButtons('groups', uid)
    ]))
    const box = h('div', { class: 'field-wide detail-list' })
    dynamics.push(d => {
      clear(box).append(
        ...d.nodes.filter(n => n.group === get(d).id).map(n => { const m = app.model && app.model.nodeByUid.get(n._uid); return h('button', { type: 'button', class: 'flow-row', onclick: () => { app.setSelection({ nodes: [n._uid] }); app.reveal([n._uid]) } }, h('span', { class: 'flow-row-name', text: n.title || n.id }), h('span', { class: 'flow-row-value', text: m ? formatAmount(d, m.amount, { unit: false }) : '' })) }),
        h('button', { type: 'button', class: 'btn btn-ghost btn-small', onclick: () => app.addNode({ group: get(d).id }) }, icon('plus', 14), 'Add node'))
    })
    out.push(section('Nodes', [box]))
    return out
  }

  // ---- carrier ----

  function buildCarrier (doc, carrier) {
    const uid = carrier._uid
    const get = d => d.carriers.find(x => x._uid === uid) || carrier
    const edit = (label, patch, live) => app.edit(label, d => app.commands.updateCarrier(d, uid, patch), live ? { coalesce: `carrier:${uid}:${Object.keys(patch)[0]}` } : {})
    const out = [header('Carrier', carrier.title || carrier.id, [deleteButton('Delete carrier and its flows')])]
    liveTitle(d => get(d).title || get(d).id)
    out.push(section('Carrier', [
      bind(textField({ label: 'Title', value: carrier.title, live: true, onCommit: (v, { live }) => edit('Edit carrier title', { title: v }, live) }), d => get(d).title),
      bind(textField({
        label: 'ID',
        value: carrier.id,
        mono: true,
        validate: v => (!v.trim() ? 'An ID is required' : app.getDoc().carriers.some(x => x.id === v.trim() && x._uid !== uid) ? 'Another carrier already has this ID' : null),
        help: 'Renaming updates every flow that uses it.',
        onCommit: v => edit('Rename carrier', { id: v.trim() })
      }), d => get(d).id),
      bind(colorField({ label: 'Colour', value: carrierColor(doc, carrier), onCommit: (v, { live }) => edit('Change carrier colour', { color: v }, live) }), d => carrierColor(d, get(d))),
      bind(patternField({ value: () => get(app.getDoc()).pattern, shown: () => patternOf(get(app.getDoc()).pattern), color: () => carrierColor(app.getDoc(), get(app.getDoc())), style: () => getSetting(app.getDoc(), 'patternStyle'), onCommit: v => edit('Change pattern', { pattern: v }), mark: { value: () => get(app.getDoc()).patterncolor, shown: () => fillOf(get(app.getDoc())).mark, onCommit: (v, { live }) => edit('Change second colour', { patterncolor: v }, live) } }), () => null),
      pickIcon(iconField({ label: 'Icon', value: () => get(app.getDoc()).icon, shown: () => { const c = get(app.getDoc()); return iconOf({ id: c.id, icon: c.icon }) }, rows, onCommit: v => edit('Change icon', { icon: v }) })),
      bind(toggleField({ label: 'Visible', value: isVisible(carrier), onCommit: () => app.toggleVisible(uid) }), d => isVisible(get(d))),
      moveButtons('carriers', uid)
    ]))
    const box = h('div', { class: 'flow-summary field-wide' })
    dynamics.push(d => {
      const total = app.model ? app.model.ribbons.filter(r => r.carrier.uid === uid).reduce((t, r) => t + r.value, 0) : 0
      clear(box).append(h('div', { class: 'mix-total' }, h('span', { text: 'Total' }), h('strong', { text: formatAmount(d, total) })), flowList(d, r => r.carrier.uid === uid))
    })
    out.push(section('Flows', [box]))
    return out
  }

  // ---- scenario ----

  function buildScenario (doc, scenario) {
    const uid = scenario._uid
    const get = d => d.scenarios.find(x => x._uid === uid) || scenario
    const out = [header('Scenario', scenario.title || scenario.id, [h('button', { class: 'icon-btn danger', type: 'button', title: 'Delete scenario and its amounts (Delete)', 'aria-label': 'Delete scenario and its amounts', onclick: () => app.deleteSelection() }, icon('trash'))])]
    liveTitle(d => get(d).title || get(d).id)
    const show = h('button', { type: 'button', class: 'btn btn-small', text: 'Show in the diagram', onclick: () => app.showScenario(uid) })
    dynamics.push(d => { show.disabled = shownScenario(d)._uid === uid; show.textContent = show.disabled ? 'Shown in the diagram' : 'Show in the diagram' })
    out.push(section('Scenario', [
      bind(textField({ label: 'Title', value: scenario.title, validate: v => (!v.trim() ? 'A name is required' : scenarioNameTaken(app.getDoc(), uid, v) ? 'Another scenario already has this name' : null), onCommit: v => app.renameScenario(uid, v) }), d => get(d).title),
      bind(textField({
        label: 'Data column',
        value: scenario.id,
        mono: true,
        validate: v => (scenarioIdAllowed(app.getDoc(), uid, v.trim()) ? null : 'Use a name that is not empty, a column of the table itself, or another scenario’s'),
        help: 'The column of the flows table. Renaming moves its amounts along.',
        onCommit: v => app.edit('Rename data column', d => app.commands.updateScenario(d, uid, { id: v.trim() }))
      }), d => get(d).id),
      h('div', { class: 'field-wide btn-row' }, show),
      moveButtons('scenarios', uid)
    ]))
    const box = h('div', { class: 'flow-summary field-wide' })
    dynamics.push(d => { const total = d.flows.reduce((t, f) => t + (isFiniteNumber(f[get(d).id]) ? f[get(d).id] : 0), 0) * (getSetting(d, 'multiply') || 1); clear(box).append(h('div', { class: 'mix-total' }, h('span', { text: 'Total' }), h('strong', { text: formatAmount(d, total) }))) })
    out.push(section('Amounts', [box]))
    return out
  }

  // ---- detail: a line under the label of a node ----

  function buildDetail (doc, detail) {
    const uid = detail._uid
    const get = d => d.details.find(x => x._uid === uid) || detail
    const edit = (label, patch, live) => app.edit(label, d => app.commands.updateDetail(d, uid, patch), live ? { coalesce: `detail:${uid}:${Object.keys(patch)[0]}` } : {})
    const title = d => `${nodeName(d, get(d).node)}: ${get(d).title || '(no title)'}`
    const out = [header('Detail', title(doc), [deleteButton('Delete this line')])]
    liveTitle(title)
    const node = doc.nodes.find(n => n.id === detail.node)
    out.push(section('Detail', [
      bind(textField({ label: 'Title', value: detail.title, live: true, onCommit: (v, { live }) => edit('Edit detail', { title: v }, live) }), d => get(d).title),
      bind(selectField({ label: 'Under the label of', value: detail.node, options: nodeOptions(doc, detail.node), onCommit: v => edit('Move detail', { node: v }) }), d => get(d).node),
      node ? link(`Back to ${node.title || node.id}`, () => app.setSelection({ nodes: [node._uid] })) : null
    ]))
    out.push(section('Amounts', doc.scenarios.filter(s => s.id).map(s => bind(numberField({ label: doc.scenarios.length > 1 ? s.title || s.id : 'Value', value: detail[s.id], step: 'any', suffix: unitSuffix(doc), onCommit: (v, { live }) => edit('Change detail', { [s.id]: v }, live) }), d => get(d)[s.id]))))
    return out
  }

  // ---- several ----

  function buildMulti (doc, _target, sel) {
    const parts = Object.keys(NOUNS).filter(k => sel[k].size).map(k => plural(sel[k].size, ...NOUNS[k]))
    const out = [header('Selection', parts.join(', '), [deleteButton('Delete selection')])]
    const flows = [...sel.flows]
    const nodes = [...sel.nodes]
    if (flows.length) {
      const setAll = (label, patch) => app.edit(label, d => flows.reduce((acc, u) => app.commands.updateFlow(acc, u, patch), d))
      const total = h('p', { class: 'field-help field-wide' })
      dynamics.push(d => { const s = shownScenario(d); total.textContent = `Together ${formatAmount(d, d.flows.filter(f => flows.includes(f._uid) && isFiniteNumber(f[s.id])).reduce((t, f) => t + f[s.id], 0) * (getSetting(d, 'multiply') || 1))}.` })
      out.push(section('Flows', [
        total,
        selectField({ label: 'Set carrier for all', value: '', options: [{ value: '', label: '— choose —' }, ...doc.carriers.map(c => ({ value: c.id, label: c.title || c.id }))], onCommit: v => { if (v) setAll('Change carriers', { carrier: v }) } }).el,
        ...lookFields(flows)
      ]))
    }
    if (nodes.length) {
      const setAll = (label, patch) => app.edit(label, d => nodes.reduce((acc, u) => app.commands.updateNode(acc, u, patch), d))
      out.push(section('Nodes', [
        textField({ label: 'Group', value: '', placeholder: 'Set one group for all', onCommit: v => { if (v.trim()) setAll('Change group', { group: v.trim() }) } }).el,
        segmentedField({ label: 'Visible', value: null, options: [{ value: 'on', label: 'Show' }, { value: 'off', label: 'Hide' }], onCommit: v => setAll('Change visibility', { visible: v === 'on' }) }).el,
        segmentedField({ label: 'Label', value: null, options: [{ value: 'on', label: 'Show' }, { value: 'off', label: 'Hide' }], onCommit: v => setAll('Change labels', { label: v === 'on' }) }).el
      ]))
    }
    return out
  }

  return { render, openIconPicker: () => { if (iconPicker) iconPicker.open() }, reset: () => { formKey = null } }
}
