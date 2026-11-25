// The left-hand panel: searchable lists of scenarios, nodes (by group), groups, carriers and
// flows. Clicking an item selects it (Shift/Cmd adds) and brings it into view; clicking a
// scenario also shows it.

import { h, icon, clear } from '../../../shared/src/dom.js'
import { isVisible, carrierColor, getSetting, isFiniteNumber, shownScenario } from '../model/schema.js'
import { formatAmount } from '../render/chord.js'

const KEYS = ['scenarios', 'nodes', 'groups', 'carriers', 'flows', 'details']

export function createOutline (root, app) {
  let filter = ''
  const search = h('input', { type: 'search', class: 'input search', placeholder: 'Find nodes, carriers and flows', 'aria-label': 'Find nodes, carriers and flows', spellcheck: 'false' })
  search.addEventListener('input', () => { filter = search.value.trim().toLowerCase(); renderLists() })
  search.addEventListener('keydown', e => { if (e.key === 'Escape') { search.value = ''; filter = ''; renderLists(); search.blur() } })

  const groups = {
    scenarios: makeGroup('Scenarios', 'Add scenario', () => app.addScenario()),
    nodes: makeGroup('Nodes', 'Add node', () => app.addNode()),
    groups: makeGroup('Groups', 'Add group', () => app.addGroup()),
    carriers: makeGroup('Carriers', 'Add carrier', () => app.addCarrier()),
    flows: makeGroup('Flows', 'Add flow', () => app.addEmptyFlow({ focus: true }))
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
      if (key === 'scenarios') app.showScenario(uid)
      app.reveal([uid])
    }
  }

  function item (key, uid, { before = null, after = null, muted = false, title, ondblclick, extra = '' }, children) {
    const btn = h('button', { type: 'button', class: `outline-item${muted ? ' muted-item' : ''}${extra}`, role: 'option', dataset: { key, uid }, title, onclick: e => onItemClick(key, uid, e), ondblclick }, children)
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
    const name = (row, fallback = '(no ID)') => row.title || row.id || fallback
    const shown = shownScenario(doc)
    const value = f => (shown && isFiniteNumber(f[shown.id]) ? f[shown.id] : 0)

    const scenarios = doc.scenarios.filter(s => matches(s.id, s.title))
    fill('scenarios', scenarios, doc.scenarios.length, scenarios.map(s => item('scenarios', s._uid, { extra: s === shown ? ' is-shown' : '', title: s === shown ? 'Shown in the diagram' : 'Show in the diagram' }, [
      h('span', { class: 'shown-mark', 'aria-hidden': 'true' }),
      h('span', { class: 'item-main', text: name(s) }),
      h('span', { class: 'item-value', text: amount(doc.flows.reduce((t, f) => t + (isFiniteNumber(f[s.id]) ? f[s.id] : 0), 0)) })
    ])))

    const nodes = doc.nodes.filter(n => matches(n.id, n.title, n.group))
    const order = ['', ...doc.groups.map(g => g.id)]
    const ids = [...new Set(nodes.map(n => n.group || ''))].sort((a, b) => order.indexOf(a) - order.indexOf(b))
    fill('nodes', nodes, doc.nodes.length, ids.flatMap(id => [
      ...(id ? [h('li', { class: 'outline-subhead', role: 'presentation' }, name(doc.groups.find(g => g.id === id) || { id }))] : []),
      ...nodes.filter(n => (n.group || '') === id).map(n => {
        const m = app.model && app.model.nodeByUid.get(n._uid)
        return item('nodes', n._uid, { after: eyeFor(n, name(n)), muted: !isVisible(n) }, [h('span', { class: 'item-main', text: name(n) }), h('span', { class: 'item-value', text: m && !m.empty ? formatAmount(doc, m.amount, { unit: false }) : '' })])
      })
    ]))

    const list = doc.groups.filter(g => matches(g.id, g.title))
    fill('groups', list, doc.groups.length, list.map(g => item('groups', g._uid, {}, [h('span', { class: 'item-main', text: name(g) }), h('span', { class: 'item-value', text: String(doc.nodes.filter(n => n.group === g.id).length) })])))

    const carriers = doc.carriers.filter(c => matches(c.id, c.title))
    fill('carriers', carriers, doc.carriers.length, carriers.map(c => {
      const swatch = h('input', { type: 'color', class: 'swatch small', value: carrierColor(doc, c), title: `Colour of ${name(c)}`, 'aria-label': `Colour of ${name(c)}` })
      swatch.addEventListener('input', () => app.edit('Change carrier colour', d => app.commands.updateCarrier(d, c._uid, { color: swatch.value }), { coalesce: `carrier:${c._uid}:color` }))
      return item('carriers', c._uid, { before: swatch, after: eyeFor(c, name(c)), muted: !isVisible(c) }, [h('span', { class: 'item-main', text: name(c) })])
    }))

    const nodeById = new Map(doc.nodes.map(n => [n.id, n]))
    const carrierById = new Map(doc.carriers.map(c => [c.id, c]))
    const label = f => `${nodeById.get(f.source) ? name(nodeById.get(f.source)) : f.source || '?'} → ${nodeById.get(f.target) ? name(nodeById.get(f.target)) : f.target || '?'}`
    const flows = doc.flows.filter(f => matches(f.source, f.target, f.carrier, f.part, label(f), (carrierById.get(f.carrier) || {}).title))
    fill('flows', flows, doc.flows.length, flows.map(f => {
      const c = carrierById.get(f.carrier)
      return item('flows', f._uid, { muted: !(value(f) > 0), title: `${label(f)}${f.part ? `, ${f.part}` : ''}. Double-click to edit its amount in the Data table.`, ondblclick: () => app.editFlowCell(f._uid) }, [
        h('span', { class: 'dot', style: { background: c ? carrierColor(doc, c) : 'transparent', borderColor: c ? 'transparent' : '#c44' } }),
        h('span', { class: 'item-main', text: label(f) }),
        h('span', { class: 'item-value', text: amount(value(f)) })
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
