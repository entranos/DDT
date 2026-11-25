// The right-hand panel. Shows what is selected and lets you edit it in place:
//   nothing selected → chart settings, grouped by what they change
//   one part of a bar → its value, icon and pattern
//   one bar / series → its fields
//   several items → bulk actions

import { h, icon, clear } from '../../../shared/src/dom.js'
import { textField, textAreaField, numberField, colorField, toggleField, selectField, segmentedField } from '../../../shared/src/fields.js'
import { iconField } from '../../../shared/src/iconField.js'
import { patternField } from '../../../shared/src/patternField.js'
import { iconOf, namedIcon } from '../../../shared/src/icons.js'
import { patternOf, fillOf } from '../../../shared/src/patterns.js'
import { SETTINGS, SETTING_GROUPS, FONT_CHOICES, getSetting, isFiniteNumber, isVisible, seriesColor, hexColor, iconKey, patternKey, patternColorKey, iconRows } from '../model/schema.js'
import { seriesIdAllowed, seriesNameTaken } from '../model/commands.js'
import { formatAmount, formatShare } from '../render/chart.js'
import { formatNumber } from '../../../shared/src/format.js'

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`
const trimmed = v => String(v ?? '').trim()

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
    const lists = { bar: 'bars', series: 'series' }
    const picked = Object.entries(lists).flatMap(([mode, key]) => [...sel[key]].map(uid => ({ mode, uid })))
    let mode = !picked.length ? 'settings' : picked.length > 1 ? 'multi' : picked[0].mode
    const target = lists[mode] ? doc[lists[mode]].find(x => x._uid === picked[0].uid) : null
    if (lists[mode] && !target) { app.setSelection({}); return }
    const cell = mode === 'bar' && app.cell && app.cell.bar === target._uid ? doc.series.find(s => s._uid === app.cell.series) : null
    if (cell) mode = 'part'
    // Forms that list the series are rebuilt when those change.
    const names = ['bar', 'part'].includes(mode) ? [doc.series.map(s => `${s._uid}|${s.id}|${s.title}`).join(), getSetting(doc, 'unit'), getSetting(doc, 'multiply'), doc.series.filter(isVisible).length === 1].join(';') : ''
    const key = `${mode}:${picked.map(p => p.uid).sort().join(',')}:${cell ? cell._uid : ''}:${names}`
    if (key !== formKey) {
      formKey = key
      bindings = []
      dynamics = []
      iconPicker = null
      const scroll = mode === 'settings' && root.dataset.mode === 'settings' ? root.scrollTop : 0
      clear(root)
      root.dataset.mode = mode
      const builders = { settings: buildSettings, bar: buildBar, part: buildPart, series: buildSeries, multi: buildMulti }
      root.append(...[builders[mode](doc, target, sel, cell)].flat())
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
  const patternStyle = () => getSetting(app.getDoc(), 'patternStyle')

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

  // Settings that only matter in some charts.
  const share = d => getSetting(d, 'mode') === 'share'
  const several = d => d.series.filter(s => isVisible(s) && s.id).length > 1
  const HIDE = {
    pxPerUnit: d => share(d) || getSetting(d, 'scaleMode') !== 'fixed',
    scaleMode: share,
    axisMax: share,
    nameAngle: d => getSetting(d, 'orientation') === 'horizontal' || !getSetting(d, 'showNames'),
    showGroupNames: d => !d.bars.some(b => b.group),
    groupGap: d => new Set(d.bars.filter(isVisible).map(b => b.group || '')).size < 2,
    legend: d => !several(d),
    seriesGap: d => !several(d),
    axisTitle: d => !getSetting(d, 'showAxis'),
    iconSize: d => getSetting(d, 'barIcons') === 'none' && !getSetting(d, 'seriesIcons'),
    patternSize: d => !anyPattern(d),
    patternWeight: d => !anyPattern(d)
  }
  const anyPattern = d => [...d.series, ...d.bars].some(r => Object.keys(r).some(k => (k === 'pattern' || k.endsWith('_pattern')) && trimmed(r[k])))

  function buildSettings (doc) {
    // The heading is the chart title itself: edit it here, on the canvas or in the Title section.
    const titleInput = h('input', {
      class: 'insp-title insp-title-input',
      type: 'text',
      value: getSetting(doc, 'title'),
      placeholder: 'Untitled chart',
      spellcheck: 'false',
      autocomplete: 'off',
      'aria-label': 'Chart title',
      title: 'Chart title (click to edit)'
    })
    titleInput.addEventListener('input', () => app.setSetting('title', titleInput.value, true))
    titleInput.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === 'Escape') titleInput.blur() })
    bindings.push({ get: d => getSetting(d, 'title'), update: v => { if (document.activeElement !== titleInput) titleInput.value = v ?? '' } })
    const out = [h('div', { class: 'insp-head' },
      h('div', { class: 'insp-kind', text: 'Chart' }),
      h('div', { class: 'insp-title-row' }, titleInput))]
    out.push(h('p', { class: 'insp-hint', text: 'Nothing is selected, so these settings apply to the whole chart. Click a part of a bar or a name to edit it.' }))
    SETTING_GROUPS.forEach(group => {
      const fields = SETTINGS.filter(s => s.group === group.id).map(def => {
        const el = settingField(def)
        if (HIDE[def.key]) dynamics.push(d => { el.hidden = HIDE[def.key](d) })
        return el
      })
      if (group.id === 'scale') fields.splice(2, 0, scaleReadout())
      if (group.id === 'fills') {
        const hint = h('p', { class: 'field-help field-wide', text: 'Choose a pattern with a series, a bar or one part of a bar.' })
        dynamics.push(d => { hint.hidden = anyPattern(d) })
        fields.push(hint)
      }
      out.push(section(group.label, fields, { id: group.id }))
    })
    return out
  }

  // The scale the chart is drawn at, and a way to keep it for other charts.
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
      const px = Math.max(1, Math.min(34, n * per))
      box.append(
        h('span', { class: 'scale-stick', style: res.horizontal ? { width: `${px}px`, height: '12px' } : { height: `${px}px`, width: '12px' } }),
        h('p', {}, `${formatNumber(n, 0)} ${unit} is drawn `, h('strong', { text: `${formatNumber(n * per, 1)} px` }), res.horizontal ? ' long.' : ' high.'),
        getSetting(d, 'scaleMode') === 'fit'
          ? h('button', { type: 'button', class: 'btn btn-small', text: 'Keep this scale', title: 'Switch to fixed pixels per unit, at the current size', onclick: () => app.keepScale() })
          : (res.fits ? '' : h('p', { class: 'warn-text', text: 'At this scale the chart doesn’t fit the canvas.' })))
    })
    return box
  }

  // ---- shared parts ----

  const unitSuffix = d => (getSetting(d, 'multiply') === 1 ? getSetting(d, 'unit') || undefined : undefined)

  function barPattern (get, set) {
    const color = () => { const d = app.getDoc(); const b = get(d); const s = d.series.find(x => isVisible(x) && x.id); return hexColor(b.color) || (s ? seriesColor(d, s) : '#857F78') }
    return bind(patternField({
      label: 'Pattern of the whole bar',
      value: () => get(app.getDoc()).pattern,
      shown: () => patternOf(get(app.getDoc()).pattern),
      color,
      style: patternStyle,
      auto: { label: 'From the series', title: 'The pattern of each series', text: 'from the series' },
      onCommit: v => set({ pattern: v }, 'Change pattern', false),
      mark: { value: () => get(app.getDoc()).patterncolor, shown: () => fillOf(get(app.getDoc())).mark, onCommit: (v, { live }) => set({ patterncolor: v }, 'Change second colour', live) }
    }), () => null)
  }

  // ---- one part of a bar ----

  function buildPart (doc, bar, _sel, series) {
    const barUid = bar._uid
    const uid = series._uid
    const getBar = d => d.bars.find(x => x._uid === barUid) || bar
    const getSeries = d => d.series.find(x => x._uid === uid) || series
    const title = d => `${getBar(d).title || '(no name)'}, ${getSeries(d).title || getSeries(d).id}`
    const edit = (label, fn, live) => app.edit(label, d => fn(d, getSeries(d).id), live ? { coalesce: `part:${barUid}:${uid}` } : {})
    const out = [header('Value', title(doc))]
    liveTitle(title)
    const iconColumn = d => getBar(d)[iconKey(getSeries(d).id)]
    const patternColumn = d => getBar(d)[patternKey(getSeries(d).id)]
    out.push(section('Value', [
      bind(numberField({ label: 'Value', value: bar[series.id], step: 'any', suffix: unitSuffix(doc), wide: true, onCommit: (v, { live }) => edit('Change value', (d, id) => app.commands.setValue(d, barUid, id, v), live) }), d => getBar(d)[getSeries(d).id]),
      pickIcon(iconField({
        label: 'Icon',
        value: () => iconColumn(app.getDoc()),
        shown: () => { const d = app.getDoc(); const own = trimmed(iconColumn(d)); const s = getSeries(d); return own ? namedIcon(own) : iconOf({ id: s.id, icon: s.icon }) },
        rows,
        auto: { label: 'From the series', title: 'The icon of the series', text: 'from the series' },
        onCommit: v => edit('Change icon', (d, id) => app.commands.setPartIcon(d, barUid, id, v))
      })),
      bind(patternField({
        label: 'Pattern',
        value: () => patternColumn(app.getDoc()),
        shown: () => { const d = app.getDoc(); return patternOf(patternColumn(d), getBar(d).pattern, getSeries(d).pattern) },
        color: () => { const d = app.getDoc(); return seriesColor(d, getSeries(d)) },
        style: patternStyle,
        auto: { label: 'From bar or series', title: 'The pattern of the bar, or else of the series', text: 'from bar or series' },
        onCommit: v => edit('Change pattern', (d, id) => app.commands.setPartPattern(d, barUid, id, v)),
        mark: {
          value: () => { const d = app.getDoc(); return getBar(d)[patternColorKey(getSeries(d).id)] },
          shown: () => { const d = app.getDoc(); return fillOf({ pattern: patternColumn(d), patterncolor: getBar(d)[patternColorKey(getSeries(d).id)] }, getBar(d), getSeries(d)).mark },
          onCommit: (v, { live }) => edit('Change second colour', (d, id) => app.commands.setPartPatternColor(d, barUid, id, v), live)
        }
      }), () => null),
      link(`Colour, pattern and icon of ${series.title || series.id}`, () => app.setSelection({ series: [uid] })),
      link(`Name, group, icon and all amounts of ${bar.title || 'this bar'}`, () => app.setSelection({ bars: [barUid] }))
    ]))
    const info = h('p', { class: 'field-help' })
    dynamics.push(d => {
      const p = app.partInfo(barUid, uid)
      info.textContent = p ? `${formatShare(p.share)} of ${getBar(d).title || 'the bar'} (${formatAmount(d, p.total)} in all).` : 'Not drawn: the bar or the series is hidden.'
    })
    out.push(info)
    return out
  }

  // ---- bar ----

  function buildBar (doc, bar) {
    const uid = bar._uid
    const get = d => d.bars.find(x => x._uid === uid) || bar
    const edit = (label, patch, live) => app.edit(label, d => app.commands.updateBar(d, uid, patch), live ? { coalesce: `bar:${uid}:${Object.keys(patch)[0]}` } : {})
    const name = d => get(d).title || '(no name)'
    const out = [header('Bar', name(doc), [deleteButton('Delete bar')])]
    liveTitle(name)
    const groupList = h('datalist', { id: 'insp-groups' })
    dynamics.push(d => clear(groupList).append(...[...new Set(d.bars.map(b => b.group).filter(Boolean))].map(g => h('option', { value: g }))))
    const single = !several(doc)
    const firstColor = d => { const s = d.series.find(x => isVisible(x) && x.id); return s ? seriesColor(d, s) : '#857F78' }
    const clearColor = link('Back to the colour of the series', () => edit('Change bar colour', { color: '' }))
    dynamics.push(d => { clearColor.hidden = !hexColor(get(d).color) })
    out.push(section('Bar', [
      bind(textField({ label: 'Name', value: bar.title, live: true, onCommit: (v, { live }) => edit('Rename bar', { title: v }, live) }), d => get(d).title),
      bind(textField({ label: 'Group', value: bar.group, list: 'insp-groups', help: 'Optional. Bars of one group are drawn together under its name.', onCommit: v => edit('Change group', { group: v }) }), d => get(d).group),
      groupList,
      pickIcon(iconField({
        label: 'Icon',
        value: () => get(app.getDoc()).icon,
        shown: () => { const b = get(app.getDoc()); return trimmed(b.icon) ? namedIcon(b.icon) : iconOf({ id: b.title, icon: '' }) },
        rows,
        auto: { label: 'Automatic', title: 'An icon by the name, if there is one', text: 'automatic' },
        onCommit: v => edit('Change icon', { icon: v })
      })),
      ...(single ? [bind(colorField({ label: 'Colour', value: hexColor(bar.color) || firstColor(doc), onCommit: (v, { live }) => edit('Change bar colour', { color: v }, live) }), d => hexColor(get(d).color) || firstColor(d)), clearColor] : []),
      barPattern(get, (patch, label, live) => edit(label, patch, live)),
      bind(toggleField({ label: 'Visible', value: isVisible(bar), onCommit: () => app.toggleVisible(uid) }), d => isVisible(get(d))),
      bind(textAreaField({ label: 'Note', value: bar.note, placeholder: 'Shown when hovering the bar', onCommit: v => edit('Edit note', { note: v }) }), d => get(d).note),
      moveButtons('bars', uid)
    ]))
    const total = h('div', { class: 'mix-total field-wide' })
    dynamics.push(d => {
      const sum = d.series.filter(s => isVisible(s) && isFiniteNumber(get(d)[s.id])).reduce((t, s) => t + get(d)[s.id], 0) * (getSetting(d, 'multiply') || 1)
      clear(total).append(h('span', { text: 'Total' }), h('strong', { text: formatAmount(d, sum) }))
    })
    out.push(section('Amounts', [
      ...doc.series.filter(s => s.id).map(s => bind(numberField({ label: s.title || s.id, value: bar[s.id], step: 'any', suffix: unitSuffix(doc), onCommit: (v, { live }) => edit('Change amount', { [s.id]: v }, live) }), d => get(d)[(d.series.find(x => x._uid === s._uid) || s).id])),
      doc.series.length > 1 ? total : null
    ]))
    return out
  }

  // ---- series ----

  function buildSeries (doc, series) {
    const uid = series._uid
    const get = d => d.series.find(x => x._uid === uid) || series
    const edit = (label, patch, live) => app.edit(label, d => app.commands.updateSeries(d, uid, patch), live ? { coalesce: `series:${uid}:${Object.keys(patch)[0]}` } : {})
    const name = d => get(d).title || get(d).id
    const out = [header('Series', name(doc), [deleteButton('Delete series and its amounts')])]
    liveTitle(name)
    out.push(section('Series', [
      bind(textField({ label: 'Title', value: series.title, validate: v => (!v.trim() ? 'A name is required' : seriesNameTaken(app.getDoc(), uid, v) ? 'Another series already has this name' : null), onCommit: v => app.renameSeries(uid, v) }), d => get(d).title),
      bind(textField({
        label: 'Data column',
        value: series.id,
        mono: true,
        validate: v => (seriesIdAllowed(app.getDoc(), uid, v.trim()) ? null : 'Use a name that is not empty, a column of the table itself, or another series’'),
        help: 'The column of the bars table. Renaming moves its amounts along.',
        onCommit: v => edit('Rename data column', { id: v.trim() })
      }), d => get(d).id),
      bind(colorField({ label: 'Colour', value: seriesColor(doc, series), onCommit: (v, { live }) => edit('Change series colour', { color: v }, live) }), d => seriesColor(d, get(d))),
      bind(patternField({ value: () => get(app.getDoc()).pattern, shown: () => patternOf(get(app.getDoc()).pattern), color: () => seriesColor(app.getDoc(), get(app.getDoc())), style: patternStyle, onCommit: v => edit('Change pattern', { pattern: v }), mark: { value: () => get(app.getDoc()).patterncolor, shown: () => fillOf(get(app.getDoc())).mark, onCommit: (v, { live }) => edit('Change second colour', { patterncolor: v }, live) } }), () => null),
      pickIcon(iconField({ label: 'Icon', value: () => get(app.getDoc()).icon, shown: () => { const s = get(app.getDoc()); return iconOf({ id: s.id, icon: s.icon }) }, rows, onCommit: v => edit('Change icon', { icon: v }) })),
      bind(toggleField({ label: 'Visible', value: isVisible(series), onCommit: () => app.toggleVisible(uid) }), d => isVisible(get(d))),
      moveButtons('series', uid)
    ]))
    const box = h('div', { class: 'flow-summary field-wide' })
    dynamics.push(d => {
      const s = get(d)
      const multiply = getSetting(d, 'multiply') || 1
      const list = d.bars.filter(b => isFiniteNumber(b[s.id]))
      const total = list.filter(isVisible).reduce((t, b) => t + b[s.id], 0) * multiply
      clear(box).append(
        h('div', { class: 'mix-total' }, h('span', { text: 'Total' }), h('strong', { text: formatAmount(d, total) })),
        list.length
          ? h('div', { class: 'flow-list' }, list.map(b => h('button', { type: 'button', class: 'flow-row', title: 'Select this value', onclick: () => { app.setSelection({ bars: [b._uid] }, { bar: b._uid, series: uid }); app.reveal([b._uid]) } },
            h('span', { class: 'flow-row-name', text: b.title || '(no name)' }),
            h('span', { class: 'flow-row-value', text: formatAmount(d, b[s.id] * multiply) }))))
          : h('p', { class: 'muted small', text: 'No amounts yet.' }))
    })
    out.push(section('Amounts', [box]))
    return out
  }

  // ---- several ----

  function buildMulti (doc, _target, sel) {
    const bars = [...sel.bars]
    const series = [...sel.series]
    const parts = [bars.length && plural(bars.length, 'bar', 'bars'), series.length && `${series.length} series`].filter(Boolean)
    const out = [header('Selection', parts.join(', '), [deleteButton('Delete selection')])]
    const shown = (uids, command) => segmentedField({ label: 'Visible', value: null, options: [{ value: 'on', label: 'Show' }, { value: 'off', label: 'Hide' }], onCommit: v => app.edit('Change visibility', d => uids.reduce((acc, u) => command(acc, u, { visible: v === 'on' }), d)) }).el
    const common = (kind, uids, key) => { const list = [...new Set(app.getDoc()[kind].filter(r => uids.includes(r._uid)).map(r => trimmed(r[key])))]; return list.length === 1 ? list[0] : list.length ? null : '' }
    const bulk = (kind, uids, command) => {
      const setAll = (label, patch) => app.edit(label, d => uids.reduce((acc, u) => command(acc, u, patch), d))
      const firstColor = () => { const d = app.getDoc(); const s = kind === 'series' ? d.series.find(x => x._uid === uids[0]) : d.series.find(x => isVisible(x) && x.id); return s ? seriesColor(d, s) : '#857F78' }
      return [
        pickIcon(iconField({ label: 'Icon for all', value: () => common(kind, uids, 'icon'), shown: () => namedIcon(common(kind, uids, 'icon')), rows, onCommit: v => setAll('Change icons', { icon: v }) })),
        bind(patternField({ label: 'Pattern for all', value: () => common(kind, uids, 'pattern'), shown: () => patternOf(common(kind, uids, 'pattern') || ''), color: firstColor, style: patternStyle, auto: kind === 'bars' ? { label: 'From the series', title: 'The pattern of each series', text: 'from the series' } : null, onCommit: v => setAll('Change patterns', { pattern: v }), mark: { value: () => common(kind, uids, 'patterncolor') || '', shown: () => fillOf({ pattern: common(kind, uids, 'pattern'), patterncolor: common(kind, uids, 'patterncolor') }).mark, onCommit: (v, { live }) => app.edit('Change second colours', d => uids.reduce((acc, u) => command(acc, u, { patterncolor: v }), d), live ? { coalesce: `${kind}:patterncolor` } : {}) } }), () => null),
        shown(uids, command)
      ]
    }
    if (bars.length) {
      const total = h('p', { class: 'field-help field-wide' })
      dynamics.push(d => {
        const ids = d.series.filter(isVisible).map(s => s.id)
        const sum = d.bars.filter(b => bars.includes(b._uid)).reduce((t, b) => t + ids.reduce((x, id) => x + (isFiniteNumber(b[id]) ? b[id] : 0), 0), 0) * (getSetting(d, 'multiply') || 1)
        total.textContent = `Together ${formatAmount(d, sum)}.`
      })
      out.push(section('Bars', [
        total,
        textField({ label: 'Group', value: '', placeholder: 'Set one group for all', onCommit: v => { if (v.trim()) app.edit('Change group', d => bars.reduce((acc, u) => app.commands.updateBar(acc, u, { group: v.trim() }), d)) } }).el,
        ...(several(doc) ? [] : [colorField({ label: 'Colour for all', value: '', onCommit: (v, { live }) => app.edit('Change bar colours', d => bars.reduce((acc, u) => app.commands.updateBar(acc, u, { color: v }), d), live ? { coalesce: 'bars:color' } : {}) }).el]),
        ...bulk('bars', bars, app.commands.updateBar)
      ]))
    }
    if (series.length) out.push(section('Series', bulk('series', series, app.commands.updateSeries)))
    return out
  }

  return { render, openIconPicker: () => { if (iconPicker) iconPicker.open() }, reset: () => { formKey = null } }
}
