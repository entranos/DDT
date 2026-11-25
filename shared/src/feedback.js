// Toasts, dialogs and the activity log. These replace alert(), confirm() and
// the old console panel.

import { h, icon } from './dom.js'

// ---- toasts ----

export function toast (message, { kind = 'info', action = null, timeout = 4500 } = {}) {
  const root = document.getElementById('toasts')
  const el = h('div', { class: `toast toast-${kind}`, role: kind === 'error' ? 'alert' : 'status' },
    icon(kind === 'error' ? 'error' : kind === 'success' ? 'check' : kind === 'warning' ? 'alert' : 'info'),
    h('span', { class: 'toast-text', text: message }),
    action && h('button', { class: 'toast-action', type: 'button', text: action.label, onclick: () => { action.onClick(); dismiss() } }),
    h('button', { class: 'toast-close', type: 'button', 'aria-label': 'Dismiss', onclick: () => dismiss() }, icon('close', 14))
  )
  root.appendChild(el)
  requestAnimationFrame(() => el.classList.add('show'))
  let timer = timeout ? setTimeout(dismiss, kind === 'error' ? timeout * 2 : timeout) : null
  el.addEventListener('mouseenter', () => { clearTimeout(timer) })
  el.addEventListener('mouseleave', () => { if (timeout) timer = setTimeout(dismiss, 2000) })
  function dismiss () {
    clearTimeout(timer)
    el.classList.remove('show')
    setTimeout(() => el.remove(), 200)
  }
  return dismiss
}

// ---- dialogs ----

let openDialogs = 0
export const dialogOpen = () => openDialogs > 0

export function openDialog ({ title, body, actions = [], width = 520, className = '', onClose = null }) {
  const root = document.getElementById('dialogRoot')
  const previousFocus = document.activeElement
  const titleId = `dlg-${Math.random().toString(36).slice(2, 8)}`
  const panel = h('div', { class: `dialog ${className}`, role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId, style: { width: `min(${width}px, calc(100vw - 32px))` } },
    h('header', { class: 'dialog-head' },
      h('h2', { id: titleId, text: title }),
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Close', onclick: () => close() }, icon('close'))
    ),
    h('div', { class: 'dialog-body' }, body),
    actions.length ? h('footer', { class: 'dialog-foot' }, actions.map(a => h('button', {
      class: `btn ${a.kind === 'primary' ? 'btn-primary' : a.kind === 'danger' ? 'btn-danger' : 'btn-ghost'}`,
      type: 'button',
      text: a.label,
      disabled: a.disabled,
      onclick: async () => {
        const keepOpen = a.onClick ? (await a.onClick()) === false : false
        if (!keepOpen && a.close !== false) close()
      }
    }))) : null
  )
  const backdrop = h('div', { class: 'dialog-backdrop', onmousedown: e => { if (e.target === backdrop) close() } }, panel)
  const onKey = e => {
    if (e.key === 'Escape') { e.stopPropagation(); close() }
    if (e.key === 'Tab') trapFocus(e, panel)
  }
  backdrop.addEventListener('keydown', onKey)
  root.appendChild(backdrop)
  openDialogs += 1
  requestAnimationFrame(() => {
    backdrop.classList.add('show')
    const first = panel.querySelector('[autofocus]') || panel.querySelector('.dialog-body input, .dialog-body select, .dialog-body textarea, .dialog-foot .btn-primary, .dialog-foot .btn')
    if (first) first.focus()
  })
  let closed = false
  function close () {
    if (closed) return
    closed = true
    openDialogs -= 1
    backdrop.classList.remove('show')
    setTimeout(() => backdrop.remove(), 150)
    if (previousFocus && previousFocus.focus) previousFocus.focus({ preventScroll: true })
    if (onClose) onClose()
  }
  return { close, panel }
}

function trapFocus (e, panel) {
  const items = [...panel.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter(el => !el.disabled && el.offsetParent !== null)
  if (!items.length) return
  const first = items[0]
  const last = items[items.length - 1]
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
}

export function confirmDialog (message, { title = 'Are you sure?', confirmLabel = 'Continue', danger = false, cancelLabel = 'Cancel' } = {}) {
  return new Promise(resolve => {
    let answered = false
    openDialog({
      title,
      body: h('p', { class: 'dialog-text', text: message }),
      width: 440,
      actions: [
        { label: cancelLabel, onClick: () => { answered = true; resolve(false) } },
        { label: confirmLabel, kind: danger ? 'danger' : 'primary', onClick: () => { answered = true; resolve(true) } }
      ],
      onClose: () => { if (!answered) resolve(false) }
    })
  })
}

// ---- activity log ----

const entries = []
const logListeners = new Set()

export function log (message, level = 'info') {
  entries.unshift({ time: new Date(), message, level })
  if (entries.length > 200) entries.pop()
  logListeners.forEach(fn => fn(entries))
}

export function onLog (fn) {
  logListeners.add(fn)
  fn(entries)
}

export function clearLog () {
  entries.length = 0
  logListeners.forEach(fn => fn(entries))
}
