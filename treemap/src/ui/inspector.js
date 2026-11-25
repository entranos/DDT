// The right-hand panel. Shows what is selected and lets you edit it in place:
//   nothing selected → diagram settings, grouped by what they change
//   one block / value (tile) / carrier → its fields
//   several items → bulk actions

import { h, icon, clear } from '../../../shared/src/dom.js'
import { textField, textAreaField, numberField, colorField, toggleField, selectField, segmentedField } from '../../../shared/src/fields.js'
import { SETTINGS, SETTING_GROUPS, FONT_CHOICES, getSetting, isFiniteNumber, blockIsVisible, carrierColor, iconRows } from '../model/schema.js'
import { formatAmount, formatShare } from '../render/treemap.js'
import { formatNumber } from '../../../shared/src/format.js'
import { iconField } from '../../../shared/src/iconField.js'
import { patternField } from '../../../shared/src/patternField.js'
import { patternOf, fillOf } from '../../../shared/src/patterns.js'
import { iconOf, namedIcon } from '../../../shared/src/icons.js'

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`

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
    const blocks = [...sel.blocks]
    const values = [...sel.values]
    const carriers = [...sel.carriers]
    // A tile made of several rows is one thing to look at: its parts.
    const tile = values.length > 1 && !blocks.length && !carriers.length && app.tileOfAll(values)
    let mode = 'settings'
    if (tile) mode = 'tile'
    else if (blocks.length + values.length + carriers.length > 1) mode = 'multi'
    else if (blocks.length) mode = 'block'
    else if (values.length) mode = 'value'
    else if (carriers.length) mode = 'carrier'
    const lists = { block: doc.blocks, value: doc.values, carrier: doc.carriers }
    const target = lists[mode] ? lists[mode].find(x => x._uid === [...blocks, ...values, ...carriers][0]) : null
    if (lists[mode] && !target) { app.setSelection({}); return }
    // Forms with lists of blocks or carriers are rebuilt when those change.
    const options = mode === 'value' ? `${doc.blocks.map(b => b.id + b.title).join()}|${doc.carriers.map(c => c.id + c.title).join()}|${target ? `${target.block}|${target.carrier}` : ''}|${getSetting(doc, 'view')}` : ''
    const key = `${mode}:${[...blocks, ...values, ...carriers].sort().join(',')}:${options}`
    if (key !== formKey) {
      formKey = key
      bindings = []
      dynamics = []
      iconPicker = null
      const scroll = mode === 'settings' && root.dataset.mode === 'settings' ? root.scrollTop : 0
      clear(root)
      root.dataset.mode = mode
      const builders = { settings: buildSettings, block: buildBlock, value: buildValue, tile: buildTile, carrier: buildCarrier, multi: buildMulti }
      root.append(...[builders[mode](doc, tile || target, sel)].flat())
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

  let iconPicker = null // the icon field of the form that is shown
  const keepPicker = field => { iconPicker = field; return field }
  const rowIcon = (get, onCommit) => keepPicker(iconField({ label: 'Icon', value: () => get(app.getDoc()).icon, shown: () => iconOf(get(app.getDoc())), rows: () => iconRows(app.getDoc()), onCommit }))

  // A tile's own icon. Without one it shows its carrier's (per carrier: its block's).
  function tileIcon (get, onCommit) {
    const source = () => app.iconSource(get(app.getDoc()))
    const s = source()
    return keepPicker(iconField({
      label: 'Icon',
      value: () => get(app.getDoc()).icon,
      shown: () => { const v = String(get(app.getDoc()).icon ?? '').trim(); const from = source(); return v ? namedIcon(v) : from ? iconOf(from.row) : null },
      rows: () => iconRows(app.getDoc()),
      auto: s ? { label: `From the ${s.noun}`, title: `The icon of the ${s.noun}`, text: `from the ${s.noun}` } : {},
      onCommit
    }))
  }
  // A patterned fill. rows(d): the values it is for, or the carrier itself.
  // set(patch, label, options): changes those rows.
  function patternFieldFor (label, rowsOf, carrierOf, set, own = false) {
    const value = () => { const list = [...new Set(rowsOf(app.getDoc()).map(r => String(r.pattern ?? '').trim()))]; return list.length === 1 ? list[0] : list.length ? null : '' }
    const carrier = () => carrierOf(app.getDoc())
    return bind(patternField({
      label,
      value,
      shown: () => patternOf(value() || '', own ? '' : (carrier() || {}).pattern),
      color: () => { const c = carrier(); return c ? carrierColor(app.getDoc(), c) : '#857F78' },
      style: () => getSetting(app.getDoc(), 'patternStyle'),
      auto: own ? null : { label: 'From the carrier', title: 'The pattern of the carrier', text: 'from the carrier' },
      onCommit: v => set({ pattern: v }, 'Change pattern', false),
      mark: {
        value: () => { const list = [...new Set(rowsOf(app.getDoc()).map(r => String(r.patterncolor ?? '').trim()))]; return list.length === 1 ? list[0] : '' },
        shown: () => fillOf(rowsOf(app.getDoc())[0], own ? null : carrier()).mark,
        onCommit: (v, { live }) => set({ patterncolor: v }, 'Change second colour', live)
      }
    }), () => null)
  }

  function sourceIconButton (get) {
    const s = app.iconSource(get(app.getDoc()))
    return s ? h('button', { type: 'button', class: 'link-btn small field-wide', text: `Change the icon of ${s.noun} ${s.row.title || s.row.id}, for all its tiles`, onclick: () => app.editSourceIcon(get(app.getDoc())) }) : null
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
    return bind(textField({ ...common, value: value(app.getDoc()), placeholder: def.placeholder, live: true, wide: def.key === 'title' }), value)
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
    out.push(h('p', { class: 'insp-hint', text: 'Nothing is selected, so these settings apply to the whole diagram. Click a tile or block to edit it.' }))
    SETTING_GROUPS.forEach(group => {
      const defs = SETTINGS.filter(s => s.group === group.id)
      const fields = defs.map(def => {
        const el = settingField(def)
        if (def.key === 'areaPerUnit') dynamics.push(d => { el.hidden = getSetting(d, 'scaleMode') !== 'fixed' })
        return el
      })
      if (group.id === 'scale') fields.splice(2, 0, scaleReadout())
      out.push(section(group.label, fields, { id: group.id }))
    })
    return out
  }

  // The scale the diagram is drawn at, and a way to keep it for other diagrams.
  function scaleReadout () {
    const box = h('div', { class: 'scale-readout field-wide' })
    dynamics.push(d => {
      const res = app.canvas.result
      clear(box)
      if (!res || !res.perUnit) { box.hidden = true; return }
      box.hidden = false
      const per = res.perUnit
      const unit = getSetting(d, 'unit') || 'unit'
      const side = Math.sqrt(per)
      box.append(
        h('span', { class: 'scale-square', style: { width: `${Math.max(2, Math.min(34, side))}px`, height: `${Math.max(2, Math.min(34, side))}px` } }),
        h('p', {}, '1 ', unit, ' is drawn as ', h('strong', { text: `${formatNumber(per, per < 10 ? 3 : 1)} px²` }), side > 34 ? ' (square capped at 34 px)' : '', '.'),
        getSetting(d, 'scaleMode') === 'fit'
          ? h('button', { type: 'button', class: 'btn btn-small', text: 'Keep this scale', title: 'Switch to a fixed area per unit, at the current size', onclick: () => app.keepScale() })
          : (res.fits ? '' : h('p', { class: 'warn-text', text: 'At this scale the diagram doesn’t fit the canvas.' })))
    })
    return box
  }

  // ---- block ----

  function rowTable (rows, empty) {
    if (!rows.length) return h('p', { class: 'muted small', text: empty })
    return h('div', { class: 'flow-list' }, rows.map(r => h('button', { type: 'button', class: 'flow-row', title: 'Select this value', onclick: () => { app.setSelection({ values: r.uids }); app.reveal(r.uids) } },
      h('span', { class: 'dot', style: { background: r.color } }),
      h('span', { class: 'flow-row-name', text: r.label }),
      h('span', { class: 'flow-row-value', text: r.text }),
      h('span', { class: 'flow-row-share', text: r.share }))))
  }

  // Values of one block (or carrier), one row per counterpart, largest first.
  function breakdown (d, key, id) {
    const other = key === 'block' ? 'carrier' : 'block'
    const multiply = getSetting(d, 'multiply') || 1
    const byOther = new Map()
    d.values.filter(v => v[key] === id && isFiniteNumber(v.value)).forEach(v => {
      const e = byOther.get(v[other]) || { id: v[other], value: 0, uids: [] }
      e.value += v.value * multiply
      e.uids.push(v._uid)
      byOther.set(v[other], e)
    })
    const total = [...byOther.values()].reduce((s, e) => s + e.value, 0)
    const list = [...byOther.values()].sort((a, b) => b.value - a.value).map(e => {
      const row = (other === 'carrier' ? d.carriers : d.blocks).find(x => x.id === e.id)
      const carrier = other === 'carrier' ? row : d.carriers.find(c => c.id === id)
      return { uids: e.uids, label: (row && (row.title || row.id)) || e.id || '?', color: carrier ? carrierColor(d, carrier) : 'transparent', text: formatAmount(d, e.value), share: total > 0 ? formatShare(e.value / total) : '' }
    })
    return { total, list }
  }

  function buildBlock (doc, block) {
    const uid = block._uid
    const get = d => d.blocks.find(x => x._uid === uid) || block
    const edit = (label, patch, live) => app.edit(label, d => app.commands.updateBlock(d, uid, patch), live ? { coalesce: `block:${uid}:${Object.keys(patch)[0]}` } : {})
    const out = [header('Block', block.title || block.id, [deleteButton('Delete block and its values')])]
    liveTitle(d => get(d).title || get(d).id)
    const groupList = h('datalist', { id: 'insp-groups' })
    dynamics.push(d => clear(groupList).append(...[...new Set(d.blocks.map(b => b.group).filter(Boolean))].map(g => h('option', { value: g }))))
    out.push(section('Block', [
      bind(textField({ label: 'Title', value: block.title, live: true, onCommit: (v, { live }) => edit('Edit block title', { title: v }, live) }), d => get(d).title),
      bind(textField({
        label: 'ID',
        value: block.id,
        mono: true,
        validate: v => (!v.trim() ? 'An ID is required' : app.getDoc().blocks.some(x => x.id === v.trim() && x._uid !== uid) ? 'Another block already has this ID' : null),
        help: 'Values refer to this ID. Renaming keeps them attached.',
        onCommit: v => edit('Rename block', { id: v.trim() })
      }), d => get(d).id),
      bind(textField({ label: 'Group', value: block.group, list: 'insp-groups', help: 'Optional. Blocks of one group are drawn together under its name.', onCommit: v => edit('Change block group', { group: v.trim() }) }), d => get(d).group),
      groupList,
      bind(rowIcon(get, v => edit('Change icon', { icon: v })), () => null),
      bind(toggleField({ label: 'Visible', value: blockIsVisible(block), onCommit: v => edit(v ? 'Show block' : 'Hide block', { visible: v }) }), d => blockIsVisible(get(d)))
    ]))
    const box = h('div', { class: 'flow-summary field-wide' })
    dynamics.push(d => {
      const { total, list } = breakdown(d, 'block', get(d).id)
      clear(box).append(
        h('div', { class: 'mix-total' }, h('span', { text: 'Total' }), h('strong', { text: formatAmount(d, total) })),
        rowTable(list, 'No values yet.'),
        h('button', { type: 'button', class: 'btn btn-ghost btn-small', onclick: () => app.addValueTo(uid) }, icon('plus', 14), 'Add value'))
    })
    out.push(section('Values', [box]))
    return out
  }

  // ---- value ----

  const blockOptions = (d, current) => withMissing(d.blocks.map(b => ({ value: b.id, label: b.title && b.title !== b.id ? `${b.title} (${b.id})` : b.id })), current)
  const carrierOptions = (d, current) => withMissing(d.carriers.map(c => ({ value: c.id, label: c.title && c.title !== c.id ? `${c.title} (${c.id})` : c.id })), current)
  function withMissing (options, current) {
    return options.some(o => o.value === current) ? options : [{ value: current || '', label: current ? `${current} (missing)` : '— choose —' }, ...options]
  }
  const valueTitle = (d, v) => {
    const b = d.blocks.find(x => x.id === v.block)
    const c = d.carriers.find(x => x.id === v.carrier)
    return `${(b && (b.title || b.id)) || v.block || '?'}, ${(c && (c.title || c.id)) || v.carrier || '?'}`
  }

  function buildValue (doc, value) {
    const uid = value._uid
    const get = d => d.values.find(x => x._uid === uid) || value
    const edit = (label, patch, live) => app.edit(label, d => app.commands.updateValue(d, uid, patch), live ? { coalesce: `value:${uid}:${Object.keys(patch)[0]}` } : {})
    const out = [header('Value', valueTitle(doc, value), [deleteButton('Delete value')])]
    liveTitle(d => valueTitle(d, get(d)))
    out.push(section('Value', [
      bind(numberField({ label: 'Value', value: value.value, min: 0, step: 'any', suffix: getSetting(doc, 'multiply') === 1 ? getSetting(doc, 'unit') || undefined : undefined, wide: true, onCommit: (v, { live }) => edit('Change value', { value: v }, live) }), d => get(d).value),
      bind(selectField({ label: 'Block', value: value.block, options: blockOptions(doc, value.block), onCommit: v => edit('Move value to another block', { block: v }) }), d => get(d).block),
      bind(selectField({ label: 'Carrier', value: value.carrier, options: carrierOptions(doc, value.carrier), onCommit: v => edit('Change carrier', { carrier: v }) }), d => get(d).carrier),
      bind(textField({ label: 'Part', value: value.part, help: 'Only needed when a tile is made of several rows: they are listed in its tooltip.', onCommit: v => edit('Change part', { part: v }) }), d => get(d).part),
      bind(tileIcon(get, v => edit('Change tile icon', { icon: v })), () => null),
      sourceIconButton(get),
      patternFieldFor('Pattern', d => [get(d)], d => d.carriers.find(c => c.id === get(d).carrier), (patch, label, live) => edit(label, patch, live)),
      bind(textAreaField({ label: 'Note', value: value.note, placeholder: 'Shown when hovering the tile', onCommit: v => edit('Edit note', { note: v }) }), d => get(d).note)
    ]))
    const info = h('p', { class: 'field-help' })
    dynamics.push(() => {
      const t = app.tileInfo(uid)
      info.textContent = t
        ? `${formatShare(t.share)} of ${t.block.title}. Drawn as ${formatNumber((t.box.x1 - t.box.x0) * (t.box.y1 - t.box.y0), 0)} px².`
        : 'Not drawn: hidden, too small for this scale, or listed in the Issues tab.'
    })
    out.push(info)
    return out
  }

  // ---- a tile made of several rows ----

  function buildTile (doc, tile) {
    const uids = tile.uids
    const out = [header('Tile', valueTitle(doc, doc.values.find(v => v._uid === uids[0])), [deleteButton('Delete these values')])]
    const list = uids.map(uid => {
      const get = d => d.values.find(v => v._uid === uid) || {}
      const v = get(doc)
      return bind(numberField({ label: v.part ? String(v.part) : 'Value', value: v.value, min: 0, step: 'any', wide: true, onCommit: (n, { live }) => app.edit('Change value', d => app.commands.updateValue(d, uid, { value: n }), live ? { coalesce: `value:${uid}:value` } : {}) }), d => get(d).value)
    })
    out.push(section(`Made of ${uids.length} values`, list))
    const rowWithIcon = d => uids.map(u => d.values.find(v => v._uid === u)).filter(Boolean).find((v, i, all) => String(v.icon ?? '').trim() || i === all.length - 1) || {}
    out.push(section('Icon', [
      bind(tileIcon(rowWithIcon, v => app.edit('Change tile icon', d => uids.reduce((acc, u) => app.commands.updateValue(acc, u, { icon: v }), d))), () => null),
      sourceIconButton(rowWithIcon)
    ]))
    out.push(section('Pattern', [
      patternFieldFor('Pattern', d => d.values.filter(v => uids.includes(v._uid)), d => { const v = d.values.find(x => x._uid === uids[0]); return v && d.carriers.find(c => c.id === v.carrier) }, (patch, label, live) => app.edit(label, d => uids.reduce((acc, u) => app.commands.updateValue(acc, u, patch), d), live ? { coalesce: `tile:${uids[0]}:fill` } : {}))
    ]))
    const info = h('p', { class: 'field-help' })
    dynamics.push(d => { const t = app.tileInfo(uids[0]); info.textContent = t ? `Together ${formatAmount(d, t.tile.value)}: ${formatShare(t.share)} of ${t.block.title}.` : '' })
    out.push(info)
    return out
  }

  // ---- carrier ----

  function buildCarrier (doc, carrier) {
    const uid = carrier._uid
    const get = d => d.carriers.find(x => x._uid === uid) || carrier
    const edit = (label, patch, live) => app.edit(label, d => app.commands.updateCarrier(d, uid, patch), live ? { coalesce: `carrier:${uid}:${Object.keys(patch)[0]}` } : {})
    const out = [header('Carrier', carrier.title || carrier.id, [deleteButton('Delete carrier and its values')])]
    liveTitle(d => get(d).title || get(d).id)
    out.push(section('Carrier', [
      bind(textField({ label: 'Title', value: carrier.title, live: true, onCommit: (v, { live }) => edit('Edit carrier title', { title: v }, live) }), d => get(d).title),
      bind(textField({
        label: 'ID',
        value: carrier.id,
        mono: true,
        validate: v => (!v.trim() ? 'An ID is required' : app.getDoc().carriers.some(x => x.id === v.trim() && x._uid !== uid) ? 'Another carrier already has this ID' : null),
        help: 'Renaming updates every value that uses it.',
        onCommit: v => edit('Rename carrier', { id: v.trim() })
      }), d => get(d).id),
      bind(colorField({ label: 'Colour', value: carrierColor(doc, carrier), onCommit: (v, { live }) => edit('Change carrier colour', { color: v }, live) }), d => carrierColor(d, get(d))),
      patternFieldFor('Pattern', d => [get(d)], get, (patch, label, live) => edit(label, patch, live), true),
      bind(rowIcon(get, v => edit('Change icon', { icon: v })), () => null)
    ]))
    const box = h('div', { class: 'flow-summary field-wide' })
    dynamics.push(d => {
      const { total, list } = breakdown(d, 'carrier', get(d).id)
      clear(box).append(
        h('div', { class: 'mix-total' }, h('span', { text: 'Total' }), h('strong', { text: formatAmount(d, total) })),
        rowTable(list, 'Not used by any block.'))
    })
    out.push(section('Used in', [box]))
    return out
  }

  // ---- several ----

  function buildMulti (doc, _target, sel) {
    const blocks = [...sel.blocks]
    const values = [...sel.values]
    const carriers = [...sel.carriers]
    const parts = [blocks.length && plural(blocks.length, 'block', 'blocks'), values.length && plural(values.length, 'value', 'values'), carriers.length && plural(carriers.length, 'carrier', 'carriers')].filter(Boolean)
    const out = [header('Selection', parts.join(', '), [deleteButton('Delete selection')])]
    if (blocks.length) {
      const setAll = (label, patch) => app.edit(label, d => blocks.reduce((acc, u) => app.commands.updateBlock(acc, u, patch), d))
      out.push(section('Blocks', [
        textField({ label: 'Group', value: '', placeholder: 'Set one group for all', onCommit: v => { if (v.trim()) setAll('Change block group', { group: v.trim() }) } }).el,
        segmentedField({ label: 'Visible', value: null, options: [{ value: 'on', label: 'Show' }, { value: 'off', label: 'Hide' }], onCommit: v => setAll('Change visibility', { visible: v === 'on' }) }).el
      ]))
    }
    if (values.length) {
      const setAll = (label, patch) => app.edit(label, d => values.reduce((acc, u) => app.commands.updateValue(acc, u, patch), d))
      const total = h('p', { class: 'field-help field-wide' })
      dynamics.push(d => {
        const sum = d.values.filter(v => values.includes(v._uid) && isFiniteNumber(v.value)).reduce((s, v) => s + v.value, 0) * (getSetting(d, 'multiply') || 1)
        total.textContent = `Together ${formatAmount(d, sum)}.`
      })
      out.push(section('Values', [
        total,
        selectField({ label: 'Set carrier for all', value: '', options: [{ value: '', label: '— choose —' }, ...doc.carriers.map(c => ({ value: c.id, label: c.title || c.id }))], onCommit: v => { if (v) setAll('Change carriers', { carrier: v }) } }).el,
        selectField({ label: 'Move to block', value: '', options: [{ value: '', label: '— choose —' }, ...doc.blocks.map(b => ({ value: b.id, label: b.title || b.id }))], onCommit: v => { if (v) setAll('Move values to another block', { block: v }) } }).el,
        patternFieldFor('Pattern for all', d => d.values.filter(v => values.includes(v._uid)), d => { const v = d.values.find(x => x._uid === values[0]); return v && d.carriers.find(c => c.id === v.carrier) }, (patch, label, live) => app.edit(label, d => values.reduce((acc, u) => app.commands.updateValue(acc, u, patch), d), live ? { coalesce: 'values:fill' } : {}))
      ]))
    }
    return out
  }

  // Bring a section of the settings into view.
  function showSection (id) {
    const el = root.querySelector(`details[data-section="${id}"]`)
    if (!el) return
    el.open = true
    el.scrollIntoView({ block: 'start' })
  }

  return { render, showSection, openIconPicker: () => { if (iconPicker) iconPicker.open() }, reset: () => { formKey = null } }
}
