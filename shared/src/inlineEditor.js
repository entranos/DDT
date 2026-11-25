// Editing text in place on the canvas: a text box laid over a label or title.
// Enter or clicking elsewhere saves, Escape cancels. One editor is open at a time;
// apps can register their own floating panel with setActive() so it follows the same rule.

import { h, shortcutIn } from './dom.js'
import { isFiniteNumber, toNumber } from './values.js'

// host: the positioned element the box is placed in. refocus(): where focus goes after Enter/Escape.
export function createInlineEditor (host, { refocus = () => {} } = {}) {
  let active = null // { el, finish(commit) }
  const measureCtx = document.createElement('canvas').getContext('2d')

  function textWidth (text, px, family, weight) {
    measureCtx.font = `${weight} ${px}px ${family}`
    return measureCtx.measureText(text).width
  }

  function close (commit = true) {
    if (active) active.finish(commit)
  }

  function setActive (el, finish) {
    close(true)
    active = { el, finish }
  }

  function clearActive (el) {
    if (!active || active.el !== el) return false
    active = null
    return true
  }

  // rect: screen rectangle of the text; growLeft keeps its right edge fixed.
  function open ({ rect, growLeft = false, px, family, weight = 300, color = '#000', value, label, numeric = false, placeholder, onCommit }) {
    close(true)
    if (!rect) return
    const pad = Math.max(3, px * 0.45)
    const input = h('input', {
      class: `label-edit${numeric ? ' num' : ''}`,
      type: 'text',
      inputmode: numeric ? 'decimal' : undefined,
      value,
      spellcheck: 'false',
      autocomplete: 'off',
      placeholder,
      'aria-label': label
    })
    const height = Math.max(rect.height, px * 1.7)
    Object.assign(input.style, {
      fontSize: `${px}px`,
      fontFamily: family,
      fontWeight: String(weight),
      color,
      height: `${height}px`,
      padding: `0 ${pad}px`,
      textAlign: growLeft ? 'right' : 'left'
    })
    host.append(input)
    const box = host.getBoundingClientRect()
    input.style.top = `${rect.top - (height - rect.height) / 2 - box.top}px`
    if (growLeft) { input.style.right = `${box.right - rect.right - pad}px`; input.style.left = 'auto' } else { input.style.left = `${rect.left - pad - box.left}px`; input.style.right = 'auto' }
    const grow = () => { input.style.width = `${Math.max(rect.width + pad * 2, textWidth(input.value || placeholder || ' ', px, family, weight) + pad * 2 + px)}px` }
    grow()
    input.addEventListener('input', () => {
      grow()
      if (numeric) input.classList.toggle('invalid', !isFiniteNumber(toNumber(input.value)))
    })
    input.focus()
    input.select()

    const finish = commit => {
      if (!clearActive(input)) return
      input.remove()
      if (commit) onCommit(input.value)
    }
    input.addEventListener('keydown', e => {
      const shortcut = shortcutIn(e, input.value === String(value ?? ''))
      if (shortcut) { finish(shortcut === 'commit'); refocus(); return }
      e.stopPropagation()
      if (e.key === 'Enter') { e.preventDefault(); finish(true); refocus() }
      if (e.key === 'Escape') { e.preventDefault(); finish(false); refocus() }
    })
    input.addEventListener('blur', () => finish(true))
    active = { el: input, finish }
  }

  return { open, close, setActive, clearActive, get isOpen () { return !!active } }
}
