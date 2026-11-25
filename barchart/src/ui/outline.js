// The left-hand panel: searchable lists of bars (by group) and series. Clicking an item
// selects it (Shift/Cmd adds) and brings it into view.

import { h, icon, clear } from '../../../shared/src/dom.js'
import { isVisible, seriesColor, getSetting, isFiniteNumber } from '../model/schema.js'
import { formatAmount } from '../render/chart.js'

const KEYS = ['bars', 'series']

export function createOutline (root, app) {
  let filter = ''
  const search = h('input', { type: 'search', class: 'input search', placeholder: 'Find bars and series', 'aria-label': 'Find bars and series', spellcheck: 'false' })
  search.addEventListener('input', () => { filter = search.value.trim().toLowerCase(); renderLists() })
  search.addEventListener('keydown', e => { if (e.key === 'Escape') { search.value = ''; filter = ''; renderLists(); search.blur() } })

  const groups = {
    bars: makeGroup('Bars', 'Add bar', () => app.addBar()),
    series: makeGroup('Series', 'Add series', () => app.addSeries())
  }
  root.append(h('div', { class: 'outline-search' }, icon('search', 14), search), h('div', { class: 'outline-groups' }, Object.values(groups).map(g => g.el)))

  function makeGroup (title, addLabel, onAdd) {
    const count = h('span', { class: 'count' })
    const list = h('ul', { class: 'outline-list', role: 'listbox', 'aria-multiselectable': 'true', 'aria-label': title })
    const el = h('details', { class: 'outline-group', open: true },
      h('summary', {}, icon('chevron', 14), h('span', { class: 'outline-title', text: title }), count,
        h('button', { class: 'icon-btn small', type: 'button', title: addLabel, 'aria-label': addLabel, onclick: e => { e.preventDefault(); onAdd() } }, icon('plus', 14))),
      list)
    return { el, list, count }
  }

  function onItemClick (key, uid, e) {
    const sel = app.selection
    if (e.shiftKey || e.metaKey || e.ctrlKey) {
      const next = Object.fromEntries(KEYS.map(k => [k, [...sel[k]]]))
      const set = new Set(next[key])
      set.has(uid) ? set.delete(uid) : set.add(uid)
      next[key] = [...set]
      app.setSelection(next)
    } else {
      app.setSelection({ [key]: [uid] })
      app.reveal([uid])
    }
  }

  function item (key, uid, { before = null, after = null, muted = false, title, ondblclick }, children) {
    const btn = h('button', { type: 'button', class: `outline-item${muted ? ' muted-item' : ''}`, role: 'option', dataset: { key, uid }, title, onclick: e => onItemClick(key, uid, e), ondblclick }, children)
    return h('li', {}, before, btn, after)
  }

  const matches = (...values) => !filter || values.some(v => v !== undefined && v !== null && String(v).toLowerCase().includes(filter))

  function eyeFor (row, name) {
    const shown = isVisible(row)
    return h('button', { type: 'button', class: `icon-btn small eye${shown ? '' : ' off'}`, title: shown ? `Hide ${name}` : `Show ${name}`, 'aria-label': shown ? `Hide ${name}` : `Show ${name}`, 'aria-pressed': String(shown), onclick: () => app.toggleVisible(row._uid) }, icon(shown ? 'eye' : 'eyeOff', 14))
  }

  function fill (key, rows, total, items) {
    clear(groups[key].list).append(...items)
    groups[key].count.textContent = filter ? `${rows.length}/${total}` : String(total)
  }

  function renderLists () {
    const doc = app.getDoc()
    if (!doc) { Object.values(groups).forEach(g => { clear(g.list); g.count.textContent = '' }); return }
    const multiply = getSetting(doc, 'multiply') || 1
    const amount = v => formatAmount(doc, v * multiply, { unit: false })
    const shownSeries = doc.series.filter(s => isVisible(s) && s.id)

    const bars = doc.bars.filter(b => matches(b.title, b.group))
    const names = [...new Set(bars.map(b => b.group || ''))]
    const items = names.flatMap(g => [
      ...(g ? [h('li', { class: 'outline-subhead', role: 'presentation' }, g)] : []),
      ...bars.filter(b => (b.group || '') === g).map(b => item('bars', b._uid, { after: eyeFor(b, b.title || 'this bar'), muted: !isVisible(b), title: `${b.title}. Double-click to edit its amounts in the Data table.`, ondblclick: () => app.editBarCell(b._uid) }, [
        h('span', { class: 'item-main', text: b.title || '(no name)' }),
        h('span', { class: 'item-value', text: amount(shownSeries.reduce((s, x) => s + (isFiniteNumber(b[x.id]) ? b[x.id] : 0), 0)) })
      ]))
    ])
    fill('bars', bars, doc.bars.length, items)

    const series = doc.series.filter(s => matches(s.id, s.title))
    fill('series', series, doc.series.length, series.map(s => {
      const name = s.title || s.id || '(no name)'
      const swatch = h('input', { type: 'color', class: 'swatch small', value: seriesColor(doc, s), title: `Colour of ${name}`, 'aria-label': `Colour of ${name}` })
      swatch.addEventListener('input', () => app.edit('Change series colour', d => app.commands.updateSeries(d, s._uid, { color: swatch.value }), { coalesce: `series:${s._uid}:color` }))
      return item('series', s._uid, { before: swatch, after: eyeFor(s, name), muted: !isVisible(s) }, [h('span', { class: 'item-main', text: name })])
    }))
    renderSelection()
  }

  function renderSelection () {
    const sel = app.selection
    root.querySelectorAll('.outline-item').forEach(el => {
      const on = sel[el.dataset.key].has(el.dataset.uid)
      el.classList.toggle('selected', on)
      el.setAttribute('aria-selected', String(on))
    })
    const first = root.querySelector('.outline-item.selected')
    if (first && !root.contains(document.activeElement)) first.scrollIntoView({ block: 'nearest' })
  }

  return { render: renderLists, renderSelection, focusSearch: () => search.focus() }
}
