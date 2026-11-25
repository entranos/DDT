// The left-hand panel: searchable lists of blocks, values and carriers. Clicking an
// item selects it (Shift/Cmd adds) and brings it into view.

import { h, icon, clear } from '../../../shared/src/dom.js'
import { blockIsVisible, carrierColor, getSetting, isFiniteNumber } from '../model/schema.js'
import { formatAmount } from '../render/treemap.js'

export function createOutline (root, app) {
  let filter = ''
  const search = h('input', { type: 'search', class: 'input search', placeholder: 'Find blocks, values, carriers', 'aria-label': 'Find blocks, values and carriers', spellcheck: 'false' })
  search.addEventListener('input', () => { filter = search.value.trim().toLowerCase(); renderLists() })
  search.addEventListener('keydown', e => { if (e.key === 'Escape') { search.value = ''; filter = ''; renderLists(); search.blur() } })

  const groups = {
    blocks: makeGroup('Blocks', 'Add block', () => app.addBlock()),
    values: makeGroup('Values', 'Add value', () => app.addValueToSelection()),
    carriers: makeGroup('Carriers', 'Add carrier', () => app.addCarrier())
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
      const next = { blocks: [...sel.blocks], values: [...sel.values], carriers: [...sel.carriers] }
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
    const multiply = getSetting(doc, 'multiply') || 1
    const amount = v => formatAmount(doc, v * multiply, { unit: false })
    const totals = { block: new Map(), carrier: new Map() }
    doc.values.forEach(v => {
      if (!isFiniteNumber(v.value)) return
      totals.block.set(v.block, (totals.block.get(v.block) || 0) + v.value)
      totals.carrier.set(v.carrier, (totals.carrier.get(v.carrier) || 0) + v.value)
    })
    const blockById = new Map(doc.blocks.map(b => [b.id, b]))
    const carrierById = new Map(doc.carriers.map(c => [c.id, c]))

    const blocks = doc.blocks.filter(b => matches(b.id, b.title, b.group))
    const rows = []
    let group = null
    blocks.forEach(b => {
      if ((b.group || '') !== group) {
        group = b.group || ''
        if (group) rows.push(h('li', { class: 'outline-subhead', role: 'presentation' }, group))
      }
      const name = b.title || b.id || '(no ID)'
      const shown = blockIsVisible(b)
      const eye = h('button', { type: 'button', class: `icon-btn small eye${shown ? '' : ' off'}`, title: shown ? `Hide ${name}` : `Show ${name}`, 'aria-label': shown ? `Hide ${name}` : `Show ${name}`, 'aria-pressed': String(shown), onclick: () => app.toggleBlock(b._uid) }, icon(shown ? 'eye' : 'eyeOff', 14))
      rows.push(item('blocks', b._uid, { after: eye, muted: !shown, title: b.group ? `${name} (${b.group})` : name }, [
        h('span', { class: 'item-main', text: name }),
        h('span', { class: 'item-value', text: amount(totals.block.get(b.id) || 0) })
      ]))
    })
    clear(groups.blocks.list).append(...rows)
    groups.blocks.count.textContent = filter ? `${blocks.length}/${doc.blocks.length}` : String(doc.blocks.length)

    const values = doc.values.filter(v => matches(v.block, v.carrier, v.part, (blockById.get(v.block) || {}).title, (carrierById.get(v.carrier) || {}).title))
    clear(groups.values.list).append(...values.map(v => {
      const b = blockById.get(v.block)
      const c = carrierById.get(v.carrier)
      const name = `${(b && (b.title || b.id)) || v.block || '?'}, ${(c && (c.title || c.id)) || v.carrier || '?'}${v.part ? ` (${v.part})` : ''}`
      return item('values', v._uid, { muted: !b || !blockIsVisible(b), title: `${name}. Double-click to edit the value in the Data table.`, ondblclick: () => app.editTileValue(v._uid) }, [
        h('span', { class: 'dot', style: { background: c ? carrierColor(doc, c) : 'transparent', borderColor: c ? 'transparent' : '#c44' } }),
        h('span', { class: 'item-main', text: name }),
        h('span', { class: 'item-value', text: isFiniteNumber(v.value) ? amount(v.value) : '?' })
      ])
    }))
    groups.values.count.textContent = filter ? `${values.length}/${doc.values.length}` : String(doc.values.length)

    const carriers = doc.carriers.filter(c => matches(c.id, c.title))
    clear(groups.carriers.list).append(...carriers.map(c => {
      const name = c.title || c.id || '(no ID)'
      const swatch = h('input', { type: 'color', class: 'swatch small', value: carrierColor(doc, c), title: `Colour of ${name}`, 'aria-label': `Colour of ${name}` })
      swatch.addEventListener('input', () => app.edit('Change carrier colour', d => app.commands.updateCarrier(d, c._uid, { color: swatch.value }), { coalesce: `carrier:${c._uid}:color` }))
      return item('carriers', c._uid, { before: swatch }, [
        h('span', { class: 'item-main', text: name }),
        h('span', { class: 'item-value', text: amount(totals.carrier.get(c.id) || 0) })
      ])
    }))
    groups.carriers.count.textContent = filter ? `${carriers.length}/${doc.carriers.length}` : String(doc.carriers.length)
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
