// A small pop-up menu. Closes on choosing, Escape, or pressing anywhere else.

import { h, icon } from './dom.js'

let closeOpen = null

// anchor: the element it belongs to, or a point { x, y }.
// items: [{ label, icon, danger, onClick }]
export function openMenu (anchor, items) {
  if (closeOpen) closeOpen()
  const el = anchor instanceof Element ? anchor : null
  const menu = h('div', { class: 'menu', role: 'menu' }, items.map(i => h('button', {
    type: 'button',
    role: 'menuitem',
    class: `menu-item${i.danger ? ' danger' : ''}`,
    onclick: () => { close(); i.onClick() }
  }, i.icon ? icon(i.icon, 14) : null, h('span', { text: i.label }))))
  document.body.append(menu)

  // Below the anchor, or above it when there is no room.
  const r = el ? el.getBoundingClientRect() : { left: anchor.x, right: anchor.x, top: anchor.y, bottom: anchor.y }
  const { offsetWidth: w, offsetHeight: height } = menu
  const below = r.bottom + 4 + height <= window.innerHeight - 8
  menu.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - w - 8))}px`
  menu.style.top = `${Math.max(8, below ? r.bottom + 4 : r.top - height - 4)}px`

  const buttons = [...menu.children]
  buttons[0].focus()
  if (el) el.setAttribute('aria-expanded', 'true')

  const onKey = e => {
    e.stopPropagation()
    const i = buttons.indexOf(document.activeElement)
    if (e.key === 'Escape') { e.preventDefault(); close(); if (el && el.isConnected) el.focus() }
    else if (e.key === 'ArrowDown') { e.preventDefault(); buttons[(i + 1) % buttons.length].focus() }
    else if (e.key === 'ArrowUp') { e.preventDefault(); buttons[(i - 1 + buttons.length) % buttons.length].focus() }
    else if (e.key === 'Tab') close()
  }
  const outside = e => { if (!menu.contains(e.target)) close() }
  menu.addEventListener('keydown', onKey)
  document.addEventListener('pointerdown', outside, true)
  window.addEventListener('resize', close)
  document.addEventListener('scroll', close, true)

  function close () {
    document.removeEventListener('pointerdown', outside, true)
    window.removeEventListener('resize', close)
    document.removeEventListener('scroll', close, true)
    menu.remove()
    if (el) el.setAttribute('aria-expanded', 'false')
    if (closeOpen === close) closeOpen = null
  }
  closeOpen = close
}
