// A form field for choosing a patterned fill: a button showing the current one, opening a
// grid of samples in the item's own colour. A blank value is the automatic choice.

import { h, clear } from './dom.js'
import { PATTERN_NAMES, patternName, patternLabel, patternSample } from './patterns.js'

//   value()      what the row's pattern column holds; null when several rows differ
//   shown()      the pattern that gives: a name, or '' for a plain fill
//   color()      to draw the samples in
//   style()      the diagram's patternStyle
//   auto         { label, title, text } of the automatic choice; without it that is a plain fill
//   onCommit(value)
//   mark         the second colour: { value() as in the column, shown() the colour or null for automatic, onCommit(value, { live }) }
export function patternField ({ label = 'Pattern', value, shown, color, style = () => 'light', auto = null, help, onCommit, mark = null }) {
  const current = h('span', { class: 'pattern-current' })
  const results = h('div', { class: 'pattern-grid' })
  const choices = [...(auto ? [{ value: '', label: auto.label, title: auto.title }, { value: 'none', label: 'Plain' }] : [{ value: '', label: 'Plain' }]), ...PATTERN_NAMES.map(v => ({ value: v, label: patternLabel(v) }))]
  const details = h('details', { class: 'pattern-field' },
    h('summary', { class: 'input pattern-summary' }, current),
    h('div', { class: 'pattern-picker' }, results))
  // ---- second colour ----
  const swatch = h('input', { type: 'color', class: 'swatch', 'aria-label': 'Second colour' })
  const hexInput = h('input', { type: 'text', class: 'input mono hex', spellcheck: 'false', placeholder: 'automatic', 'aria-label': 'Second colour, hex value' })
  const clearMark = h('button', { type: 'button', class: 'link-btn small', text: 'Automatic', title: 'A lighter or darker version of the colour', onclick: () => mark.onCommit('', { live: false }) })
  const markRow = h('div', { class: 'pattern-mark', hidden: true }, h('span', { class: 'field-label', text: 'Second colour' }), h('div', { class: 'color-control' }, swatch, hexInput, clearMark))
  swatch.addEventListener('input', () => { hexInput.value = swatch.value; mark.onCommit(swatch.value, { live: true }) })
  swatch.addEventListener('change', () => mark.onCommit(swatch.value, { live: false }))
  hexInput.addEventListener('change', () => {
    const v = hexInput.value.trim()
    if (v === '' || /^#?[0-9a-f]{3}([0-9a-f]{3})?$/i.test(v)) mark.onCommit(v === '' || v.startsWith('#') ? v : `#${v}`, { live: false })
    else update()
  })
  hexInput.addEventListener('keydown', e => { if (e.key === 'Enter') hexInput.blur() })
  const second = () => (mark ? mark.shown() : null)

  const choose = v => { onCommit(v); details.open = false }
  const raw = () => { const v = value(); return v === null ? null : String(v ?? '').trim() }
  // The choice a raw value stands for, so that e.g. "hatched" marks Diagonal.
  const picked = () => { const v = raw(); if (v === null) return null; if (!v) return ''; const n = patternName(v); return n === '' ? (auto ? 'none' : '') : n }

  function renderResults () {
    if (!details.open) return
    const now = picked()
    clear(results).append(...choices.map(c => {
      const name = c.value === '' && auto ? null : patternName(c.value)
      return h('button', { type: 'button', class: `pattern-choice${name === null ? ' pattern-auto' : ''}`, dataset: { value: c.value }, title: c.title || c.label, 'aria-label': c.label, 'aria-pressed': String(now === c.value), onclick: () => choose(c.value) },
        name === null ? h('span', { text: c.label }) : patternSample(name, color(), { width: 52, height: 26, style: style(), mark: second() }))
    }))
  }
  details.addEventListener('toggle', renderResults)

  function update () {
    const v = raw()
    const name = shown()
    let words
    if (v === null) words = 'Several'
    else if (v && patternName(v) === null) words = `${v} (unknown)`
    else words = `${name ? patternLabel(name) : 'Plain'}${!v && auto ? ` (${auto.text})` : ''}`
    clear(current).append(v === null ? '' : patternSample(name, color(), { width: 26, height: 16, style: style(), size: 6, mark: second() }), h('span', { text: words }))
    renderResults()
    if (!mark) return
    markRow.hidden = !(v === null || name)
    const now = String(mark.value() ?? '').trim()
    clearMark.hidden = !now
    if (document.activeElement !== hexInput && document.activeElement !== swatch) {
      hexInput.value = now
      swatch.value = /^#[0-9a-f]{6}$/i.test(second() || '') ? second() : '#ffffff'
      swatch.classList.toggle('is-auto', !second())
    }
  }
  update()
  return {
    el: h('div', { class: 'field field-wide' }, h('span', { class: 'field-label', text: label }), details, mark ? markRow : null, help ? h('p', { class: 'field-help', text: help }) : null),
    open () { details.open = true; details.scrollIntoView({ block: 'nearest' }) },
    update
  }
}
