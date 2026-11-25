// The left-hand panel: searchable lists of nodes, flows and carriers.
// Clicking an item selects it (Shift/Cmd adds) and brings it into view.

import { h, icon, clear } from '../../../shared/src/dom.js'
import { isFiniteNumber, getSetting } from '../model/schema.js'
import { formatNumber } from '../../../shared/src/format.js'

export function createOutline (root, app) {
  let filter = ''
  const search = h('input', { type: 'search', class: 'input search', placeholder: 'Find nodes, flows, carriers', 'aria-label': 'Find nodes, flows and carriers', spellcheck: 'false' })
  search.addEventListener('input', () => { filter = search.value.trim().toLowerCase(); renderLists() })
  search.addEventListener('keydown', e => { if (e.key === 'Escape') { search.value = ''; filter = ''; renderLists(); search.blur() } })

  const groups = {
    nodes: makeGroup('Nodes', 'Add node', () => app.addNodeAt(null)),
    links: makeGroup('Flows', 'Add flow', () => app.addFlowFromSelection()),
    carriers: makeGroup('Carriers', 'Add carrier', () => app.addCarrier())
  }
  root.append(h('div', { class: 'outline-search' }, icon('search', 14), search), h('div', { class: 'outline-groups' }, groups.nodes.el, groups.links.el, groups.carriers.el))

  function makeGroup (title, addLabel, onAdd) {
    const count = h('span', { class: 'count' })
    const list = h('ul', { class: 'outline-list', role: 'listbox', 'aria-multiselectable': 'true', 'aria-label': title })
    const el = h('details', { class: 'outline-group', open: true },
      h('summary', {}, icon('chevron', 14), h('span', { class: 'outline-title', text: title }), count,
        h('button', { class: 'icon-btn small', type: 'button', title: addLabel, 'aria-label': addLabel, onclick: e => { e.preventDefault(); onAdd() } }, icon('plus', 14))),
      list)
    return { el, list, count }
  }

  function onItemClick (kind, uid, e) {
    const sel = app.selection
    const key = kind === 'node' ? 'nodes' : kind === 'link' ? 'links' : 'carriers'
    if (e.shiftKey || e.metaKey || e.ctrlKey) {
      const next = { nodes: [...sel.nodes], links: [...sel.links], carriers: [...sel.carriers] }
      const set = new Set(next[key])
      set.has(uid) ? set.delete(uid) : set.add(uid)
      next[key] = [...set]
      app.setSelection(next)
    } else {
      app.setSelection({ [key]: [uid] })
      if (kind !== 'carrier') app.reveal([uid])
    }
  }

  function item (kind, uid, children, extra = null) {
    const btn = h('button', {
      type: 'button',
      class: 'outline-item',
      role: 'option',
      dataset: { kind, uid },
      title: kind === 'link' ? 'Double-click to edit the value in the Data table' : undefined,
      onclick: e => onItemClick(kind, uid, e),
      ondblclick: kind === 'link' ? () => app.editFlowValue(uid) : undefined
    }, children)
    return h('li', {}, btn, extra)
  }

  function matches (...values) {
    if (!filter) return true
    return values.some(v => v !== undefined && v !== null && String(v).toLowerCase().includes(filter))
  }

  function renderLists () {
    const doc = app.getDoc()
    if (!doc) { Object.values(groups).forEach(g => { clear(g.list); g.count.textContent = '' }); return }
    const names = new Map(doc.nodes.map(n => [n.id, n.title || n.id]))
    const colors = new Map(doc.carriers.map(c => [c.id, c.color]))
    const dec = getSetting(doc, 'decimalsRoundValues')

    const nodes = doc.nodes.filter(n => matches(n.id, n.title))
    clear(groups.nodes.list).append(...nodes.map(n => item('node', n._uid, [
      h('span', { class: 'item-main', text: n.title || n.id || '(no ID)' }),
      n.title && n.title !== n.id ? h('span', { class: 'item-sub', text: n.id }) : null
    ])))
    groups.nodes.count.textContent = filter ? `${nodes.length}/${doc.nodes.length}` : String(doc.nodes.length)

    const links = doc.links.filter(l => matches(l.source, l.target, names.get(l.source), names.get(l.target), l.carrier))
    clear(groups.links.list).append(...links.map(l => item('link', l._uid, [
      h('span', { class: 'dot', style: { background: colors.get(l.carrier) || '#000' } }),
      h('span', { class: 'item-main', text: `${names.get(l.source) || l.source || '?'} → ${names.get(l.target) || l.target || '?'}` }),
      h('span', { class: 'item-value', text: isFiniteNumber(l.value) ? formatNumber(l.value, dec) : '?' })
    ])))
    groups.links.count.textContent = filter ? `${links.length}/${doc.links.length}` : String(doc.links.length)

    const uses = new Map()
    doc.links.forEach(l => uses.set(l.carrier, (uses.get(l.carrier) || 0) + 1))
    const carriers = doc.carriers.filter(c => matches(c.id, c.name))
    clear(groups.carriers.list).append(...carriers.map(c => {
      const swatch = h('input', { type: 'color', class: 'swatch small', value: /^#[0-9a-f]{6}$/i.test(c.color) ? c.color : '#000000', title: `Colour of ${c.id}`, 'aria-label': `Colour of ${c.id}` })
      swatch.addEventListener('input', () => app.edit('Change carrier colour', d => app.commands.updateCarrier(d, c._uid, { color: swatch.value }), { coalesce: `carrier:${c._uid}:color` }))
      return item('carrier', c._uid, [
        h('span', { class: 'item-main', text: c.id || '(no ID)' }),
        h('span', { class: 'item-value', text: String(uses.get(c.id) || 0), title: 'Flows using this carrier' })
      ], swatch)
    }))
    groups.carriers.count.textContent = filter ? `${carriers.length}/${doc.carriers.length}` : String(doc.carriers.length)
    renderSelection()
  }

  function renderSelection () {
    const sel = app.selection
    root.querySelectorAll('.outline-item').forEach(el => {
      const set = el.dataset.kind === 'node' ? sel.nodes : el.dataset.kind === 'link' ? sel.links : sel.carriers
      const on = set.has(el.dataset.uid)
      el.classList.toggle('selected', on)
      el.setAttribute('aria-selected', String(on))
    })
    const first = root.querySelector('.outline-item.selected')
    if (first && !root.contains(document.activeElement)) first.scrollIntoView({ block: 'nearest' })
  }

  return { render: renderLists, renderSelection, focusSearch: () => search.focus() }
}
