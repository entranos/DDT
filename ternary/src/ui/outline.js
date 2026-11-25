// The left-hand panel: searchable lists of series and points. Clicking an item
// selects it (Shift/Cmd adds) and brings it into view.

import { h, icon, clear } from '../../../shared/src/dom.js'
import { isFiniteNumber, seriesIsVisible } from '../model/schema.js'
import { seriesColors } from '../model/mix.js'

export function createOutline (root, app) {
  let filter = ''
  const search = h('input', { type: 'search', class: 'input search', placeholder: 'Find series, points', 'aria-label': 'Find series and points', spellcheck: 'false' })
  search.addEventListener('input', () => { filter = search.value.trim().toLowerCase(); renderLists() })
  search.addEventListener('keydown', e => { if (e.key === 'Escape') { search.value = ''; filter = ''; renderLists(); search.blur() } })

  const groups = {
    series: makeGroup('Series', 'Add series', () => app.addSeries()),
    points: makeGroup('Points', 'Add point', () => app.addPointToSelection())
  }
  root.append(h('div', { class: 'outline-search' }, icon('search', 14), search), h('div', { class: 'outline-groups' }, groups.series.el, groups.points.el))

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
      const next = { series: [...sel.series], points: [...sel.points] }
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

  function matches (...values) {
    if (!filter) return true
    return values.some(v => v !== undefined && v !== null && String(v).toLowerCase().includes(filter))
  }

  function renderLists () {
    const doc = app.getDoc()
    if (!doc) { Object.values(groups).forEach(g => { clear(g.list); g.count.textContent = '' }); return }
    const colors = seriesColors(doc)
    const byId = new Map(doc.series.map(s => [s.id, s]))
    const counts = new Map()
    doc.points.forEach(p => counts.set(p.series, (counts.get(p.series) || 0) + 1))

    const series = doc.series.filter(s => matches(s.id, s.title, s.group))
    clear(groups.series.list).append(...series.map(s => {
      const name = s.title || s.id || '(no ID)'
      const shown = seriesIsVisible(s)
      const swatch = h('input', { type: 'color', class: 'swatch small', value: colors.get(s._uid), title: `Colour of ${name}`, 'aria-label': `Colour of ${name}` })
      swatch.addEventListener('input', () => app.edit('Change series colour', d => app.commands.updateSeries(d, s._uid, { color: swatch.value }), { coalesce: `series:${s._uid}:color` }))
      const eye = h('button', { type: 'button', class: `icon-btn small eye${shown ? '' : ' off'}`, title: shown ? `Hide ${name}` : `Show ${name}`, 'aria-label': shown ? `Hide ${name}` : `Show ${name}`, 'aria-pressed': String(shown), onclick: () => app.toggleSeries(s._uid) }, icon(shown ? 'eye' : 'eyeOff', 14))
      return item('series', s._uid, { before: swatch, after: eye, muted: !shown, title: s.group ? `${name} (${s.group})` : name }, [
        h('span', { class: 'item-main', text: name }),
        h('span', { class: 'item-value', text: String(counts.get(s.id) || 0), title: 'Points in this series' })
      ])
    }))
    groups.series.count.textContent = filter ? `${series.length}/${doc.series.length}` : String(doc.series.length)

    const points = doc.points.filter(p => { const s = byId.get(p.series); return matches(p.series, s && s.title, p.year) })
    const order = new Map(doc.series.map((s, i) => [s.id, i]))
    points.sort((a, b) => (order.get(a.series) ?? 1e9) - (order.get(b.series) ?? 1e9) || (isFiniteNumber(a.year) && isFiniteNumber(b.year) ? a.year - b.year : 0))
    clear(groups.points.list).append(...points.map(p => {
      const s = byId.get(p.series)
      const shares = app.sharesOf(p)
      const text = shares ? doc.axes.map(a => Math.round(shares[a.id] * 100)).join(' · ') : '?'
      const title = shares ? doc.axes.map(a => `${a.label || a.id} ${(shares[a.id] * 100).toFixed(1)}%`).join(', ') : 'This point can’t be placed: see the Issues tab'
      return item('points', p._uid, { muted: s ? !seriesIsVisible(s) : true, title: `${title}. Double-click to edit its values in the Data table.`, ondblclick: () => app.editPointCell(p._uid) }, [
        h('span', { class: 'dot', style: { background: s ? colors.get(s._uid) : 'transparent', borderColor: s ? 'transparent' : '#c44' } }),
        h('span', { class: 'item-main', text: `${(s && (s.title || s.id)) || p.series || '?'}, ${p.year === undefined || p.year === '' || p.year === null ? 'no year' : p.year}` }),
        h('span', { class: 'item-value', text })
      ])
    }))
    groups.points.count.textContent = filter ? `${points.length}/${doc.points.length}` : String(doc.points.length)
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
