// A form field for choosing an icon: a button showing the current one, opening a picker
// with the energy icons, the library icons already used in the diagram, and a search
// through the full library. A blank value is the automatic choice.

import { h, icon, clear } from './dom.js'
import { ICONS, ICON_NAMES, iconLabel, libraryIconsIn } from './icons.js'
import { PREFIX, loadIcons, iconsLoaded, findIcons, iconCategories, libraryPath } from './iconLibrary.js'

const SVG_NS = 'http://www.w3.org/2000/svg'
const PAGE = 120 // icons shown at once

export function lineIcon (path, size = 18) {
  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('width', size)
  svg.setAttribute('height', size)
  svg.setAttribute('class', 'line-icon')
  svg.setAttribute('aria-hidden', 'true')
  const p = document.createElementNS(SVG_NS, 'path')
  p.setAttribute('d', path || '')
  svg.append(p)
  return svg
}

const matches = name => query => !query || iconLabel(name).toLowerCase().includes(query)

//   value()      what the row's icon column holds; null when several rows differ
//   shown()      the icon that gives, { name, path } or null
//   rows()       all rows that can have an icon, for "in this diagram"
//   auto         { label, title, text } of the automatic choice
//   onCommit(value)
export function iconField ({ label, value, shown, rows, auto = {}, help, onCommit }) {
  const automatic = { label: 'Automatic', title: 'An icon by the ID, if there is one', text: 'automatic', ...auto }
  let query = ''
  let category = ''
  let page = PAGE
  let error = null

  const current = h('span', { class: 'icon-current' })
  const search = h('input', { type: 'search', class: 'input search', placeholder: 'Search all icons', 'aria-label': 'Search all icons', spellcheck: 'false' })
  const categories = h('select', { class: 'input', 'aria-label': 'Category' }, h('option', { value: '', text: 'All categories' }))
  const results = h('div', { class: 'icon-results' })
  const details = h('details', { class: 'icon-field' },
    h('summary', { class: 'input icon-summary' }, current),
    h('div', { class: 'icon-picker' },
      h('div', { class: 'icon-search' }, icon('search', 14), search),
      categories,
      h('div', { class: 'icon-words' },
        h('button', { type: 'button', class: 'btn btn-small', dataset: { value: '' }, text: automatic.label, title: automatic.title, onclick: () => choose('') }),
        h('button', { type: 'button', class: 'btn btn-small', dataset: { value: 'none' }, text: 'None', onclick: () => choose('none') })),
      results))

  const choose = value => { onCommit(value); details.open = false }
  const button = (value, path) => h('button', { type: 'button', class: 'icon-choice', dataset: { value }, title: iconLabel(value), 'aria-label': iconLabel(value), onclick: () => choose(value) }, lineIcon(path))
  const block = (title, buttons) => (buttons.length ? [h('div', { class: 'icon-head', text: title }), h('div', { class: 'icon-grid' }, buttons)] : [])

  function renderResults () {
    if (!details.open) return
    const q = query.trim().toLowerCase()
    const all = iconsLoaded() ? findIcons({ query: q, category }) : []
    const browsing = q || category
    clear(results).append(
      ...(category ? [] : block('Energy icons', ICON_NAMES.filter(n => matches(n)(q)).map(n => button(n, ICONS[n])))),
      ...(browsing ? [] : block('From the library, in this diagram', libraryIconsIn(rows()).map(v => button(v, libraryPath(v))))),
      ...(iconsLoaded()
        ? block(browsing ? `Library: ${all.length} ${all.length === 1 ? 'icon' : 'icons'}` : `Library: all ${all.length.toLocaleString('de-DE')} icons`, all.slice(0, page).map(i => button(PREFIX + i.name, i.path)))
        : [h('p', { class: 'muted small', text: error || 'Loading the icon library…' })]))
    if (all.length > page) {
      results.append(h('button', { type: 'button', class: 'btn btn-ghost btn-small', text: `Show more (${(all.length - page).toLocaleString('de-DE')})`, onclick: () => { page += PAGE * 2; renderResults() } }))
    }
    if (iconsLoaded() && !all.length && !results.querySelector('.icon-choice')) results.append(h('p', { class: 'muted small', text: 'No icons found. Try another word, in English or Dutch.' }))
    markCurrent()
  }

  function markCurrent () {
    const v = value() === null ? null : String(value() ?? '').trim()
    details.querySelectorAll('[data-value]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.value === v)))
  }

  details.addEventListener('toggle', () => {
    if (!details.open) return
    renderResults()
    search.focus()
    if (iconsLoaded()) { fillCategories(); return }
    loadIcons().then(() => { error = null; fillCategories(); renderResults() }, e => { error = e.message; renderResults() })
  })
  function fillCategories () {
    if (categories.options.length < 2) categories.append(...iconCategories().map(c => h('option', { value: c, text: c })))
  }
  search.addEventListener('input', () => { query = search.value; page = PAGE; renderResults() })
  search.addEventListener('keydown', e => {
    if (e.key === 'Enter') { const first = results.querySelector('.icon-choice'); if (first) first.click() }
    if (e.key === 'Escape') { if (search.value) { search.value = ''; query = ''; renderResults() } else details.open = false; e.stopPropagation() }
  })
  categories.addEventListener('change', () => { category = categories.value; page = PAGE; renderResults() })

  function update () {
    const raw = value()
    const v = String(raw ?? '').trim()
    const now = shown()
    const name = now && (now.name ? iconLabel(now.name) : 'Own drawing')
    let text
    if (raw === null) text = 'Several'
    else if (v.toLowerCase() === 'none') text = 'None'
    else if (!v) text = now ? `${name} (${automatic.text})` : `None (${automatic.text})`
    else if (now) text = name
    else text = iconsLoaded() ? `${v} (unknown)` : 'Loading…'
    clear(current).append(now ? lineIcon(now.path) : '', h('span', { text }))
    markCurrent()
  }
  update()
  return {
    el: h('div', { class: 'field field-wide' }, h('span', { class: 'field-label', text: label }), details, help ? h('p', { class: 'field-help', text: help }) : null),
    open () { details.open = true; details.scrollIntoView({ block: 'nearest' }) },
    update
  }
}
