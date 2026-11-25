// The right-hand panel. Shows what is selected and lets you edit it in place:
//   nothing selected → diagram settings, grouped by what they change
//   one node / flow / carrier → its fields
//   several items → bulk actions (arrange, label side, carrier, delete)

import { h, icon, clear } from '../../../shared/src/dom.js'
import { textField, textAreaField, numberField, colorField, toggleField, selectField, segmentedField } from '../../../shared/src/fields.js'
import { SETTINGS, SETTING_GROUPS, FONT_CHOICES, getSetting, isLeftDirection, isFiniteNumber, iconRows } from '../model/schema.js'
import { formatNumber, formatValue } from '../../../shared/src/format.js'
import { nodeTotals } from '../model/graph.js'
import { iconField } from '../../../shared/src/iconField.js'
import { patternField } from '../../../shared/src/patternField.js'
import { patternOf, fillOf } from '../../../shared/src/patterns.js'
import { iconOf, namedIcon } from '../../../shared/src/icons.js'
import { carrierIcon, iconPosition } from '../render/flowIcons.js'

export function createInspector (root, app) {
  let formKey = null
  let bindings = [] // { get(doc), update(value) }
  let dynamics = [] // (doc) => void

  function bind (field, get) {
    bindings.push({ get, update: field.update })
    return field.el
  }

  function render () {
    const doc = app.getDoc()
    const sel = app.selection
    if (!doc) { clear(root); formKey = null; return }
    const n = sel.nodes.size
    const l = sel.links.size
    const c = sel.carriers.size
    let mode = 'settings'
    if (n + l + c > 1) mode = 'multi'
    else if (n === 1) mode = 'node'
    else if (l === 1) mode = 'link'
    else if (c === 1) mode = 'carrier'
    const uids = [...sel.nodes, ...sel.links, ...sel.carriers].sort().join(',')
    // The flow form names its carrier, so it is rebuilt when that changes.
    const key = `${mode}:${uids}:${mode === 'link' ? (doc.links.find(x => x._uid === [...sel.links][0]) || {}).carrier : ''}`
    const target = mode === 'node' ? doc.nodes.find(x => x._uid === [...sel.nodes][0])
      : mode === 'link' ? doc.links.find(x => x._uid === [...sel.links][0])
        : mode === 'carrier' ? doc.carriers.find(x => x._uid === [...sel.carriers][0]) : null
    if ((mode === 'node' || mode === 'link' || mode === 'carrier') && !target) {
      app.setSelection({})
      return
    }
    if (key !== formKey) {
      formKey = key
      bindings = []
      dynamics = []
      iconPicker = null
      const scroll = mode === 'settings' && root.dataset.mode === 'settings' ? root.scrollTop : 0
      clear(root)
      root.dataset.mode = mode
      const builders = { settings: buildSettings, node: buildNode, link: buildLink, carrier: buildCarrier, multi: buildMulti }
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

  function section (title, children, { open = true, note } = {}) {
    const d = h('details', { class: 'insp-section', open },
      h('summary', {}, icon('chevron', 14), h('span', { text: title }), note ? h('span', { class: 'insp-note', text: note }) : null),
      h('div', { class: 'insp-grid' }, children))
    return d
  }

  // ---- icons on flows ----

  let iconPicker = null // the icon field of the form that is shown
  const keepPicker = field => { iconPicker = field; return field }
  const trimmed = v => String(v ?? '').trim()
  const rows = () => iconRows(app.getDoc())

  function carrierIconField (get) {
    return keepPicker(iconField({
      label: 'Icon on its flows',
      value: () => get(app.getDoc()).icon,
      shown: () => { const d = app.getDoc(); const c = get(d); return trimmed(c.icon) ? namedIcon(c.icon) : carrierIcon(d, c) },
      rows,
      auto: { label: 'Automatic', title: 'An icon by the ID when icons are on for all flows', text: 'automatic' },
      onCommit: v => app.setIcon('carriers', [get(app.getDoc())._uid], v)
    }))
  }

  function flowIconField (get) {
    return keepPicker(iconField({
      label: 'Icon',
      value: () => get(app.getDoc()).icon,
      shown: () => {
        const d = app.getDoc()
        const l = get(d)
        const c = d.carriers.find(x => x.id === l.carrier)
        return trimmed(l.icon) ? namedIcon(l.icon) : c ? carrierIcon(d, c) : null
      },
      rows,
      auto: { label: 'From the carrier', title: 'The icon of the flow’s carrier', text: 'from the carrier' },
      onCommit: v => app.setIcon('links', [get(app.getDoc())._uid], v)
    }))
  }

  // A patterned fill. carrier(d): the carrier that gives the colour, and the pattern when
  // the rows themselves have none.
  function patternFieldFor ({ label, rowsOf, carrier, own = false, onCommit, onColor }) {
    const value = () => { const list = [...new Set(rowsOf(app.getDoc()).map(r => trimmed(r.pattern)))]; return list.length === 1 ? list[0] : list.length ? null : '' }
    const c = () => carrier(app.getDoc())
    return patternField({
      label,
      value,
      shown: () => patternOf(value() || '', own ? '' : (c() || {}).pattern),
      color: () => (c() || {}).color || '#333333',
      style: () => getSetting(app.getDoc(), 'patternStyle'),
      auto: own ? null : { label: 'From the carrier', title: 'The pattern of the flow’s carrier', text: 'from the carrier' },
      onCommit,
      mark: {
        value: () => { const list = [...new Set(rowsOf(app.getDoc()).map(r => trimmed(r.patterncolor)))]; return list.length === 1 ? list[0] : '' },
        shown: () => fillOf(rowsOf(app.getDoc())[0], own ? null : c()).mark,
        onCommit: onColor
      }
    })
  }

  // The icon several flows have in common, or null when they differ.
  function sharedIcon (uids) {
    const own = new Set(uids.map(u => trimmed((app.getDoc().links.find(l => l._uid === u) || {}).icon)))
    return own.size === 1 ? [...own][0] : null
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
    if (def.type === 'select') return bind(selectField({ ...common, value: value(app.getDoc()), options: def.options }), value)
    if (def.type === 'font') {
      const current = value(app.getDoc())
      const options = FONT_CHOICES.some(o => o.value === current) ? FONT_CHOICES : [...FONT_CHOICES, { value: current, label: current }]
      return bind(selectField({ ...common, value: current, options }), value)
    }
    return bind(textField({ ...common, value: value(app.getDoc()), placeholder: def.placeholder, live: true }), value)
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
    out.push(h('p', { class: 'insp-hint', text: 'Nothing is selected, so these settings apply to the whole diagram. Click a node or flow to edit it.' }))
    SETTING_GROUPS.forEach(group => {
      const defs = SETTINGS.filter(s => s.group === group.id)
      const fields = defs.map(settingField)
      if (group.id === 'values') fields.push(scalePreview())
      out.push(section(group.label, fields))
    })
    out.push(section('Editor', [
      h('p', { class: 'field-help field-wide', text: 'Saved in this browser, not in the file.' }),
      bind(toggleField({ label: 'Snap to grid while dragging', value: app.prefs.snap, onCommit: v => app.setPref('snap', v) }), () => app.prefs.snap),
      bind(numberField({ label: 'Grid size', value: app.prefs.gridSize, min: 1, max: 400, step: 1, suffix: 'px', integer: true, onCommit: (v, { live }) => { if (!live || v >= 1) app.setPref('gridSize', v) } }), () => app.prefs.gridSize)
    ], { open: false }))
    return out
  }

  function scalePreview () {
    const box = h('div', { class: 'scale-preview field-wide' })
    dynamics.push(doc => {
      const values = doc.links.map(l => l.value).filter(isFiniteNumber)
      const biggest = values.length ? Math.max(...values) : 100
      const mult = getSetting(doc, 'scaleDataValue')
      const px = getSetting(doc, 'scaleHeight')
      const unit = getSetting(doc, 'unit')
      const thick = biggest * mult * px
      const shown = biggest * mult
      clear(box)
      box.append(
        h('div', { class: 'scale-bar-wrap' }, h('div', { class: 'scale-bar', style: { height: `${Math.max(1, Math.min(60, thick))}px` } })),
        h('p', {},
          'Largest flow: ', h('strong', { text: formatValue(biggest, 2, unit) }),
          mult !== 1 ? [' × ', h('strong', { text: formatNumber(mult, 4) }), ' = ', h('strong', { text: formatNumber(shown, 2) })] : null,
          ', drawn ', h('strong', { text: `${formatNumber(thick, 1)} px` }), ' thick',
          thick > 60 ? ' (preview capped at 60 px)' : '', '.')
      )
    })
    return box
  }

  // ---- node ----

  function directionValue (raw) { return isLeftDirection(raw) ? 'left' : 'right' }
  function directionWrite (current, side) {
    const short = typeof current === 'string' && current.trim().length === 1
    return short ? side[0] : side
  }

  function buildNode (doc, node) {
    const uid = node._uid
    const get = d => d.nodes.find(x => x._uid === uid) || node
    const edit = (label, patch, live) => app.edit(label, d => app.commands.updateNode(d, uid, patch), live ? { coalesce: `node:${uid}:${Object.keys(patch)[0]}` } : {})
    const out = [header('Node', node.title || node.id, [
      h('button', { class: 'icon-btn', type: 'button', title: 'Flow details', 'aria-label': 'Flow details', onclick: () => app.openNodeDetails(uid) }, icon('details')),
      h('button', { class: 'icon-btn danger', type: 'button', title: 'Delete node (Delete)', 'aria-label': 'Delete node', onclick: () => app.deleteSelection() }, icon('trash'))
    ])]
    dynamics.push(d => { const t = root.querySelector('.insp-title'); if (t) t.textContent = get(d).title || get(d).id })
    out.push(section('Node', [
      bind(textField({ label: 'Title', value: node.title, live: true, help: 'Start with "." to hide the label, with "_" to show only the value.', onCommit: (v, { live }) => edit('Edit node title', { title: v }, live) }), d => get(d).title),
      bind(textField({
        label: 'ID',
        value: node.id,
        mono: true,
        validate: v => (!v.trim() ? 'An ID is required' : app.getDoc().nodes.some(x => x.id === v.trim() && x._uid !== uid) ? 'Another node already has this ID' : null),
        help: 'Flows refer to this ID. Renaming keeps them connected.',
        onCommit: v => edit('Rename node', { id: v.trim() }, false)
      }), d => get(d).id),
      bind(numberField({ label: 'X', value: node.x, step: 1, integer: true, suffix: 'px', onCommit: (v, { live }) => edit('Move node', { x: v }, live) }), d => get(d).x),
      bind(numberField({ label: 'Y', value: node.y, step: 1, integer: true, suffix: 'px', onCommit: (v, { live }) => edit('Move node', { y: v }, live) }), d => get(d).y),
      bind(segmentedField({ label: 'Flows leave to the', value: directionValue(node.direction), options: [{ value: 'left', label: 'Left' }, { value: 'right', label: 'Right' }], onCommit: v => edit('Change node direction', { direction: directionWrite(get(app.getDoc()).direction, v) }) }), d => directionValue(get(d).direction)),
      bind(segmentedField({ label: 'Label on the', value: (node.labelposition || 'right').toLowerCase() === 'left' ? 'left' : 'right', options: [{ value: 'left', label: 'Left' }, { value: 'right', label: 'Right' }], onCommit: v => edit('Move label', { labelposition: v }) }), d => (String(get(d).labelposition || 'right').toLowerCase() === 'left' ? 'left' : 'right'))
    ]))
    const flows = h('div', { class: 'flow-summary field-wide' })
    dynamics.push(d => renderNodeFlows(flows, d, get(d)))
    out.push(section('Flows', [flows]))
    return out
  }

  function renderNodeFlows (box, doc, node) {
    const t = nodeTotals(doc).get(node.id) || { in: 0, out: 0 }
    const unit = getSetting(doc, 'unit')
    const dec = getSetting(doc, 'decimalsRoundValues')
    const nodeTitle = new Map(doc.nodes.map(n => [n.id, n.title || n.id]))
    const color = new Map(doc.carriers.map(c => [c.id, c.color]))
    const diff = t.out - t.in
    const balanced = t.in === 0 || t.out === 0 || Math.abs(diff) <= 1
    const list = (title, links, other) => h('div', { class: 'flow-list' },
      h('div', { class: 'flow-list-head', text: `${title} (${links.length})` }),
      links.length ? links.map(l => h('button', {
        type: 'button',
        class: 'flow-row',
        onclick: () => { app.setSelection({ links: [l._uid] }); app.reveal([l._uid]) }
      },
      h('span', { class: 'dot', style: { background: color.get(l.carrier) || '#000' } }),
      h('span', { class: 'flow-row-name', text: nodeTitle.get(l[other]) || l[other] || '—' }),
      h('span', { class: 'flow-row-value', text: isFiniteNumber(l.value) ? formatNumber(l.value, dec) : '?' })
      )) : h('p', { class: 'muted small', text: 'None' }))
    const { incoming, outgoing } = { incoming: doc.links.filter(l => l.target === node.id), outgoing: doc.links.filter(l => l.source === node.id) }
    clear(box)
    box.append(
      h('div', { class: 'totals' },
        h('div', {}, h('span', { class: 'muted', text: 'In' }), h('strong', { text: formatValue(t.in, dec, unit) })),
        h('div', {}, h('span', { class: 'muted', text: 'Out' }), h('strong', { text: formatValue(t.out, dec, unit) })),
        h('div', { class: balanced ? 'ok' : 'warn' }, h('span', { class: 'muted', text: 'Balance' }), h('strong', { text: t.in && t.out ? `${diff > 0 ? '+' : ''}${formatNumber(diff, dec)}` : '—' }))
      ),
      list('Incoming', incoming, 'source'),
      list('Outgoing', outgoing, 'target'),
      h('p', { class: 'field-help', text: 'To add a flow, drag the round handle next to the node onto another node.' })
    )
  }

  // ---- link ----

  function nodeOptions (doc) {
    return doc.nodes.map(n => ({ value: n.id, label: n.title && n.title !== n.id ? `${n.title} (${n.id})` : n.id }))
  }

  function buildLink (doc, link) {
    const uid = link._uid
    const get = d => d.links.find(x => x._uid === uid) || link
    const edit = (label, patch, live) => app.edit(label, d => app.commands.updateLink(d, uid, patch), live ? { coalesce: `link:${uid}:${Object.keys(patch)[0]}` } : {})
    const title = d => {
      const names = new Map(d.nodes.map(n => [n.id, n.title || n.id]))
      const l = get(d)
      return `${names.get(l.source) || l.source || '?'} → ${names.get(l.target) || l.target || '?'}`
    }
    const out = [header('Flow', title(doc), [
      h('button', { class: 'icon-btn danger', type: 'button', title: 'Delete flow (Delete)', 'aria-label': 'Delete flow', onclick: () => app.deleteSelection() }, icon('trash'))
    ])]
    dynamics.push(d => { const t = root.querySelector('.insp-title'); if (t) t.textContent = title(d) })
    const nodeSelect = (label, key) => {
      const opts = () => {
        const o = nodeOptions(app.getDoc())
        const v = get(app.getDoc())[key]
        return o.some(x => x.value === v) ? o : [{ value: v || '', label: v ? `${v} (missing)` : '— choose —' }, ...o]
      }
      const f = selectField({ label, value: link[key], options: opts(), onCommit: v => edit(`Change flow ${key}`, { [key]: v }) })
      return bind(f, d => get(d)[key])
    }
    const carrierOptions = d => {
      const o = d.carriers.map(c => ({ value: c.id, label: c.id }))
      const v = get(d).carrier
      return o.some(x => x.value === v) ? o : [{ value: v || '', label: v ? `${v} (no colour)` : '— choose —' }, ...o]
    }
    out.push(section('Flow', [
      nodeSelect('From', 'source'),
      nodeSelect('To', 'target'),
      bind(numberField({ label: 'Value', value: link.value, step: 'any', suffix: getSetting(doc, 'unit') || undefined, wide: true, onCommit: (v, { live }) => edit('Change flow value', { value: v }, live) }), d => get(d).value),
      bind(selectField({ label: 'Carrier', value: link.carrier, options: carrierOptions(doc), onCommit: v => { app.lastCarrier = v; edit('Change flow carrier', { carrier: v }) } }), d => get(d).carrier),
      bind(textField({ label: 'Type', value: link.type === 0 ? '' : link.type, mono: true, help: 'Only needed when two flows connect the same nodes: give each a different type.', onCommit: v => edit('Change flow type', { type: v === '' ? 0 : v }) }), d => (get(d).type === 0 ? '' : get(d).type)),
      bind(textAreaField({ label: 'Note', value: link.annotate, placeholder: 'Shown when hovering the flow', onCommit: v => edit('Edit flow note', { annotate: v }) }), d => get(d).annotate)
    ]))
    const carrier = doc.carriers.find(c => c.id === link.carrier)
    const position = numberField({ label: 'Place on the flow', value: Math.round(iconPosition(doc, link) * 100), min: 0, max: 100, step: 1, integer: true, suffix: '%', wide: true, onCommit: (v, { live }) => edit('Move icon', { iconposition: v }, live) })
    bind(position, d => Math.round(iconPosition(d, get(d)) * 100))
    const automaticPlace = h('button', { type: 'button', class: 'link-btn small field-wide', text: 'Back to the automatic place', onclick: () => edit('Move icon', { iconposition: '' }) })
    dynamics.push(d => {
      const drawn = !!app.canvas.flowIconAt(uid)
      position.el.hidden = !drawn
      automaticPlace.hidden = !drawn || trimmed(get(d).iconposition) === ''
    })
    out.push(section('Icon', [
      bind(flowIconField(get), () => null),
      carrier ? h('button', { type: 'button', class: 'link-btn small field-wide', text: `Change the icon of carrier ${carrier.name || carrier.id}, for all its flows`, onclick: () => app.editCarrierIcon(carrier._uid) }) : null,
      position.el,
      automaticPlace
    ]))
    out.push(section('Pattern', [
      bind(patternFieldFor({ label: 'Pattern of this flow', rowsOf: d => [get(d)], carrier: d => d.carriers.find(c => c.id === get(d).carrier), onCommit: v => edit('Change pattern', { pattern: v }), onColor: (v, { live }) => edit('Change second colour', { patterncolor: v }, live) }), () => null),
      carrier ? h('button', { type: 'button', class: 'link-btn small field-wide', text: `Change the pattern of carrier ${carrier.name || carrier.id}, for all its flows`, onclick: () => app.setSelection({ carriers: [carrier._uid] }) }) : null
    ]))
    const info = h('p', { class: 'field-help field-wide' })
    dynamics.push(d => {
      const l = get(d)
      const lay = app.layout && app.layout.linkByUid.get(uid)
      info.textContent = lay ? `Drawn ${formatNumber(lay.value * getSetting(d, 'scaleHeight'), 1)} px thick.` : 'Not drawn: check the issues list for this flow.'
    })
    out.push(info)
    return out
  }

  // ---- carrier ----

  function buildCarrier (doc, carrier) {
    const uid = carrier._uid
    const get = d => d.carriers.find(x => x._uid === uid) || carrier
    const edit = (label, patch, live) => app.edit(label, d => app.commands.updateCarrier(d, uid, patch), live ? { coalesce: `carrier:${uid}:${Object.keys(patch)[0]}` } : {})
    const out = [header('Carrier', carrier.id, [
      h('button', { class: 'icon-btn danger', type: 'button', title: 'Delete carrier', 'aria-label': 'Delete carrier', onclick: () => app.deleteSelection() }, icon('trash'))
    ])]
    dynamics.push(d => { const t = root.querySelector('.insp-title'); if (t) t.textContent = get(d).id })
    const fields = [
      bind(textField({
        label: 'ID',
        value: carrier.id,
        mono: true,
        validate: v => (!v.trim() ? 'An ID is required' : app.getDoc().carriers.some(x => x.id === v.trim() && x._uid !== uid) ? 'Another carrier already has this ID' : null),
        help: 'Renaming updates every flow that uses it.',
        onCommit: v => edit('Rename carrier', { id: v.trim() })
      }), d => get(d).id),
      bind(colorField({ label: 'Colour', value: carrier.color, onCommit: (v, { live }) => edit('Change carrier colour', { color: v }, live) }), d => get(d).color),
      bind(patternFieldFor({ label: 'Pattern of its flows', rowsOf: d => [get(d)], carrier: get, own: true, onCommit: v => edit('Change pattern', { pattern: v }), onColor: (v, { live }) => edit('Change second colour', { patterncolor: v }, live) }), () => null),
      bind(carrierIconField(get), () => null)
    ]
    if ('name' in carrier || doc.meta.carrierColumns.includes('name')) {
      fields.push(bind(textField({ label: 'Display name', value: carrier.name, onCommit: v => edit('Rename carrier', { name: v }) }), d => get(d).name))
    }
    const usage = h('div', { class: 'field-wide' })
    dynamics.push(d => {
      const uses = d.links.filter(l => l.carrier === get(d).id)
      clear(usage)
      usage.append(
        h('p', { class: 'field-help', text: uses.length ? `Used by ${uses.length} flow${uses.length > 1 ? 's' : ''}.` : 'Not used by any flow.' }),
        uses.length ? h('button', { class: 'btn btn-ghost btn-small', type: 'button', text: 'Select these flows', onclick: () => app.setSelection({ links: uses.map(l => l._uid) }) }) : null
      )
    })
    fields.push(usage)
    out.push(section('Carrier', fields))
    return out
  }

  // ---- several ----

  function buildMulti (doc, _target, sel) {
    const nodes = [...sel.nodes]
    const links = [...sel.links]
    const carriers = [...sel.carriers]
    const parts = [nodes.length && `${nodes.length} node${nodes.length > 1 ? 's' : ''}`, links.length && `${links.length} flow${links.length > 1 ? 's' : ''}`, carriers.length && `${carriers.length} carrier${carriers.length > 1 ? 's' : ''}`].filter(Boolean)
    const out = [header('Selection', parts.join(', '), [
      h('button', { class: 'icon-btn danger', type: 'button', title: 'Delete selection (Delete)', 'aria-label': 'Delete selection', onclick: () => app.deleteSelection() }, icon('trash'))
    ])]
    if (nodes.length >= 2) {
      const btn = (name, label, fn, disabled) => h('button', { class: 'tool-btn', type: 'button', title: label, 'aria-label': label, disabled, onclick: fn }, icon(name))
      out.push(section('Arrange', [h('div', { class: 'tool-row field-wide' },
        btn('alignLeft', 'Align left edges', () => app.edit('Align nodes', d => app.commands.alignNodes(d, nodes, 'left'))),
        btn('alignRight', 'Align right edges', () => app.edit('Align nodes', d => app.commands.alignNodes(d, nodes, 'right'))),
        btn('alignTop', 'Align tops', () => app.edit('Align nodes', d => app.commands.alignNodes(d, nodes, 'top'))),
        btn('alignBottom', 'Align bottoms', () => app.edit('Align nodes', d => app.commands.alignNodes(d, nodes, 'bottom'))),
        btn('distH', 'Spread evenly left to right', () => app.edit('Distribute nodes', d => app.commands.distributeNodes(d, nodes, 'x')), nodes.length < 3),
        btn('distV', 'Spread evenly top to bottom', () => app.edit('Distribute nodes', d => app.commands.distributeNodes(d, nodes, 'y')), nodes.length < 3)
      )]))
    }
    if (nodes.length) {
      const setAll = (label, key, value) => app.edit(label, d => nodes.reduce((acc, u) => {
        const n = acc.nodes.find(x => x._uid === u)
        return n ? app.commands.updateNode(acc, u, { [key]: key === 'direction' ? directionWrite(n.direction, value) : value }) : acc
      }, d))
      out.push(section('Nodes', [
        segmentedField({ label: 'Label on the', value: null, options: [{ value: 'left', label: 'Left' }, { value: 'right', label: 'Right' }], onCommit: v => setAll('Move labels', 'labelposition', v) }).el,
        segmentedField({ label: 'Flows leave to the', value: null, options: [{ value: 'left', label: 'Left' }, { value: 'right', label: 'Right' }], onCommit: v => setAll('Change node direction', 'direction', v) }).el
      ]))
    }
    if (links.length) {
      out.push(section('Flows', [
        selectField({
          label: 'Set carrier for all',
          value: '',
          options: [{ value: '', label: '— choose —' }, ...doc.carriers.map(c => ({ value: c.id, label: c.id }))],
          onCommit: v => { if (v) app.edit('Change flow carriers', d => links.reduce((acc, u) => app.commands.updateLink(acc, u, { carrier: v }), d)) }
        }).el,
        bind(keepPicker(iconField({
          label: 'Icon for all',
          value: () => sharedIcon(links),
          shown: () => namedIcon(sharedIcon(links)),
          rows,
          auto: { label: 'From the carrier', title: 'The icon of each flow’s carrier', text: 'from the carriers' },
          onCommit: v => app.setIcon('links', links, v)
        })), () => null),
        bind(patternFieldFor({
          label: 'Pattern for all',
          rowsOf: d => d.links.filter(l => links.includes(l._uid)),
          carrier: d => { const l = d.links.find(x => x._uid === links[0]); return l && d.carriers.find(c => c.id === l.carrier) },
          onCommit: v => app.edit('Change patterns', d => links.reduce((acc, u) => app.commands.updateLink(acc, u, { pattern: v }), d)),
          onColor: (v, { live }) => app.edit('Change second colours', d => links.reduce((acc, u) => app.commands.updateLink(acc, u, { patterncolor: v }), d), live ? { coalesce: 'links:patterncolor' } : {})
        }), () => null)
      ]))
    }
    return out
  }

  return { render, openIconPicker: () => { if (iconPicker) iconPicker.open() }, reset: () => { formKey = null } }
}
