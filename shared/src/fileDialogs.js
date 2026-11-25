// Export and Save as dialogs, shared by every editor.

import { h, clear } from './dom.js'
import { openDialog } from './feedback.js'
import { FORMATS } from './formats.js'

const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)
export const MOD = IS_MAC ? '⌘' : 'Ctrl'

export function radioGroup (name, options, value, onChange) {
  return h('div', { class: 'radio-group', role: 'radiogroup' }, options.map(o => {
    const input = h('input', { type: 'radio', name, value: o.value, checked: o.value === value })
    input.addEventListener('change', () => { if (input.checked) onChange(o.value) })
    return h('label', { class: 'radio' }, input, h('span', {}, h('strong', { text: o.label }), o.note ? h('small', { text: o.note }) : null))
  }))
}

export const cleanFileName = name => String(name || '').replace(/\.[a-z0-9]+$/i, '').replace(/[\\/:*?"<>|]+/g, '').trim()

// size: { width, height } of the canvas; transparent: the diagram's own setting;
// baseName: suggested file name without extension.
export function openExportDialog (app, { buildSvg, buildPng, download, size, transparent, baseName }) {
  const { width, height } = size
  const base = cleanFileName(baseName) || 'diagram'
  const opts = { format: 'png', scale: 2, background: transparent ? 'transparent' : 'document' }
  const preview = h('div', { class: 'export-preview' })
  const sizeNote = h('p', { class: 'muted small' })
  const name = h('input', { class: 'input', type: 'text', value: base, 'aria-label': 'File name', spellcheck: 'false' })
  const scaleRow = h('div', { class: 'form-row' })

  const refreshNote = () => {
    sizeNote.textContent = opts.format === 'png'
      ? `${Math.round(width * opts.scale)} × ${Math.round(height * opts.scale)} pixels.`
      : `${width} × ${height} px vector image. Bundled fonts are embedded.`
    scaleRow.hidden = opts.format !== 'png'
  }
  let previewToken = 0
  const refreshPreview = async () => {
    const token = ++previewToken
    try {
      const svg = await buildSvg(app.getDoc(), { transparent: opts.background === 'transparent' })
      if (token !== previewToken) return
      const img = h('img', { alt: 'Preview of the exported image', src: URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' })) })
      img.addEventListener('load', () => URL.revokeObjectURL(img.src))
      clear(preview).append(img)
      preview.classList.toggle('transparent', opts.background === 'transparent')
    } catch (e) {
      clear(preview).append(h('p', { class: 'muted', text: `Preview failed: ${e.message}` }))
    }
  }

  scaleRow.append(h('span', { class: 'form-label', text: 'Size' }), radioGroup('exp-scale', [
    { value: '1', label: '1×' }, { value: '2', label: '2×', note: 'sharp on most screens' }, { value: '3', label: '3×', note: 'print' }
  ], String(opts.scale), v => { opts.scale = Number(v); refreshNote() }))

  const body = h('div', { class: 'export-dialog' },
    preview,
    h('div', { class: 'export-options' },
      h('div', { class: 'form-row' }, h('span', { class: 'form-label', text: 'Format' }), radioGroup('exp-format', [
        { value: 'png', label: 'PNG', note: 'for slides and documents' },
        { value: 'svg', label: 'SVG', note: 'editable vector graphic' }
      ], opts.format, v => { opts.format = v; refreshNote() })),
      scaleRow,
      h('div', { class: 'form-row' }, h('span', { class: 'form-label', text: 'Background' }), radioGroup('exp-bg', [
        { value: 'document', label: 'As in the diagram' },
        { value: 'transparent', label: 'Transparent' }
      ], opts.background, v => { opts.background = v; refreshPreview() })),
      h('div', { class: 'form-row' }, h('label', { class: 'form-label', text: 'File name' }), name),
      sizeNote
    )
  )
  refreshNote()
  refreshPreview()
  openDialog({
    title: 'Export image',
    body,
    width: 760,
    actions: [
      { label: 'Cancel' },
      {
        label: 'Export',
        kind: 'primary',
        onClick: async () => {
          const file = `${name.value.trim() || base}.${opts.format}`
          const isTransparent = opts.background === 'transparent'
          try {
            if (opts.format === 'svg') download(await buildSvg(app.getDoc(), { transparent: isTransparent }), file, 'image/svg+xml')
            else download(await buildPng(app.getDoc(), { scale: opts.scale, transparent: isTransparent }), file, 'image/png')
            app.notify(`Exported ${file}.`, 'success')
          } catch (e) {
            app.notify(`Export failed: ${e.message}`, 'error')
            return false
          }
        }
      }
    ]
  })
}

export function openSaveAsDialog (app, { format: initial, baseName }, onChoose) {
  let format = initial || 'xlsx'
  const base = cleanFileName(baseName) || 'diagram'
  const name = h('input', { class: 'input', type: 'text', value: base, spellcheck: 'false', 'aria-label': 'File name' })
  openDialog({
    title: 'Save as',
    width: 480,
    body: h('div', { class: 'stack' },
      h('div', { class: 'form-row' }, h('span', { class: 'form-label', text: 'Format' }), radioGroup('saveas-format', [
        { value: 'xlsx', label: 'Excel workbook (.xlsx)', note: 'edit the data in Excel; other sheets are kept' },
        { value: 'json', label: 'JSON (.json)', note: 'good for version control' },
        { value: 'yaml', label: 'YAML (.yaml)', note: 'readable text, good for version control' }
      ], format, v => { format = v })),
      h('div', { class: 'form-row' }, h('label', { class: 'form-label', text: 'File name' }), name)
    ),
    actions: [
      { label: 'Cancel' },
      { label: 'Save', kind: 'primary', onClick: () => onChoose(format, `${name.value.trim() || base}.${FORMATS[format].extensions[0]}`) }
    ]
  })
}

// A file that holds many diagrams: choose one. options: [{ value, label }]
export function openChooseDialog ({ title, text, options }, onChoose) {
  const list = h('select', { class: 'input choose-list', size: 12, 'aria-label': title })
  const filter = h('input', { type: 'search', class: 'input', placeholder: `Find in ${options.length}`, 'aria-label': 'Find', spellcheck: 'false' })
  const fill = () => {
    const words = filter.value.trim().toLowerCase().split(/\s+/).filter(Boolean)
    const found = options.filter(o => words.every(w => o.label.toLowerCase().includes(w)))
    clear(list).append(...found.map(o => h('option', { value: o.value, text: o.label })))
    if (found.length) list.value = found[0].value
  }
  fill()
  filter.addEventListener('input', fill)
  const choose = () => {
    if (!list.value) return false
    onChoose(list.value)
  }
  const dialog = openDialog({
    title,
    width: 520,
    body: h('div', { class: 'stack' }, h('p', { class: 'dialog-text', text }), filter, list),
    actions: [{ label: 'Cancel' }, { label: 'Open', kind: 'primary', onClick: choose }]
  })
  const open = () => { if (choose() !== false) dialog.close() }
  list.addEventListener('dblclick', open)
  ;[list, filter].forEach(el => el.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); open() }
    if (el === filter && e.key === 'ArrowDown') { e.preventDefault(); list.focus() }
  }))
}

// Help: sections of { title, children }, then a table of [action, how] shortcuts.
export function openHelp ({ title, sections, shortcuts }) {
  openDialog({
    title,
    width: 760,
    className: 'dialog-help',
    body: h('div', { class: 'help' },
      sections.map(s => h('section', { class: 'help-section' }, h('h3', { text: s.title }), s.children)),
      h('section', { class: 'help-section' }, h('h3', { text: 'Keyboard and mouse' }),
        h('table', { class: 'shortcuts' }, h('tbody', {}, shortcuts.map(([a, b]) => h('tr', {}, h('th', { text: a }), h('td', { text: b }))))))
    ),
    actions: [{ label: 'Close', kind: 'primary' }]
  })
}
