// The bottom drawer with three tabs: Data (the grid), Issues and Log.
// An editor always opens with the Data tab showing; the drawer's height is remembered in
// this browser.

import { h, icon, clear } from './dom.js'
import { onLog, clearLog } from './feedback.js'

// options: { storageKey, noIssuesText }
export function createDrawer (root, app, { storageKey, noIssuesText = 'No issues found.' } = {}) {
  const PREF_KEY = storageKey
  const saved = JSON.parse(localStorage.getItem(PREF_KEY) || '{}')
  let state = { tab: 'data', open: true, height: saved.height || 260 }
  const persist = () => localStorage.setItem(PREF_KEY, JSON.stringify({ height: state.height }))

  const badge = h('span', { class: 'tab-badge', hidden: true })
  const tabButtons = {
    data: h('button', { type: 'button', role: 'tab', class: 'drawer-tab', onclick: () => select('data') }, 'Data'),
    issues: h('button', { type: 'button', role: 'tab', class: 'drawer-tab', onclick: () => select('issues') }, 'Issues', badge),
    log: h('button', { type: 'button', role: 'tab', class: 'drawer-tab', onclick: () => select('log') }, 'Log')
  }
  const toggle = h('button', { type: 'button', class: 'icon-btn small', onclick: () => setOpen(!state.open) }, icon('chevronDown', 16))
  const resizer = h('div', { class: 'drawer-resizer', role: 'separator', 'aria-orientation': 'horizontal', title: 'Drag to resize' })
  const panes = {
    data: h('div', { class: 'drawer-pane pane-data', role: 'tabpanel' }),
    issues: h('div', { class: 'drawer-pane pane-issues', role: 'tabpanel' }),
    log: h('div', { class: 'drawer-pane pane-log', role: 'tabpanel' })
  }
  root.append(resizer, h('div', { class: 'drawer-head', role: 'tablist' }, Object.values(tabButtons), h('span', { class: 'spacer' }), toggle), h('div', { class: 'drawer-body' }, Object.values(panes)))

  function apply () {
    root.classList.toggle('collapsed', !state.open)
    root.style.height = state.open ? `${state.height}px` : ''
    toggle.title = state.open ? 'Hide panel' : 'Show panel'
    toggle.setAttribute('aria-label', toggle.title)
    toggle.classList.toggle('flipped', !state.open)
    Object.entries(tabButtons).forEach(([k, b]) => { b.setAttribute('aria-selected', String(k === state.tab)); panes[k].hidden = k !== state.tab })
    window.dispatchEvent(new Event('resize'))
  }

  function select (tab) {
    if (state.tab === tab && state.open) { setOpen(false); return }
    state.tab = tab
    state.open = true
    persist()
    apply()
    if (tab === 'data') app.renderGrid()
  }

  // Open a tab (without the toggle-closed behaviour of clicking an open tab).
  function show (tab) {
    const wasShowing = state.open && state.tab === tab
    state.tab = tab
    state.open = true
    persist()
    if (!wasShowing) apply()
    if (tab === 'data') app.renderGrid()
  }

  function setOpen (open) {
    state.open = open
    persist()
    apply()
  }

  resizer.addEventListener('pointerdown', e => {
    if (!state.open) return
    e.preventDefault()
    resizer.setPointerCapture(e.pointerId)
    const startY = e.clientY
    const startH = state.height
    const move = ev => {
      state.height = Math.max(120, Math.min(window.innerHeight - 200, startH + (startY - ev.clientY)))
      root.style.height = `${state.height}px`
    }
    const up = () => {
      resizer.removeEventListener('pointermove', move)
      resizer.removeEventListener('pointerup', up)
      persist()
      window.dispatchEvent(new Event('resize'))
    }
    resizer.addEventListener('pointermove', move)
    resizer.addEventListener('pointerup', up)
  })

  // ---- issues ----

  const SEVERITY = { error: { icon: 'error', label: 'Error' }, warning: { icon: 'alert', label: 'Warning' }, info: { icon: 'info', label: 'Note' } }

  function renderIssues (issues) {
    const counts = { error: 0, warning: 0, info: 0 }
    issues.forEach(i => { counts[i.severity] += 1 })
    const serious = counts.error + counts.warning
    badge.hidden = serious === 0
    badge.textContent = String(serious)
    badge.className = `tab-badge ${counts.error ? 'tab-badge-error' : 'tab-badge-warning'}`
    const pane = panes.issues
    const scroll = pane.scrollTop
    clear(pane)
    if (!app.getDoc()) return
    if (!issues.length) {
      pane.append(h('div', { class: 'issues-empty' }, icon('check', 18), h('span', { text: noIssuesText })))
      return
    }
    pane.append(h('p', { class: 'issues-summary', text: [counts.error && `${counts.error} error${counts.error > 1 ? 's' : ''}`, counts.warning && `${counts.warning} warning${counts.warning > 1 ? 's' : ''}`, counts.info && `${counts.info} note${counts.info > 1 ? 's' : ''}`].filter(Boolean).join(' · ') }))
    pane.append(h('ul', { class: 'issues' }, issues.map(issue => h('li', { class: `issue issue-${issue.severity}`, dataset: { targets: (issue.targets || []).map(t => t.uid).join(' ') } },
      h('span', { class: 'issue-icon', title: SEVERITY[issue.severity].label }, icon(SEVERITY[issue.severity].icon, 16)),
      h('span', { class: 'issue-text', text: issue.message }),
      h('span', { class: 'issue-actions' },
        issue.targets && issue.targets.length ? h('button', { type: 'button', class: 'btn btn-ghost btn-small', onclick: () => app.showTargets(issue.targets) }, icon('target', 14), issue.targets.length > 1 ? `Show ${issue.targets.length}` : 'Show') : null,
        issue.fix ? h('button', { type: 'button', class: 'btn btn-small', onclick: () => app.runFix(issue.fix.action, issue) }, issue.fix.label) : null
      )
    ))))
    pane.scrollTop = scroll
  }

  // Scroll to and briefly highlight the issues that concern one item.
  function highlightIssuesFor (uid) {
    const items = [...panes.issues.querySelectorAll('.issue')].filter(li => li.dataset.targets.split(' ').includes(uid))
    if (!items.length) return
    items[0].scrollIntoView({ block: 'nearest' })
    items.forEach(li => {
      li.classList.remove('flash')
      void li.offsetWidth // restart the animation
      li.classList.add('flash')
    })
  }

  // ---- log ----

  onLog(entries => {
    const pane = panes.log
    clear(pane)
    pane.append(h('div', { class: 'log-head' }, h('span', { class: 'muted small', text: 'What the editor did in this session.' }), h('button', { type: 'button', class: 'btn btn-ghost btn-small', onclick: clearLog, text: 'Clear' })))
    pane.append(h('ol', { class: 'log' }, entries.map(e => h('li', { class: `log-${e.level}` },
      h('time', { text: e.time.toLocaleTimeString() }), h('span', { text: e.message })))))
  })

  apply()
  return { panes, renderIssues, select, show, highlightIssuesFor, get tab () { return state.tab }, get open () { return state.open } }
}
