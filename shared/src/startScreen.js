// The start screen each editor shows until a diagram is open.

import { h, icon, clear } from './dom.js'

// cards: [{ icon, title, text, onClick, primary }]; footer: nodes shown under the cards.
// draft: unsaved work found in this browser, with onRestore / onDiscard.
export function renderStartScreen (root, { title, draft, cards, footer = [], onRestore, onDiscard }) {
  clear(root)
  root.append(h('div', { class: 'start' },
    h('div', { class: 'start-brand' }, h('span', { class: 'start-name', text: title })),
    draft ? h('div', { class: 'start-restore' },
      icon('info', 18),
      h('span', {}, 'Unsaved work from ', h('strong', { text: draft.file && draft.file.name ? draft.file.name : 'an untitled diagram' }), ` (${new Date(draft.savedAt).toLocaleString()}) is still in this browser.`),
      h('button', { type: 'button', class: 'btn btn-primary btn-small', text: 'Restore', onclick: () => onRestore(draft) }),
      h('button', { type: 'button', class: 'btn btn-ghost btn-small', text: 'Discard', onclick: onDiscard })
    ) : null,
    h('div', { class: 'start-cards' }, cards.map(c => h('button', { type: 'button', class: `start-card${c.primary ? ' primary' : ''}`, onclick: c.onClick },
      icon(c.icon, 22), h('span', { class: 'start-card-title', text: c.title }), h('span', { class: 'start-card-text', text: c.text })))),
    h('p', { class: 'start-foot' }, footer)
  ))
}
