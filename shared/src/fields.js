// Form fields for the inspector. Each returns { el, update(value) }; update()
// refreshes the shown value unless the user is editing that field.
// onCommit(value, { live }) — live commits happen while typing and are coalesced
// into one undo step by the caller.

import { h } from './dom.js'
import { toNumber } from './values.js'
import { plainNumber } from './format.js'

let seq = 0
const nextId = () => `fld-${++seq}`

function wrap (label, control, { help, suffix, id, wide } = {}) {
  return h('div', { class: `field${wide ? ' field-wide' : ''}` },
    label ? h('label', { class: 'field-label', for: id, text: label }) : null,
    h('div', { class: 'field-control' }, control, suffix ? h('span', { class: 'field-suffix', text: suffix }) : null),
    help ? h('p', { class: 'field-help', text: help }) : null
  )
}

export function textField ({ label, value, placeholder, help, onCommit, live = false, list, mono = false, wide = true, validate }) {
  const id = nextId()
  let last = value ?? ''
  const input = h('input', { id, type: 'text', class: `input${mono ? ' mono' : ''}`, value: last, placeholder, list, spellcheck: 'false', autocomplete: 'off' })
  const check = () => {
    const msg = validate ? validate(input.value) : null
    input.classList.toggle('invalid', !!msg)
    input.title = msg || ''
    return !msg
  }
  if (live) input.addEventListener('input', () => { if (check()) onCommit(input.value, { live: true }) })
  input.addEventListener('change', () => { if (check()) { last = input.value; onCommit(input.value, { live: false }) } else { input.value = last; check() } })
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') input.blur()
    if (e.key === 'Escape') { input.value = last; check(); input.blur() }
  })
  return {
    el: wrap(label, input, { help, id, wide }),
    input,
    update (v) { last = v ?? ''; if (document.activeElement !== input) { input.value = last; check() } }
  }
}

export function textAreaField ({ label, value, placeholder, help, onCommit }) {
  const id = nextId()
  const input = h('textarea', { id, class: 'input', rows: 3, placeholder, value: value ?? '' })
  input.addEventListener('change', () => onCommit(input.value, { live: false }))
  return { el: wrap(label, input, { help, id, wide: true }), input, update (v) { if (document.activeElement !== input) input.value = v ?? '' } }
}

export function numberField ({ label, value, min, max, step = 1, suffix, help, onCommit, wide = false, integer = false }) {
  const id = nextId()
  let last = value
  const input = h('input', { id, type: 'text', inputmode: 'decimal', class: 'input num', value: plainNumber(value), spellcheck: 'false', autocomplete: 'off' })
  const parse = () => {
    const n = toNumber(input.value)
    if (typeof n !== 'number' || !Number.isFinite(n)) return null
    let v = n
    if (min !== undefined) v = Math.max(min, v)
    if (max !== undefined) v = Math.min(max, v)
    if (integer) v = Math.round(v)
    return v
  }
  const commit = live => {
    const v = parse()
    input.classList.toggle('invalid', v === null && input.value.trim() !== '')
    if (v === null) return
    last = v
    onCommit(v, { live })
  }
  input.addEventListener('input', () => commit(true))
  input.addEventListener('change', () => { commit(false); if (parse() === null) { input.value = plainNumber(last); input.classList.remove('invalid') } })
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') input.blur()
    if (e.key === 'Escape') { input.value = plainNumber(last); input.blur() }
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault()
      const base = parse() ?? Number(last) ?? 0
      const s = step === 'any' ? (Math.abs(base) >= 10 ? 1 : 0.1) : Number(step)
      const next = Math.round((base + (e.key === 'ArrowUp' ? 1 : -1) * s * (e.shiftKey ? 10 : 1)) * 1e6) / 1e6
      input.value = plainNumber(next)
      commit(true)
    }
  })
  return { el: wrap(label, input, { help, suffix, id, wide }), input, update (v) { last = v; if (document.activeElement !== input) { input.value = plainNumber(v); input.classList.remove('invalid') } } }
}

export function colorField ({ label, value, help, onCommit }) {
  const id = nextId()
  const normal = v => (/^#[0-9a-f]{6}$/i.test(v || '') ? v : /^#[0-9a-f]{3}$/i.test(v || '') ? '#' + v.slice(1).split('').map(c => c + c).join('') : '#000000')
  const swatch = h('input', { id, type: 'color', class: 'swatch', value: normal(value) })
  const text = h('input', { type: 'text', class: 'input mono hex', value: value || '', spellcheck: 'false', 'aria-label': `${label} hex value` })
  swatch.addEventListener('input', () => { text.value = swatch.value; onCommit(swatch.value, { live: true }) })
  swatch.addEventListener('change', () => onCommit(swatch.value, { live: false }))
  text.addEventListener('change', () => {
    const v = text.value.trim()
    if (/^#?[0-9a-f]{3}([0-9a-f]{3})?$/i.test(v)) {
      const hex = v.startsWith('#') ? v : `#${v}`
      swatch.value = normal(hex)
      onCommit(hex, { live: false })
    } else text.value = swatch.value
  })
  text.addEventListener('keydown', e => { if (e.key === 'Enter') text.blur() })
  const control = h('div', { class: 'color-control' }, swatch, text)
  return { el: wrap(label, control, { help, id }), update (v) { if (document.activeElement !== text && document.activeElement !== swatch) { swatch.value = normal(v); text.value = v || '' } } }
}

export function toggleField ({ label, value, help, onCommit }) {
  const id = nextId()
  const input = h('input', { id, type: 'checkbox', class: 'toggle-input', checked: !!value })
  input.addEventListener('change', () => onCommit(input.checked, { live: false }))
  const el = h('div', { class: 'field field-toggle field-wide' },
    h('label', { class: 'toggle', for: id }, input, h('span', { class: 'toggle-track', 'aria-hidden': 'true' }), h('span', { class: 'toggle-text', text: label })),
    help ? h('p', { class: 'field-help', text: help }) : null)
  return { el, update (v) { input.checked = !!v } }
}

export function selectField ({ label, value, options, help, onCommit, wide = true }) {
  const id = nextId()
  const select = h('select', { id, class: 'input' }, options.map(o => h('option', { value: o.value, text: o.label })))
  select.value = value ?? ''
  select.addEventListener('change', () => onCommit(select.value, { live: false }))
  return { el: wrap(label, select, { help, id, wide }), update (v) { if (document.activeElement !== select) select.value = v ?? '' } }
}

export function segmentedField ({ label, value, options, onCommit, help }) {
  const id = nextId()
  const buttons = options.map(o => h('button', {
    type: 'button',
    class: 'seg',
    'aria-pressed': String(o.value === value),
    text: o.label,
    onclick: () => { onCommit(o.value, { live: false }) }
  }))
  const group = h('div', { class: 'segmented', role: 'group', 'aria-labelledby': id }, buttons)
  const el = h('div', { class: 'field' }, h('span', { class: 'field-label', id, text: label }), group, help ? h('p', { class: 'field-help', text: help }) : null)
  return { el, update (v) { buttons.forEach((b, i) => b.setAttribute('aria-pressed', String(options[i].value === v))) } }
}
