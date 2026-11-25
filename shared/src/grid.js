// The data grid in the bottom drawer: the document's tables as rows.
// Sort by clicking a header, filter, edit cells in place, paste from Excel.
// Rows and canvas share one selection.
//
// Each app describes its tables:
//   kinds: { <doc key>: {
//     label: 'Flows', noun: 'flow',            tab label; undo labels ("Edit flow")
//     selection: 'links',                       key in app.selection
//     columns: doc => [{ key, label, numeric, readOnly, list, format, muted }],
//     decorate?: (doc, rows) => rows,           adds computed (read-only) fields
//     datalists?: doc => [{ id, options: [{ value, label }] }],
//     swatch?: (doc, colKey, row) => colour     a dot before the cell text
//     pasteDefaults?: row => row,               fills in new pasted rows
//     newColumns?: true                         pasted columns it doesn't have are kept in the rows,
//                                               for commands.applyRowEdits to add
//     add: () => uid,                           adds a row; the grid then edits it
//     fixed?: true                              no adding or deleting rows
//     reveal?: true                             bring selected rows into view on the canvas
//     columnActions?: {                         adding, renaming and deleting columns
//       add?(nearKey, after) => key             adds a column, at the end or beside one
//       canInsert?(key), canRename?(key), canDelete(key)
//       rename?(key, name) => key               the column's key afterwards; null when refused
//       remove(key)
//       menu?(key) => items                     more items for the column's menu
//     }
//   } }

import { h, icon, clear, shortcutIn } from './dom.js'
import { toNumber, isFiniteNumber } from './values.js'
import { plainNumber } from './format.js'
import { parseTable, planPaste } from './paste.js'
import { openMenu } from './menu.js'

// Column list for a table: the standard columns first, then any others the
// file or rows have (internal `_` keys excluded).
// The dot of a colour that may be left out: none when it is, and the mark for a missing
// colour only when there is something that isn't a hex code.
export const optionalDot = value => {
  const v = String(value ?? '').trim()
  if (!v) return undefined
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v) ? v : null
}

export function columnsFromRows ({ std, meta = [], rows, labels = {}, numeric = new Set(), lists = {} }) {
  const keys = [...std]
  ;[...meta, ...rows.flatMap(r => Object.keys(r))].forEach(k => { if (!k.startsWith('_') && !keys.includes(k)) keys.push(k) })
  return keys.map(key => ({ key, label: labels[key] || key, numeric: numeric.has(key), list: lists[key] }))
}

