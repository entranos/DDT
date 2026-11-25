// The right-hand panel. Shows what is selected and lets you edit it in place:
//   nothing (or a corner) selected → diagram settings, grouped by what they change
//   one series / point → its fields
//   several items → bulk actions

import { h, icon, clear } from '../../../shared/src/dom.js'
import { textField, numberField, colorField, toggleField, selectField, segmentedField } from '../../../shared/src/fields.js'
import { SETTINGS, SETTING_GROUPS, FONT_CHOICES, CORNERS, getSetting, isFiniteNumber, seriesIsDashed, seriesIsHighlighted, seriesIsVisible } from '../model/schema.js'
import { seriesColors } from '../model/mix.js'
import { axisIdAllowed } from '../model/commands.js'
import { formatNumber, formatValue } from '../../../shared/src/format.js'

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
    const s = sel.series.size
    const p = sel.points.size
    let mode = 'settings'
    if (s + p > 1) mode = 'multi'
    else if (s === 1) mode = 'series'
    else if (p === 1) mode = 'point'
    const uids = [...sel.series, ...sel.points].sort().join(',')
    // The forms list the corners, so they are rebuilt when a corner's name or ID changes.
    const key = `${mode}:${uids}:${mode === 'point' ? doc.axes.map(a => `${a.id}|${a.label}`).join(';') : ''}`
    const target = mode === 'series' ? doc.series.find(x => x._uid === [...sel.series][0])
      : mode === 'point' ? doc.points.find(x => x._uid === [...sel.points][0]) : null
    if ((mode === 'series' || mode === 'point') && !target) {
      app.setSelection({})
      return
    }
    if (key !== formKey) {
      formKey = key
      bindings = []
      dynamics = []
      const scroll = mode === 'settings' && root.dataset.mode === 'settings' ? root.scrollTop : 0
      clear(root)
      root.dataset.mode = mode
      const builders = { settings: buildSettings, series: buildSeries, point: buildPoint, multi: buildMulti }
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

  function section (title, children, { open = true, id } = {}) {
    return h('details', { class: 'insp-section', open, dataset: id ? { section: id } : {} },
      h('summary', {}, icon('chevron', 14), h('span', { text: title })),
      h('div', { class: 'insp-grid' }, children))
  }

  // ---- settings ----

  // A setting that only applies with another one set (showIf) hides otherwise.
  function settingField (def) {
    const el = settingInput(def)
    if (def.showIf) dynamics.push(d => { el.hidden = !def.showIf(key => getSetting(d, key)) })
    return el
  }

  function settingInput (def) {
    const commit = (v, { live }) => app.setSetting(def.key, v, live)
    const value = doc => getSetting(doc, def.key)
    const common = { label: def.label, help: def.help, onCommit: commit }
    if (def.type === 'number') {
      return bind(numberField({ ...common, value: value(app.getDoc()), min: def.min, max: def.max, step: def.step, suffix: def.suffix, integer: def.step === 1, wide: !!def.wide }), value)
    }
    if (def.type === 'color') return bind(colorField({ ...common, value: value(app.getDoc()) }), value)
    if (def.type === 'boolean') return bind(toggleField({ ...common, value: value(app.getDoc()) }), value)
    if (def.type === 'select' && def.segmented) return bind(segmentedField({ ...common, value: value(app.getDoc()), options: def.options }), value)
    if (def.type === 'select') return bind(selectField({ ...common, value: value(app.getDoc()), options: def.options, wide: true }), value)
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
    out.push(h('p', { class: 'insp-hint', text: 'Nothing is selected, so these settings apply to the whole diagram. Click a line or point to edit it.' }))
    SETTING_GROUPS.forEach(group => {
      if (group.id === 'axes') { out.push(section(group.label, cornerFields(), { id: 'axes' })); return }
      out.push(section(group.label, SETTINGS.filter(s => s.group === group.id).map(settingField), { id: group.id }))
    })
    return out
  }

  // One block per corner. Fields follow the corner's position, so moving a share to
  // another corner shows it in that block.
  function cornerFields () {
    const at = (d, corner) => d.axes.find(a => a.corner === corner)
    return CORNERS.map(c => {
      const edit = (label, patch, live) => {
        const axis = at(app.getDoc(), c.id)
        if (axis) app.edit(label, d => app.commands.updateAxis(d, axis._uid, patch), live ? { coalesce: `axis:${axis._uid}:${Object.keys(patch)[0]}` } : {})
      }
      const get = key => d => (at(d, c.id) || {})[key] ?? ''
      const value = key => get(key)(app.getDoc())
      return h('div', { class: 'corner-block field-wide', dataset: { corner: c.id } },
        h('div', { class: 'corner-head' }, h('span', { class: `corner-mark corner-${c.id}`, 'aria-hidden': 'true' }), h('span', { text: c.label })),
        h('div', { class: 'corner-fields' },
          bind(textField({ label: 'Name', value: value('label'), live: true, onCommit: (v, { live }) => { if (v.trim()) edit('Edit corner name', { label: v }, live) } }), get('label')),
          bind(textField({ label: 'Arrow start', value: value('low'), live: true, wide: false, placeholder: 'Few …', onCommit: (v, { live }) => edit('Edit arrow text', { low: v }, live) }), get('low')),
          bind(textField({ label: 'Arrow end', value: value('high'), live: true, wide: false, placeholder: 'Many …', onCommit: (v, { live }) => edit('Edit arrow text', { high: v }, live) }), get('high')),
          bind(textField({
            label: 'Data column',
            value: value('id'),
            mono: true,
            wide: false,
            validate: v => {
              const axis = at(app.getDoc(), c.id)
              return axis && !axisIdAllowed(app.getDoc(), axis._uid, v.trim()) ? 'Use a name that is not empty, "series", "year" or another corner’s column' : null
            },
            onCommit: v => edit('Rename data column', { id: v.trim() })
          }), get('id')),
          bind(selectField({
            label: 'Position',
            value: c.id,
            wide: false,
            options: CORNERS.map(x => ({ value: x.id, label: x.label })),
            onCommit: v => edit('Swap corners', { corner: v })
          }), () => c.id)))
    })
  }

  // ---- series ----

  function buildSeries (doc, series) {
    const uid = series._uid
    const get = d => d.series.find(x => x._uid === uid) || series
    const edit = (label, patch, live) => app.edit(label, d => app.commands.updateSeries(d, uid, patch), live ? { coalesce: `series:${uid}:${Object.keys(patch)[0]}` } : {})
    const out = [header('Series', series.title || series.id, [
      h('button', { class: 'icon-btn danger', type: 'button', title: 'Delete series and its points (Delete)', 'aria-label': 'Delete series', onclick: () => app.deleteSelection() }, icon('trash'))
    ])]
    dynamics.push(d => { const t = root.querySelector('.insp-title'); if (t) t.textContent = get(d).title || get(d).id })
    const color = d => seriesColors(d).get(uid)
    out.push(section('Series', [
      bind(textField({ label: 'Title', value: series.title, live: true, onCommit: (v, { live }) => edit('Edit series title', { title: v }, live) }), d => get(d).title),
      bind(textField({
        label: 'ID',
        value: series.id,
        mono: true,
        validate: v => (!v.trim() ? 'An ID is required' : app.getDoc().series.some(x => x.id === v.trim() && x._uid !== uid) ? 'Another series already has this ID' : null),
        help: 'Points refer to this ID. Renaming keeps them attached.',
        onCommit: v => edit('Rename series', { id: v.trim() }, false)
      }), d => get(d).id),
      bind(textField({ label: 'Group', value: series.group, list: 'insp-groups', help: 'Optional. Series in one group share a colour family and a heading in the legend.', onCommit: v => edit('Change series group', { group: v.trim() }) }), d => get(d).group),
      groupList(doc),
      bind(colorField({ label: 'Colour', value: color(doc), onCommit: (v, { live }) => edit('Change series colour', { color: v }, live) }), color),
      bind(segmentedField({ label: 'Line', value: seriesIsDashed(series) ? 'dashed' : 'solid', options: [{ value: 'solid', label: 'Solid' }, { value: 'dashed', label: 'Dashed' }], onCommit: v => edit('Change line style', { style: v }) }), d => (seriesIsDashed(get(d)) ? 'dashed' : 'solid')),
      bind(toggleField({ label: 'Highlight', value: seriesIsHighlighted(series), help: 'Draws the line heavier, with year labels.', onCommit: v => edit(v ? 'Highlight series' : 'Remove highlight', { highlight: v }) }), d => seriesIsHighlighted(get(d))),
      bind(toggleField({ label: 'Visible', value: seriesIsVisible(series), onCommit: v => edit(v ? 'Show series' : 'Hide series', { visible: v }) }), d => seriesIsVisible(get(d)))
    ]))
    const list = h('div', { class: 'flow-summary field-wide' })
    dynamics.push(d => renderSeriesPoints(list, d, get(d)))
    out.push(section('Points', [list]))
    return out
  }

  function groupList (doc) {
    const list = h('datalist', { id: 'insp-groups' })
    dynamics.push(d => clear(list).append(...[...new Set(d.series.map(s => s.group).filter(Boolean))].map(g => h('option', { value: g }))))
    return list
  }

  function renderSeriesPoints (box, doc, series) {
    const points = doc.points.filter(p => p.series === series.id).sort((a, b) => (isFiniteNumber(a.year) && isFiniteNumber(b.year) ? a.year - b.year : 0))
    clear(box)
    box.append(
      points.length
        ? h('table', { class: 'share-table' },
          h('thead', {}, h('tr', {}, h('th', { text: 'Year' }), doc.axes.map(a => h('th', { class: 'num', text: a.label || a.id, title: a.label || a.id })))),
          h('tbody', {}, points.map(p => {
            const shares = app.sharesOf(p)
            return h('tr', { title: 'Select this point' },
              h('th', { scope: 'row' }, h('button', { type: 'button', class: 'link-btn', text: p.year === undefined || p.year === '' || p.year === null ? '—' : String(p.year), onclick: () => { app.setSelection({ points: [p._uid] }); app.reveal([p._uid]) } })),
              doc.axes.map(a => h('td', { class: 'num', text: shares ? `${formatNumber(shares[a.id] * 100, 1)}%` : '?' })))
          })))
        : h('p', { class: 'muted small', text: 'No points yet. Double-click in the triangle to add one.' }),
      h('button', { type: 'button', class: 'btn btn-ghost btn-small', onclick: () => app.addPointToSeries(series._uid) }, icon('plus', 14), 'Add point')
    )
  }

  // ---- point ----

  function buildPoint (doc, point) {
    const uid = point._uid
    const get = d => d.points.find(x => x._uid === uid) || point
    const edit = (label, patch, live) => app.edit(label, d => app.commands.updatePoint(d, uid, patch), live ? { coalesce: `point:${uid}:${Object.keys(patch)[0]}` } : {})
    const title = d => {
      const p = get(d)
      const s = d.series.find(x => x.id === p.series)
      return `${(s && (s.title || s.id)) || p.series || '?'}, ${isFiniteNumber(p.year) ? p.year : p.year || 'no year'}`
    }
    const out = [header('Point', title(doc), [
      h('button', { class: 'icon-btn danger', type: 'button', title: 'Delete point (Delete)', 'aria-label': 'Delete point', onclick: () => app.deleteSelection() }, icon('trash'))
    ])]
    dynamics.push(d => { const t = root.querySelector('.insp-title'); if (t) t.textContent = title(d) })
    const seriesOptions = d => {
      const o = d.series.map(s => ({ value: s.id, label: s.title && s.title !== s.id ? `${s.title} (${s.id})` : s.id }))
      const v = get(d).series
      return o.some(x => x.value === v) ? o : [{ value: v || '', label: v ? `${v} (missing)` : '— choose —' }, ...o]
    }
    const unit = getSetting(doc, 'unit')
    out.push(section('Point', [
      bind(selectField({ label: 'Series', value: point.series, options: seriesOptions(doc), onCommit: v => edit('Move point to another series', { series: v }) }), d => get(d).series),
      bind(numberField({ label: 'Year', value: point.year, step: 1, integer: true, wide: true, onCommit: (v, { live }) => edit('Change year', { year: v }, live) }), d => get(d).year)
    ]))
    out.push(section('Values', [
      ...doc.axes.map(a => bind(numberField({ label: a.label || a.id, value: point[a.id], min: 0, step: 'any', suffix: unit || undefined, wide: true, onCommit: (v, { live }) => edit(`Change ${(a.label || a.id).toLowerCase()}`, { [a.id]: v }, live) }), d => get(d)[a.id]))
    ]))
    const mix = h('div', { class: 'mix field-wide' })
    dynamics.push(d => renderMix(mix, d, get(d)))
    out.push(section('Mix', [mix]))
    return out
  }

  // The point's shares as a bar with a row per corner.
  function renderMix (box, doc, point) {
    const shares = app.sharesOf(point)
    clear(box)
    if (!shares) {
      box.append(h('p', { class: 'muted small', text: 'This point can’t be placed yet: each corner needs a value of 0 or more, and not all zero.' }))
      return
    }
    const total = doc.axes.reduce((sum, a) => sum + point[a.id], 0)
    const tones = ['#5E9A78', '#4F7FA6', '#8C8479']
    box.append(
      h('div', { class: 'mix-bar', role: 'img', 'aria-label': doc.axes.map(a => `${a.label} ${Math.round(shares[a.id] * 100)}%`).join(', ') },
        doc.axes.map((a, i) => h('span', { style: { width: `${shares[a.id] * 100}%`, background: tones[i % 3] } }))),
      h('div', { class: 'mix-rows' }, doc.axes.map((a, i) => h('div', { class: 'mix-row' },
        h('span', { class: 'dot', style: { background: tones[i % 3] } }),
        h('span', { class: 'mix-name', text: a.label || a.id }),
        h('strong', { text: `${formatNumber(shares[a.id] * 100, 1)}%` })))),
      h('div', { class: 'mix-total' }, h('span', { text: 'Total' }), h('strong', { text: formatValue(total, getSetting(doc, 'decimals'), getSetting(doc, 'unit')) })),
      h('p', { class: 'field-help', text: 'Dragging the point changes its mix and keeps this total. Hold Shift for whole percents.' })
    )
  }

  // ---- several ----

  function buildMulti (doc, _target, sel) {
    const series = [...sel.series]
    const points = [...sel.points]
    const parts = [series.length && plural(series.length, 'series', 'series'), points.length && plural(points.length, 'point', 'points')].filter(Boolean)
    const out = [header('Selection', parts.join(', '), [
      h('button', { class: 'icon-btn danger', type: 'button', title: 'Delete selection (Delete)', 'aria-label': 'Delete selection', onclick: () => app.deleteSelection() }, icon('trash'))
    ])]
    if (series.length) {
      const setAll = (label, patch) => app.edit(label, d => series.reduce((acc, u) => app.commands.updateSeries(acc, u, patch), d))
      out.push(section('Series', [
        segmentedField({ label: 'Line', value: null, options: [{ value: 'solid', label: 'Solid' }, { value: 'dashed', label: 'Dashed' }], onCommit: v => setAll('Change line style', { style: v }) }).el,
        segmentedField({ label: 'Highlight', value: null, options: [{ value: 'on', label: 'On' }, { value: 'off', label: 'Off' }], onCommit: v => setAll('Change highlight', { highlight: v === 'on' }) }).el,
        segmentedField({ label: 'Visible', value: null, options: [{ value: 'on', label: 'Show' }, { value: 'off', label: 'Hide' }], onCommit: v => setAll('Change visibility', { visible: v === 'on' }) }).el,
        textField({ label: 'Group', value: '', placeholder: 'Set one group for all', onCommit: v => { if (v.trim()) setAll('Change series group', { group: v.trim() }) } }).el
      ]))
    }
    if (points.length) {
      out.push(section('Points', [
        selectField({
          label: 'Move to series',
          value: '',
          options: [{ value: '', label: '— choose —' }, ...doc.series.map(s => ({ value: s.id, label: s.title || s.id }))],
          onCommit: v => { if (v) app.edit('Move points to another series', d => points.reduce((acc, u) => app.commands.updatePoint(acc, u, { series: v }), d)) }
        }).el
      ]))
    }
    return out
  }

  // Bring a section of the settings into view (e.g. the corners).
  function showSection (id) {
    const el = root.querySelector(`details[data-section="${id}"]`)
    if (!el) return
    el.open = true
    el.scrollIntoView({ block: 'start' })
  }

  return { render, showSection, reset: () => { formKey = null } }
}
