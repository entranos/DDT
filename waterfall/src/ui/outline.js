// The left-hand panel: searchable lists of diagrams, moments, carriers and values.
// Clicking an item selects it (Shift/Cmd adds) and brings it into view.

import { h, icon, clear } from '../../../shared/src/dom.js'
import { isVisible, carrierColor, getSetting, isFiniteNumber } from '../model/schema.js'
import { formatAmount } from '../render/waterfall.js'

const KEYS = ['diagrams', 'moments', 'carriers', 'values']

export function createOutline (root, app) {
  let filter = ''
  const search = h('input', { type: 'search', class: 'input search', placeholder: 'Find diagrams, moments, carriers', 'aria-label': 'Find diagrams, moments, carriers and values', spellcheck: 'false' })
  search.addEventListener('input', () => { filter = search.value.trim().toLowerCase(); renderLists() })
  search.addEventListener('keydown', e => { if (e.key === 'Escape') { search.value = ''; filter = ''; renderLists(); search.blur() } })

  const groups = {
    diagrams: makeGroup('Diagrams', 'Add diagram', () => app.addDiagram()),
    moments: makeGroup('Moments', 'Add moment', () => app.addMoment()),
    carriers: makeGroup('Carriers', 'Add carrier', () => app.addCarrier()),
    values: makeGroup('Values', 'Add values', () => app.addEmptyValues({ focus: true }))
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
    const name = (row, fallback) => row.title || row.id || fallback

    const diagrams = doc.diagrams.filter(d => matches(d.id, d.title, d.subtitle))
    fill('diagrams', diagrams, doc.diagrams.length, diagrams.map((d, i) => item('diagrams', d._uid, { after: eyeFor(d, app.diagramName(d)), muted: !isVisible(d) }, [
      h('span', { class: 'item-main', text: app.diagramName(d) }), d.subtitle ? h('span', { class: 'item-value', text: d.subtitle }) : null
    ])))

    const moments = doc.moments.filter(m => matches(m.id, m.title))
    const shownDiagrams = new Set(doc.diagrams.filter(isVisible).map(d => d.id))
    fill('moments', moments, doc.moments.length, moments.map(m => {
      const total = doc.values.reduce((s, v) => s + (shownDiagrams.has(v.diagram) && isFiniteNumber(v[m.id]) ? v[m.id] : 0), 0)
      return item('moments', m._uid, { after: eyeFor(m, name(m)), muted: !isVisible(m) }, [h('span', { class: 'item-main', text: name(m, '(no ID)') }), h('span', { class: 'item-value', text: amount(total), title: 'Total of the visible diagrams' })])
    }))

    const carriers = doc.carriers.filter(c => matches(c.id, c.title))
    fill('carriers', carriers, doc.carriers.length, carriers.map(c => {
      const swatch = h('input', { type: 'color', class: 'swatch small', value: carrierColor(doc, c), title: `Colour of ${name(c)}`, 'aria-label': `Colour of ${name(c)}` })
      swatch.addEventListener('input', () => app.edit('Change carrier colour', d => app.commands.updateCarrier(d, c._uid, { color: swatch.value }), { coalesce: `carrier:${c._uid}:color` }))
      return item('carriers', c._uid, { before: swatch }, [h('span', { class: 'item-main', text: name(c, '(no ID)') })])
    }))

    const diagramById = new Map(doc.diagrams.map(d => [d.id, d]))
    const carrierById = new Map(doc.carriers.map(c => [c.id, c]))
    const first = doc.moments[0]
    const last = doc.moments[doc.moments.length - 1]
    const values = doc.values.filter(v => matches(v.diagram, v.carrier, (diagramById.get(v.diagram) || {}).title, (carrierById.get(v.carrier) || {}).title))
    fill('values', values, doc.values.length, values.map(v => {
      const d = diagramById.get(v.diagram)
      const c = carrierById.get(v.carrier)
      const label = `${d ? app.diagramName(d) : v.diagram || '?'}, ${c ? name(c) : v.carrier || '?'}`
      const show = m => (m && isFiniteNumber(v[m.id]) ? amount(v[m.id]) : '?')
      return item('values', v._uid, { muted: !d || !isVisible(d), title: `${label}. Double-click to edit the values in the Data table.`, ondblclick: () => app.editValueCell(v._uid) }, [
        h('span', { class: 'dot', style: { background: c ? carrierColor(doc, c) : 'transparent', borderColor: c ? 'transparent' : '#c44' } }),
        h('span', { class: 'item-main', text: label }),
        h('span', { class: 'item-value', text: first && last && first !== last ? `${show(first)} → ${show(last)}` : show(first) })
      ])
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