export function createGrid (root, app, { kinds: KINDS }) {
  let kind = Object.keys(KINDS)[0]
  let filter = ''
  let sort = { col: null, dir: 1 }
  let focus = null // { uid, col }
  let editing = null
  let naming = false // a column heading is being renamed
  let activeCol = null // the column last clicked, for Delete column
  let anchor = null // the row last clicked, where a Shift-click starts from
  let pending = false
  let visibleRows = []
  let columns = []

  const tabs = Object.entries(KINDS).map(([k, v]) => h('button', { type: 'button', class: 'seg', dataset: { kind: k }, onclick: () => { kind = k; sort = { col: null, dir: 1 }; focus = null; activeCol = null; anchor = null; render() } }, v.label, h('span', { class: 'count' })))
  const filterInput = h('input', { type: 'search', class: 'input search small', placeholder: 'Filter rows', 'aria-label': 'Filter rows', spellcheck: 'false' })
  filterInput.addEventListener('input', () => { filter = filterInput.value.trim().toLowerCase(); render() })
  const addBtn = h('button', { type: 'button', class: 'btn btn-ghost btn-small', onclick: () => addRow() }, icon('plus', 14), 'Add row')
  const delBtn = h('button', { type: 'button', class: 'btn btn-ghost btn-small', onclick: () => deleteRows() }, icon('trash', 14), 'Delete selected')
  const addColBtn = h('button', { type: 'button', class: 'btn btn-ghost btn-small', onclick: () => addColumn() }, icon('columnAdd', 14), 'Add column')
  const delColLabel = h('span', { text: 'Delete column' })
  const delColBtn = h('button', { type: 'button', class: 'btn btn-ghost btn-small', onclick: () => deleteColumn(activeCol) }, icon('trash', 14), delColLabel)
  const table = h('table', { class: 'grid' })
  const scroller = h('div', { class: 'grid-scroll' }, table)
  const datalists = h('div', { hidden: true })
  root.append(
    h('div', { class: 'grid-toolbar' },
      h('div', { class: 'segmented small', role: 'tablist' }, tabs),
      filterInput, addBtn, delBtn, addColBtn, delColBtn,
      h('span', { class: 'grid-hint', text: 'Double-click or type to edit · Shift-click selects the rows in between · Paste rows from Excel into a cell' })),
    scroller, datalists)

  const sel = () => KINDS[kind].selection
  const actions = () => KINDS[kind].columnActions || null
  const columnsFor = doc => KINDS[kind].columns(doc)

  function rowsFor (doc) {
    let rows = doc[kind]
    if (KINDS[kind].decorate) rows = KINDS[kind].decorate(doc, rows)
    if (filter) rows = rows.filter(r => columns.some(c => String(r[c.key] ?? '').toLowerCase().includes(filter)))
    if (sort.col) {
      const k = sort.col
      rows = [...rows].sort((a, b) => {
        const x = a[k]; const y = b[k]
        if (isFiniteNumber(x) && isFiniteNumber(y)) return (x - y) * sort.dir
        return String(x ?? '').localeCompare(String(y ?? ''), undefined, { numeric: true }) * sort.dir
      })
    }
    return rows
  }

  const display = (col, v) => (v === undefined || v === null ? '' : col.format ? col.format(v) : col.numeric && typeof v === 'number' ? plainNumber(v) : String(v))

  function render () {
    const doc = app.getDoc()
    if (editing || naming) { pending = true; return }
    pending = false
    tabs.forEach(t => {
      t.setAttribute('aria-pressed', String(t.dataset.kind === kind))
      t.querySelector('.count').textContent = doc ? String(doc[t.dataset.kind].length) : ''
    })
    // Redrawing removes the focused cell or heading, so remember where the focus was.
    const active = table.contains(document.activeElement) ? document.activeElement : null
    const hadFocus = !!active && !!active.closest('tbody')
    const headFocus = active && !hadFocus && active.closest('thead th[data-col]') ? active.closest('th').dataset.col : null
    clear(table)
    if (!doc) return
    columns = columnsFor(doc)
    if (sort.col && !columns.some(c => c.key === sort.col)) sort = { col: null, dir: 1 }
    if (focus && !columns.some(c => c.key === focus.col)) focus = null
    if (!columns.some(c => c.key === activeCol)) activeCol = null
    visibleRows = rowsFor(doc)
    const spec = KINDS[kind]
    const selSet = app.selection[sel()]
    addBtn.hidden = delBtn.hidden = !!spec.fixed
    const rowNumber = new Map(doc[kind].map((r, i) => [r._uid, i + 2]))
    delBtn.disabled = ![...selSet].some(u => doc[kind].some(r => r._uid === u))

    clear(datalists).append(...(spec.datalists ? spec.datalists(doc) : []).map(dl =>
      h('datalist', { id: dl.id }, dl.options.map(o => h('option', { value: o.value, label: o.label || '' })))))

    const head = h('tr', {}, h('th', { class: 'rowhead', scope: 'col' }, h('span', { class: 'sr-only', text: 'Row' })), columns.map(c => h('th', {
      scope: 'col',
      dataset: { col: c.key },
      class: `${c.numeric ? 'num' : ''}${sort.col === c.key ? ' sorted' : ''}${c.muted ? ' muted-col' : ''}`,
      'aria-sort': sort.col === c.key ? (sort.dir > 0 ? 'ascending' : 'descending') : 'none'
    }, h('button', {
      type: 'button',
      class: 'th-btn',
      onclick: () => {
        activeCol = c.key
        if (sort.col !== c.key) sort = { col: c.key, dir: 1 }
        else if (sort.dir === 1) sort.dir = -1
        else sort = { col: null, dir: 1 }
        render()
      }
    }, c.label, sort.col === c.key ? (sort.dir > 0 ? ' ▲' : ' ▼') : ''), columnMenuButton(c))))
    const body = h('tbody', {}, visibleRows.map((r, i) => h('tr', { dataset: { uid: r._uid }, class: selSet.has(r._uid) ? 'selected' : '' },
      h('th', { class: 'rowhead', scope: 'row' }, h('button', { type: 'button', class: 'row-btn', text: String(rowNumber.get(r._uid)), title: 'Select row (spreadsheet row number)', onclick: e => selectRow(r._uid, e) })),
      columns.map(c => {
        const v = r[c.key]
        const td = h('td', { tabindex: '-1', dataset: { col: c.key }, class: `${c.numeric ? 'num' : ''}${c.readOnly ? ' ro' : ''}` })
        const color = spec.swatch ? spec.swatch(doc, c.key, r) : undefined
        if (color !== undefined) td.append(h('span', { class: 'dot', style: { background: color || 'transparent', borderColor: color ? 'transparent' : '#c44' } }))
        td.append(document.createTextNode(display(c, v)))
        return td
      })
    )))
    table.append(h('thead', {}, head), body)
    renderColumnButtons()
    if (focus) {
      const cell = cellFor(focus.uid, focus.col)
      if (cell && hadFocus) cell.focus({ preventScroll: true })
    }
    const heading = headFocus && table.querySelector(`thead th[data-col="${CSS.escape(headFocus)}"] .th-btn`)
    if (heading) heading.focus({ preventScroll: true })
  }

  // ---- columns ----

  function columnMenu (c) {
    const a = actions()
    if (!a) return []
    const can = name => !!a[name] && a[name](c.key)
    return [
      a.rename && can('canRename') ? { label: 'Rename', icon: 'pencil', onClick: () => startNaming(c.key) } : null,
      a.add && can('canInsert') ? { label: 'Insert column before', icon: 'plus', onClick: () => addColumn(c.key, false) } : null,
      a.add && can('canInsert') ? { label: 'Insert column after', icon: 'plus', onClick: () => addColumn(c.key, true) } : null,
      ...(a.menu ? a.menu(c.key) : []),
      can('canDelete') ? { label: `Delete column ${c.label}`, icon: 'trash', danger: true, onClick: () => deleteColumn(c.key) } : null
    ].filter(Boolean)
  }

  function columnMenuButton (c) {
    const items = columnMenu(c)
    if (!items.length) return null
    const open = anchor => { activeCol = c.key; renderColumnButtons(); openMenu(anchor, items) }
    const btn = h('button', { type: 'button', class: 'th-menu', title: `Column ${c.label}: rename, insert, delete`, 'aria-label': `Column ${c.label}`, 'aria-haspopup': 'menu', onclick: () => open(btn) }, icon('more', 14))
    return btn
  }

  function renderColumnButtons () {
    const a = actions()
    const deletable = a ? columns.filter(c => a.canDelete(c.key)) : []
    const col = deletable.find(c => c.key === activeCol)
    addColBtn.hidden = !(a && a.add)
    delColBtn.hidden = !deletable.length
    delColBtn.disabled = !col
    delColLabel.textContent = col ? `Delete column ${col.label}` : 'Delete column'
    delColBtn.title = col ? '' : 'Click a cell or heading of the column first'
    table.querySelectorAll('thead th[data-col]').forEach(th => th.classList.toggle('active-col', !!col && th.dataset.col === col.key))
  }

  // Adds a column through the app, then opens its heading for a name.
  function addColumn (near = null, after = true) {
    if (editing) editing.input.blur()
    const key = actions().add(near, after)
    if (!key) return
    activeCol = key
    render()
    startNaming(key)
  }

  function deleteColumn (key) {
    const a = actions()
    if (!key || !a || !a.canDelete(key)) return
    if (editing) editing.input.blur()
    a.remove(key)
    render()
  }

  function startNaming (key) {
    const th = table.querySelector(`thead th[data-col="${CSS.escape(key)}"]`)
    const col = columns.find(c => c.key === key)
    if (!th || !col) return
    const input = h('input', { class: 'cell-input th-input', value: col.label, 'aria-label': 'Column name', spellcheck: 'false', autocomplete: 'off' })
    naming = true
    th.style.width = `${Math.max(72, th.offsetWidth)}px`
    clear(th).append(input)
    th.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    input.focus()
    input.select()
    let done = false
    const finish = (save, enter) => {
      if (done) return
      done = true
      naming = false
      const name = input.value.trim()
      let now = key
      if (save && name && name !== col.label) now = actions().rename(key, name) || key
      activeCol = now
      render()
      // On to the column's first cell, ready to type.
      const first = enter && visibleRows[0] && cellFor(visibleRows[0]._uid, now)
      if (first) { focus = { uid: visibleRows[0]._uid, col: now }; first.focus() }
    }
    input.addEventListener('keydown', e => {
      const shortcut = shortcutIn(e, input.value === col.label)
      if (shortcut) { finish(shortcut === 'commit'); return }
      e.stopPropagation()
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); finish(true, true) }
      if (e.key === 'Escape') { e.preventDefault(); finish(false) }
    })
    input.addEventListener('blur', () => finish(true))
  }

  table.addEventListener('contextmenu', e => {
    const th = e.target.closest('thead th[data-col]')
    const col = th && columns.find(c => c.key === th.dataset.col)
    const items = col ? columnMenu(col) : []
    if (!items.length) return
    e.preventDefault()
    activeCol = col.key
    renderColumnButtons()
    openMenu({ x: e.clientX, y: e.clientY }, items)
  })

  function cellFor (uid, col) {
    return table.querySelector(`tr[data-uid="${CSS.escape(uid)}"] td[data-col="${CSS.escape(col)}"]`)
  }

  // A click selects a row, Cmd/Ctrl adds or removes one, Shift selects everything from the row
  // clicked before up to this one, as the rows are shown.
  function selectRow (uid, e) {
    const key = sel()
    const mod = !!e && (e.metaKey || e.ctrlKey)
    if (e && e.shiftKey) {
      const uids = visibleRows.map(r => r._uid)
      const from = [anchor, focus && focus.uid, uids.find(u => app.selection[key].has(u)), uid].find(u => uids.includes(u))
      const [a, b] = [uids.indexOf(from), uids.indexOf(uid)].sort((x, y) => x - y)
      const range = uids.slice(a, b + 1)
      anchor = from
      app.setSelection({ [key]: mod ? [...new Set([...app.selection[key], ...range])] : range })
    } else if (mod) {
      const set = new Set(app.selection[key])
      set.has(uid) ? set.delete(uid) : set.add(uid)
      anchor = uid
      app.setSelection({ [key]: [...set] })
    } else {
      anchor = uid
      app.setSelection({ [key]: [uid] })
      if (KINDS[kind].reveal) app.reveal([uid])
    }
  }

  // ---- editing ----

  function coerce (col, value) {
    if (col.numeric) {
      const n = toNumber(value)
      return value === '' ? '' : n
    }
    return value
  }

  function startEdit (td, initial) {
    const uid = td.parentElement.dataset.uid
    const col = columns.find(c => c.key === td.dataset.col)
    if (!col || col.readOnly) return
    const row = app.getDoc()[kind].find(r => r._uid === uid)
    if (!row) return
    const start = initial !== undefined ? initial : display(col, row[col.key])
    const input = h('input', { class: 'cell-input', value: start, list: col.list, spellcheck: 'false', autocomplete: 'off' })
    editing = { uid, col: col.key, input }
    td.classList.add('editing')
    clear(td).append(input)
    input.focus()
    if (initial === undefined) input.select()
    let done = false
    const finish = (save, move) => {
      if (done) return
      done = true
      const value = input.value
      editing = null
      if (save && value !== display(col, row[col.key])) {
        const patch = { [col.key]: coerce(col, value) }
        app.edit(`Edit ${KINDS[kind].noun}`, d => app.commands.applyRowEdits(d, kind, [{ uid, patch }]))
      } else render()
      if (pending) render()
      if (move) moveFocus(move.dr, move.dc)
      else { const c = cellFor(uid, col.key); if (c) c.focus() }
    }
    input.addEventListener('keydown', e => {
      const shortcut = shortcutIn(e, input.value === start)
      // Undo takes back the first letter typed over a cell; otherwise it goes on to the document.
      if (shortcut === 'leave' && initial !== undefined) { if (!e.shiftKey) { e.preventDefault(); finish(false) } } else if (shortcut) { finish(shortcut === 'commit'); return }
      if (e.key === 'Enter') { e.preventDefault(); finish(true, { dr: e.shiftKey ? -1 : 1, dc: 0 }) }
      else if (e.key === 'Tab') { e.preventDefault(); finish(true, { dr: 0, dc: e.shiftKey ? -1 : 1 }) }
      else if (e.key === 'Escape') { e.preventDefault(); finish(false) }
      e.stopPropagation()
    })
    input.addEventListener('blur', () => finish(true))
  }

  function moveFocus (dr, dc) {
    if (!focus) return
    const ri = visibleRows.findIndex(r => r._uid === focus.uid)
    const ci = columns.findIndex(c => c.key === focus.col)
    const r = visibleRows[Math.max(0, Math.min(visibleRows.length - 1, ri + dr))]
    const c = columns[Math.max(0, Math.min(columns.length - 1, ci + dc))]
    if (!r || !c) return
    focus = { uid: r._uid, col: c.key }
    const cell = cellFor(r._uid, c.key)
    if (cell) { cell.focus(); cell.scrollIntoView({ block: 'nearest', inline: 'nearest' }) }
  }

  table.addEventListener('focusin', e => {
    const td = e.target.closest('td')
    if (!td || editing) return
    focus = { uid: td.parentElement.dataset.uid, col: td.dataset.col }
    if (activeCol !== focus.col) { activeCol = focus.col; renderColumnButtons() }
  })
  table.addEventListener('mousedown', e => {
    const td = e.target.closest('td')
    if (!td || editing) return
    const uid = td.parentElement.dataset.uid
    if (e.button === 0 && (e.shiftKey || e.metaKey || e.ctrlKey)) selectRow(uid, e)
    else if (!app.selection[sel()].has(uid)) selectRow(uid)
    else anchor = uid
  })
  table.addEventListener('dblclick', e => { const td = e.target.closest('td'); if (td) startEdit(td) })
  table.addEventListener('keydown', e => {
    const td = e.target.closest('td')
    if (!td || editing) return
    const moves = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1], Tab: [0, e.shiftKey ? -1 : 1] }
    if (moves[e.key]) { e.preventDefault(); moveFocus(...moves[e.key]); return }
    if (e.key === 'Enter' || e.key === 'F2') { e.preventDefault(); startEdit(td); return }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'a') {
      // Select every visible row; Cmd/Ctrl+C then copies them with a header line, ready to paste into the template.
      e.preventDefault()
      app.setSelection({ [sel()]: visibleRows.map(r => r._uid) })
      focus = null
      return
    }
    if ((e.key === 'Backspace' || e.key === 'Delete') && (e.metaKey || e.ctrlKey)) { e.preventDefault(); deleteRows(); return }
    if (e.key === 'Backspace' || e.key === 'Delete') {
      e.preventDefault()
      const col = columns.find(c => c.key === td.dataset.col)
      if (col && !col.readOnly) app.edit('Clear cell', d => app.commands.applyRowEdits(d, kind, [{ uid: td.parentElement.dataset.uid, patch: { [col.key]: '' } }]))
      return
    }
    if (e.metaKey || e.ctrlKey) return // shortcuts of the editor, such as undo and save
    if (e.key.length === 1 && !e.altKey) { e.preventDefault(); startEdit(td, e.key) }
    e.stopPropagation()
  })

  // On the document: without selected text, browsers send these to the page rather than to
  // the cell that has the focus.
  const active = () => !editing && !naming && table.contains(document.activeElement)
  document.addEventListener('copy', e => {
    if (!active()) return
    const doc = app.getDoc()
    const selected = visibleRows.filter(r => app.selection[sel()].has(r._uid))
    const editable = columns.filter(c => !c.readOnly)
    let text
    if (selected.length > 1 || (selected.length === 1 && !focus)) {
      text = [editable.map(c => c.key).join('\t'), ...selected.map(r => editable.map(c => display(c, r[c.key]).replace(/[\t\n]/g, ' ')).join('\t'))].join('\n')
    } else if (focus) {
      const r = doc[kind].find(x => x._uid === focus.uid)
      const c = columns.find(x => x.key === focus.col)
      text = r && c ? display(c, r[c.key]) : ''
    } else return
    e.preventDefault()
    e.clipboardData.setData('text/plain', text)
  })

  document.addEventListener('paste', e => {
    if (!active()) return
    const text = e.clipboardData.getData('text/plain')
    const rows = parseTable(text)
    if (!rows.length) return
    e.preventDefault()
    const startRow = focus ? Math.max(0, visibleRows.findIndex(r => r._uid === focus.uid)) : visibleRows.length
    const startCol = focus ? Math.max(0, columns.findIndex(c => c.key === focus.col)) : 0
    const plan = planPaste({ rows, columns, startRow, startCol, rowCount: visibleRows.length, newColumns: !!KINDS[kind].newColumns })
    const coerceAll = patch => Object.fromEntries(Object.entries(patch).map(([k, v]) => [k, coerce(columns.find(c => c.key === k) || {}, v)]))
    const edits = plan.edits.map(x => ({ uid: visibleRows[x.index]._uid, patch: coerceAll(x.patch) }))
    const newRows = (KINDS[kind].fixed ? [] : plan.newRows).map(p => {
      const row = coerceAll(p)
      return KINDS[kind].pasteDefaults ? KINDS[kind].pasteDefaults(row) : row
    })
    app.edit('Paste rows', d => app.commands.applyRowEdits(d, kind, edits, newRows))
    app.notify(`Pasted ${rows.length - (plan.header ? 1 : 0)} row(s): ${edits.length} updated, ${newRows.length} added.`)
  })

  // Adds a row through the app, then opens its first editable cell.
  function addRow () {
    const uid = KINDS[kind].add()
    if (!uid || !app.getDoc()[kind].some(r => r._uid === uid)) return
    sort = { col: null, dir: 1 }
    filter = ''
    filterInput.value = ''
    app.setSelection({ [sel()]: [uid] })
    render()
    const col = columns.find(c => !c.readOnly)
    const td = col && cellFor(uid, col.key)
    if (td) { td.scrollIntoView({ block: 'nearest' }); focus = { uid, col: col.key }; startEdit(td) }
  }

  function deleteRows () {
    if (KINDS[kind].fixed) return
    const key = sel()
    const uids = [...app.selection[key]]
    if (uids.length) app.deleteItems({ [key]: uids })
  }

  function renderSelection () {
    if (editing) return
    const selSet = app.selection[sel()]
    let first = null
    table.querySelectorAll('tbody tr').forEach(tr => {
      const on = selSet.has(tr.dataset.uid)
      tr.classList.toggle('selected', on)
      if (on && !first) first = tr
    })
    const doc = app.getDoc()
    delBtn.disabled = !doc || ![...selSet].some(u => doc[kind].some(r => r._uid === u))
    if (first && !root.contains(document.activeElement)) first.scrollIntoView({ block: 'nearest' })
  }

  function showKind (k) {
    if (k && KINDS[k] && k !== kind) { kind = k; sort = { col: null, dir: 1 }; focus = null; activeCol = null; render() }
  }

  // Open one cell for editing, with its content selected (e.g. double-clicking a flow).
  function editCell (uid, col) {
    if (editing && editing.uid === uid && editing.col === col) return
    if (editing) editing.input.blur() // saves the cell that was open
    const doc = app.getDoc()
    if (!doc || !doc[kind].some(r => r._uid === uid)) return
    if (filter && !visibleRows.some(r => r._uid === uid)) { filter = ''; filterInput.value = '' }
    render()
    const td = cellFor(uid, col)
    if (!td) return
    td.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    focus = { uid, col }
    startEdit(td)
  }

  return { render, renderSelection, showKind, editCell, get kind () { return kind } }
}
