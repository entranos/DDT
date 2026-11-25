// Palette mode: the diagram on the left, and on the right a panel that makes colours for it.
// What is shown is a preview; Apply makes it one undo step, Cancel leaves the diagram as it was.
//
// spec (an editor's `palette`):
//   noun               what gets colours, e.g. 'carriers'
//   patterns           whether those can have patterned fills
//   targets(doc)       [{ uid, label, names, color, weight, group?, pattern? }] in their order
//   apply(doc, changes) the document with changes: Map uid → { color?, pattern?, patterncolor? }
//   grouped            false when groups of targets don't share a colour by default
//   nounFor(doc)       optional: the noun, when it depends on the document
//   light, dark        optional settings of this editor that go with light and dark backgrounds

import { h, icon, clear } from './dom.js'
import { STYLES, STYLE, STYLE_GROUPS, DEFAULTS, BACKGROUNDS, newSeed, makeColors, assignColors, backgroundSettings, review, parseColors, mainColors } from './palette.js'
import { VISION, toHex } from './colorMath.js'
import { isTyping } from './dom.js'

const KEPT_KEY = 'diagram-toolkit.palettes'
const PATTERN_CYCLE = ['diagonal', 'dots', 'crosshatch', 'horizontal', 'waves', 'diagonal-down', 'grid', 'rings', 'zigzag', 'vertical', 'dashes', 'checks']
const PATTERNS = [{ value: 'keep', label: 'Keep as they are' }, { value: 'none', label: 'None' }, { value: 'alternate', label: 'On every other one' }, { value: 'stripes', label: 'Stripes on every other one' }, { value: 'all', label: 'On all of them' }]
const ORDERS = [{ value: 'listed', label: 'In the order of the list' }, { value: 'size', label: 'By size' }, { value: 'shuffle', label: 'Shuffled' }]
const VISIONS = [{ value: '', label: 'Normal' }, ...Object.entries(VISION).map(([value, v]) => ({ value, label: v.label }))]

const readKept = () => { try { return JSON.parse(localStorage.getItem(KEPT_KEY)) || [] } catch (e) { return [] } }
const writeKept = list => localStorage.setItem(KEPT_KEY, JSON.stringify(list.slice(0, 16)))

// setPreview(doc | null): draws another document without changing the open one.
export function createPaletteView ({ app, spec, canvas, host, settings, getSetting, setPreview }) {
  let open = false
  let base = null // the document when the mode was opened
  let targets = []
  let state = null
  let locked = new Map()
  let colors = new Map()
  let history = []
  let at = -1
  let vision = ''
  let comparing = false
  let queued = false

  const root = h('aside', { class: 'panel panel-right palette-panel', id: 'palette', 'aria-label': 'Palette' })
  document.querySelector('.app').append(root)
  const shield = h('div', { class: 'palette-shield', title: '' })
  host.append(shield)
  // Filters that show the diagram as colour-blind people see it.
  const NS = 'http://www.w3.org/2000/svg'
  const filters = document.createElementNS(NS, 'svg')
  filters.setAttribute('class', 'vision-filters')
  filters.setAttribute('aria-hidden', 'true')
  Object.entries(VISION).forEach(([id, v]) => {
    const f = document.createElementNS(NS, 'filter')
    f.setAttribute('id', `vision-${id}`)
    f.setAttribute('color-interpolation-filters', 'linearRGB')
    const m = document.createElementNS(NS, 'feColorMatrix')
    m.setAttribute('type', 'matrix')
    m.setAttribute('values', [0, 1, 2].map(r => `${v.matrix.slice(r * 3, r * 3 + 3).join(' ')} 0 0`).concat('0 0 0 1 0').join(' '))
    f.append(m)
    filters.append(f)
  })
  document.body.append(filters)

  // ---- looking around: scroll and drag still move the view ----

  shield.addEventListener('wheel', e => {
    e.preventDefault()
    if (e.ctrlKey || e.metaKey) canvas.zoomAt(Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0025) * (e.ctrlKey && !e.metaKey ? 4 : 1)), e.clientX, e.clientY)
    else { const f = e.deltaMode === 1 ? 16 : 1; canvas.panBy(-e.deltaX * f, -e.deltaY * f) }
  }, { passive: false })
  let pan = null
  shield.addEventListener('pointerdown', e => { pan = { x: e.clientX, y: e.clientY }; shield.setPointerCapture(e.pointerId); shield.classList.add('panning') })
  shield.addEventListener('pointermove', e => { if (pan) { canvas.panBy(e.clientX - pan.x, e.clientY - pan.y); pan = { x: e.clientX, y: e.clientY } } })
  ;['pointerup', 'pointercancel'].forEach(t => shield.addEventListener(t, () => { pan = null; shield.classList.remove('panning') }))

  // ---- colours ----

  const fixedStyle = () => (STYLE[state.style] || {}).fixed
  const toned = () => state.hue !== 0 || state.chroma !== 1 || state.light !== 0 || state.contrast !== 1 || state.variation !== 0
  const list = () => targets.map(t => colors.get(t.uid) || t.color)

  function changes () {
    const out = new Map()
    targets.forEach((t, i) => {
      const color = colors.get(t.uid) || t.color
      const c = color.toLowerCase() === t.color.toLowerCase() ? {} : { color }
      if (spec.patterns && state.patterns !== 'keep') {
        const on = state.patterns === 'all' || ((state.patterns === 'alternate' || state.patterns === 'stripes') && i % 2 === 1)
        c.pattern = on ? (state.patterns === 'stripes' ? 'stripes' : PATTERN_CYCLE[(state.patterns === 'all' ? i : (i - 1) / 2) % PATTERN_CYCLE.length]) : ''
        c.patterncolor = ''
      }
      out.set(t.uid, c)
    })
    return out
  }

  function result (doc) {
    let next = spec.apply(doc, changes())
    const own = state.background === 'keep' ? {} : state.background === 'dark' ? spec.dark || {} : spec.light || {}
    // Softened colours would not be the ones that were chosen.
    const soft = settings.softenColors && getSetting(doc, 'softenColors') && state.style !== 'original' ? { softenColors: false } : {}
    const back = Object.entries({ ...backgroundSettings(state.background, list()), ...own, ...soft }).filter(([k]) => settings[k])
    if (back.length) next = { ...next, settings: { ...next.settings, ...Object.fromEntries(back) } }
    return next
  }

  // Works the colours out again and draws them, at most once per frame.
  function refresh () {
    if (queued) return
    queued = true
    requestAnimationFrame(() => {
      queued = false
      if (!open) return
      // The colours as they are can be toned as well.
      const original = state.style === 'original'
      const options = original ? { ...state, style: 'own', own: targets.filter(t => !locked.has(t.uid)).map(t => t.color).join(' '), order: 'listed', grouped: false } : state
      colors = original && !toned() ? new Map(targets.map(t => [t.uid, locked.get(t.uid) || t.color])) : assignColors(targets, options, locked)
      setPreview(comparing ? null : result(base))
      update()
    })
  }

  // ---- history ----

  const snapshot = () => ({ state: { ...state }, locked: new Map(locked) })
  let pushTimer = null
  function remember (soon = false) {
    clearTimeout(pushTimer)
    const push = () => { history = [...history.slice(0, at + 1), snapshot()].slice(-80); at = history.length - 1; update() }
    if (soon) pushTimer = setTimeout(push, 350)
    else push()
  }
  function go (d) {
    if (!history[at + d]) return
    at += d
    state = { ...history[at].state }
    locked = new Map(history[at].locked)
    refresh()
  }

  function change (patch, { soon = false } = {}) {
    Object.assign(state, patch)
    remember(soon)
    refresh()
  }
  // Another palette of this style; a style without chance gets a random one first.
  function generate () {
    if (['own', 'picture'].includes(state.style)) change({ order: 'shuffle', seed: newSeed() })
    else if (['standard', 'original'].includes(state.style)) {
      const pool = STYLES.filter(s => s.group === 'Many colours' && s.id !== 'random')
      change({ style: pool[Math.floor(Math.random() * pool.length)].id, seed: newSeed(), variation: 0 })
    } else change({ seed: newSeed(), variation: 0 })
  }
  const vary = () => change({ variation: (state.variation || 0) + 1 + Math.floor(Math.random() * 5) })

  function choose (id) {
    const style = STYLE[id]
    if (id === state.style && !style.fixed && !style.own && !style.picture) { generate(); return }
    if (style.picture && !(state.picture && state.picture.length)) { pickPicture(); return }
    change({ style: id, variation: 0, own: style.own && !state.own ? list().join(' ') : state.own })
  }

  function pickPicture () {
    const input = h('input', { type: 'file', accept: 'image/*' })
    input.addEventListener('change', async () => {
      const file = input.files[0]
      if (!file) return
      try {
        const bitmap = await createImageBitmap(file)
        const k = Math.min(1, 160 / Math.max(bitmap.width, bitmap.height))
        const c = document.createElement('canvas')
        c.width = Math.max(1, Math.round(bitmap.width * k))
        c.height = Math.max(1, Math.round(bitmap.height * k))
        const ctx = c.getContext('2d')
        ctx.drawImage(bitmap, 0, 0, c.width, c.height)
        const found = mainColors(ctx.getImageData(0, 0, c.width, c.height).data, Math.max(6, Math.min(14, targets.length + 3)))
        if (!found.length) throw new Error('no colours found')
        change({ style: 'picture', picture: found, pictureName: file.name, variation: 0 })
      } catch (e) {
        app.notify(`Could not read that image: ${e.message}`, 'error')
      }
    })
    input.click()
  }

  // ---- the panel ----

  const el = {}
  const section = (title, children, openNow = true) => h('details', { class: 'insp-section', open: openNow }, h('summary', {}, icon('chevron', 14), h('span', { text: title })), h('div', { class: 'insp-grid' }, children))
  const strip = cs => h('span', { class: 'swatch-strip', 'aria-hidden': 'true' }, cs.map(c => h('span', { style: { background: c } })))

  function slider ({ key, label, min, max, step, show }) {
    const value = h('span', { class: 'slider-value' })
    const input = h('input', { type: 'range', min: String(min), max: String(max), step: String(step), 'aria-label': label })
    input.addEventListener('input', () => change({ [key]: Number(input.value) }, { soon: true }))
    input.addEventListener('dblclick', () => change({ [key]: DEFAULTS[key] }))
    const row = h('label', { class: 'slider field-wide' }, h('span', { class: 'field-label', text: label }), input, value)
    el.sliders.push(() => { input.value = String(state[key]); value.textContent = show(state[key]); row.classList.toggle('changed', state[key] !== DEFAULTS[key]) })
    return row
  }
  const signed = v => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v)}`

  function select (label, options, get, set) {
    const input = h('select', { class: 'input', 'aria-label': label }, options.map(o => h('option', { value: o.value, text: o.label })))
    input.addEventListener('change', () => set(input.value))
    el.selects.push(() => { input.value = get() })
    return h('div', { class: 'field field-wide' }, h('span', { class: 'field-label', text: label }), input)
  }
  function toggle (label, key, help) {
    const input = h('input', { type: 'checkbox', class: 'toggle-input' })
    input.addEventListener('change', () => change({ [key]: input.checked }))
    el.selects.push(() => { input.checked = !!state[key] })
    return h('div', { class: 'field field-toggle field-wide' }, h('label', { class: 'toggle' }, input, h('span', { class: 'toggle-track', 'aria-hidden': 'true' }), h('span', { class: 'toggle-text', text: label })), help ? h('p', { class: 'field-help', text: help }) : null)
  }

  // A colour a style starts from: random, or a chosen one.
  function baseField (key, label) {
    const swatch = h('input', { type: 'color', class: 'swatch', 'aria-label': label })
    const hex = h('input', { type: 'text', class: 'input mono hex', spellcheck: 'false', placeholder: 'random', 'aria-label': `${label}, hex value` })
    const dice = h('button', { type: 'button', class: 'icon-btn small', title: 'A random colour every time', 'aria-label': 'A random colour every time', onclick: () => change({ [key]: null }) }, icon('dice', 16))
    swatch.addEventListener('input', () => change({ [key]: swatch.value }, { soon: true }))
    hex.addEventListener('change', () => { const c = parseColors(hex.value)[0]; change({ [key]: c || null }) })
    hex.addEventListener('keydown', e => { if (e.key === 'Enter') hex.blur() })
    const field = h('div', { class: 'field field-wide' }, h('span', { class: 'field-label', text: label }), h('div', { class: 'color-control' }, swatch, hex, dice))
    el.bases.push(() => {
      const style = STYLE[state.style]
      field.hidden = !style || (style.base || 0) < (key === 'base2' ? 2 : 1)
      const now = list()
      const auto = key === 'base2' ? now[now.length - 1] : now[0]
      if (document.activeElement !== swatch) swatch.value = (state[key] || auto || '#888888').toLowerCase()
      if (document.activeElement !== hex) hex.value = state[key] || ''
      swatch.classList.toggle('is-auto', !state[key])
      dice.hidden = !state[key]
    })
    return field
  }

  function build () {
    clear(root)
    Object.assign(el, { sliders: [], selects: [], bases: [] })
    const btn = (iconName, label, title, onclick, cls = '') => h('button', { type: 'button', class: `btn ${cls}`, title, onclick }, icon(iconName, 16), label)
    el.back = h('button', { type: 'button', class: 'icon-btn', title: 'The palette before (←)', 'aria-label': 'The palette before', onclick: () => go(-1) }, icon('arrowLeft', 16))
    el.forward = h('button', { type: 'button', class: 'icon-btn', title: 'The palette after (→)', 'aria-label': 'The palette after', onclick: () => go(1) }, icon('arrowRight', 16))
    el.compare = h('button', { type: 'button', class: 'btn btn-ghost btn-small', title: 'Hold to see the original colours' }, icon('eye', 14), 'Hold to compare')
    const compare = on => { if (comparing === on) return; comparing = on; refresh() }
    el.compare.addEventListener('pointerdown', e => { el.compare.setPointerCapture(e.pointerId); compare(true) })
    ;['pointerup', 'pointercancel', 'blur'].forEach(t => el.compare.addEventListener(t, () => compare(false)))
    el.compare.addEventListener('keydown', e => { if (e.key === 'Enter') compare(true) })
    el.compare.addEventListener('keyup', () => compare(false))

    el.styles = h('div', { class: 'style-groups field-wide' })
    el.own = h('textarea', { class: 'input mono', rows: 3, placeholder: '#3B78B0, #E0A93B, …', 'aria-label': 'Your colours', spellcheck: 'false' })
    el.own.addEventListener('input', () => change({ own: el.own.value }, { soon: true }))
    el.ownField = h('div', { class: 'field field-wide' }, h('span', { class: 'field-label', text: 'Colours, as hex codes' }), el.own, h('p', { class: 'field-help', text: 'Paste them in any form. With fewer colours than needed, lighter and darker versions follow.' }))
    el.pictureField = h('div', { class: 'field field-wide' }, h('button', { type: 'button', class: 'btn btn-small', onclick: pickPicture }, icon('picture', 14), 'Another picture'))
    el.accents = h('input', { type: 'range', min: '1', max: '4', step: '1', 'aria-label': 'Number of accents' })
    el.accents.addEventListener('input', () => change({ accents: Number(el.accents.value) }, { soon: true }))
    el.accentValue = h('span', { class: 'slider-value' })
    el.accentField = h('label', { class: 'slider field-wide' }, h('span', { class: 'field-label', text: 'Accents' }), el.accents, el.accentValue)

    el.reverse = toggle('The other way round', 'reverse')
    el.apart = toggle('Keep colours apart', 'apart', 'Makes many palettes and takes the one that is easiest to tell apart, also for colour-blind readers.')
    el.grouped = toggle('Shades within groups', 'grouped', 'One colour per group, lighter and darker inside it.')
    el.order = select('Who gets which colour', ORDERS, () => state.order, v => change({ order: v }))
    el.shuffle = h('button', { type: 'button', class: 'btn btn-small', onclick: () => change({ order: 'shuffle', seed: state.seed + 1 }) }, icon('shuffle', 14), 'Shuffle')

    el.colors = h('div', { class: 'color-rows field-wide' })
    el.review = h('div', { class: 'palette-review field-wide' })
    el.vision = h('div', { class: 'segmented vision-choice', role: 'group', 'aria-label': 'Show the diagram' }, VISIONS.map(v => h('button', { type: 'button', class: 'seg', dataset: { vision: v.value }, text: v.label, onclick: () => setVision(v.value) })))
    el.kept = h('div', { class: 'kept-list field-wide' })
    el.count = h('p', { class: 'insp-hint' })

    root.append(
      h('div', { class: 'insp-head' },
        h('div', { class: 'insp-kind', text: 'Palette' }),
        h('div', { class: 'insp-title-row' }, h('h2', { class: 'insp-title', text: 'Colours' }), h('div', { class: 'insp-actions' }, h('button', { class: 'icon-btn', type: 'button', title: 'Close without changes (Esc)', 'aria-label': 'Close without changes', onclick: cancel }, icon('close'))))),
      h('div', { class: 'palette-main' },
        h('div', { class: 'palette-buttons' },
          btn('dice', 'New palette', 'Another palette of this style (Space)', generate, 'btn-primary'),
          btn('waves', 'Vary', 'The same, slightly different (V)', vary),
          h('span', { class: 'spacer' }), el.back, el.forward),
        el.count,
        h('div', { class: 'insp-grid' }, baseField('base', 'Colour to start from'), baseField('base2', 'Second colour'), el.accentField, el.ownField, el.pictureField)),
      section('Style', [el.styles]),
      section('Tone', [
        slider({ key: 'hue', label: 'Hue', min: -180, max: 180, step: 1, show: v => `${signed(v)}°` }),
        slider({ key: 'chroma', label: 'Strength', min: 0, max: 2, step: 0.02, show: v => `${Math.round(v * 100)}%` }),
        slider({ key: 'light', label: 'Lightness', min: -0.25, max: 0.25, step: 0.01, show: v => signed(Math.round(v * 100)) }),
        slider({ key: 'contrast', label: 'Contrast', min: 0.2, max: 2, step: 0.02, show: v => `${Math.round(v * 100)}%` }),
        h('button', { type: 'button', class: 'link-btn small field-wide', text: 'Reset the tone', onclick: () => change({ hue: 0, chroma: 1, light: 0, contrast: 1, variation: 0 }) })
      ]),
      section('Colours', [el.colors, el.order, el.shuffle, el.reverse, el.grouped, el.apart]),
      section('More', [
        spec.patterns ? select('Patterns', PATTERNS, () => state.patterns, v => change({ patterns: v })) : null,
        select('Background', BACKGROUNDS, () => state.background, v => change({ background: v }))
      ]),
      section('Check', [el.review, h('div', { class: 'field field-wide' }, h('span', { class: 'field-label', text: 'Show the diagram' }), el.vision)]),
      section('Kept palettes', [el.kept]),
      h('div', { class: 'palette-foot' },
        el.compare, h('span', { class: 'spacer' }),
        h('button', { type: 'button', class: 'btn', text: 'Cancel', onclick: cancel }),
        h('button', { type: 'button', class: 'btn btn-primary', text: 'Apply', title: 'Use these colours (Enter)', onclick: apply }))
    )
  }

  // Samples of every style, with this seed and these options.
  let samplesKey = ''
  let samplesFor = null
  function updateStyles () {
    const n = Math.max(5, Math.min(7, targets.length))
    if (samplesFor !== state.style) { samplesFor = state.style; samplesKey = '' }
    const key = JSON.stringify([state.seed, state.base, state.base2, state.hue, state.chroma, state.light, state.contrast, state.variation, state.own, state.picture, state.reverse, n, state.accents])
    if (key !== samplesKey) {
      samplesKey = key
      const names = targets.slice(0, n).map(t => t.names)
      while (names.length < n) names.push([''])
      clear(el.styles).append(...STYLE_GROUPS.flatMap(g => [
        h('div', { class: 'style-head', text: g }),
        h('div', { class: 'style-grid' }, STYLES.filter(s => s.group === g).map(s => h('button', { type: 'button', class: 'style-card', dataset: { style: s.id }, title: s.text, onclick: () => choose(s.id) },
          s.picture && !state.picture ? h('span', { class: 'swatch-strip empty' }, icon('picture', 16)) : strip(makeColors(n, { ...state, style: s.id, apart: false }, { names: s.fixed ? names : null })),
          h('span', { class: 'style-name', text: s.label }))))
      ]))
    }
    el.styles.querySelectorAll('.style-card').forEach(c => {
      const on = c.dataset.style === state.style
      c.setAttribute('aria-pressed', String(on))
      // The chosen one shows the colours that are in use.
      if (on && !c.querySelector('.empty')) c.querySelector('.swatch-strip').replaceWith(strip(list().slice(0, 8)))
    })
  }

  function updateColors () {
    const same = el.colors.children.length === targets.length && targets.every((t, i) => el.colors.children[i].dataset.uid === t.uid)
    if (!same) {
      clear(el.colors).append(...targets.map(t => {
        const swatch = h('input', { type: 'color', class: 'swatch small', 'aria-label': `Colour of ${t.label}` })
        swatch.addEventListener('input', () => { locked.set(t.uid, toHex(swatch.value)); remember(true); refresh() })
        const lock = h('button', { type: 'button', class: 'icon-btn small lock', onclick: () => { locked.has(t.uid) ? locked.delete(t.uid) : locked.set(t.uid, colors.get(t.uid)); remember(); refresh() } })
        return h('div', { class: 'color-row', dataset: { uid: t.uid } }, swatch, h('span', { class: 'color-name', text: t.label }), h('span', { class: 'color-hex mono' }), lock)
      }))
    }
    targets.forEach((t, i) => {
      const row = el.colors.children[i]
      const c = colors.get(t.uid) || t.color
      const swatch = row.querySelector('.swatch')
      if (document.activeElement !== swatch || swatch.value !== c.toLowerCase()) swatch.value = c.toLowerCase()
      row.querySelector('.color-hex').textContent = c
      const on = locked.has(t.uid)
      const lock = row.querySelector('.lock')
      clear(lock).append(icon(on ? 'lock' : 'unlock', 14))
      lock.title = on ? 'Locked: kept in new palettes' : 'Keep this colour in new palettes'
      lock.setAttribute('aria-label', `${on ? 'Unlock' : 'Lock'} the colour of ${t.label}`)
      lock.setAttribute('aria-pressed', String(on))
      row.classList.toggle('locked', on)
    })
  }

  function updateReview () {
    const cs = list()
    const doc = result(base)
    const background = doc.settings.backgroundColor || getSetting(doc, 'backgroundColor')
    const r = review(cs, background)
    clear(el.review)
    if (r.i < 0) return
    const pair = h('span', { class: 'review-pair' }, h('span', { class: 'dot', style: { background: cs[r.i] } }), h('span', { class: 'dot', style: { background: cs[r.j] } }))
    const who = r.kind ? `for ${VISION[r.kind].label.toLowerCase()} readers` : ''
    const text = r.level === 'good' ? 'All colours are easy to tell apart.' : `${targets[r.i].label} and ${targets[r.j].label} are ${r.level === 'fair' ? 'not far apart' : 'hard to tell apart'}${who ? ` ${who}` : ''}.`
    el.review.append(h('div', { class: `review ${r.level}` }, pair, h('span', { text })))
    if (r.faint) el.review.append(h('div', { class: 'review fair' }, h('span', { text: `${r.faint === 1 ? 'One colour hardly stands' : `${r.faint} colours hardly stand`} out from the background.` })))
  }

  function updateKept () {
    const kept = readKept()
    clear(el.kept).append(
      h('button', { type: 'button', class: 'btn btn-small', onclick: () => { writeKept([{ colors: list(), at: Date.now() }, ...readKept().filter(k => k.colors.join() !== list().join())]); updateKept() } }, icon('bookmark', 14), 'Keep this palette'),
      h('p', { class: 'field-help', text: kept.length ? 'Kept in this browser, for all tools.' : 'Keep palettes in this browser, to use them again in any of the tools.' }),
      ...kept.map(k => h('div', { class: 'kept-row' },
        h('button', { type: 'button', class: 'kept', title: 'Use this palette', onclick: () => change({ style: 'own', own: k.colors.join(' '), variation: 0, hue: 0, chroma: 1, light: 0, contrast: 1, order: 'listed', grouped: false }) }, strip(k.colors)),
        h('button', { type: 'button', class: 'icon-btn small', title: 'Copy its hex codes', 'aria-label': 'Copy its hex codes', onclick: () => copy(k.colors) }, icon('copy', 14)),
        h('button', { type: 'button', class: 'icon-btn small', title: 'Remove', 'aria-label': 'Remove this kept palette', onclick: () => { writeKept(readKept().filter(x => x.at !== k.at)); updateKept() } }, icon('close', 14)))))
  }
  async function copy (cs) {
    try { await navigator.clipboard.writeText(cs.join(', ')); app.toast('Copied the hex codes.') } catch (e) { app.toast(cs.join(', ')) }
  }

  function setVision (v) {
    vision = v
    host.querySelector('.canvas-svg').style.filter = v ? `url(#vision-${v})` : ''
    el.vision.querySelectorAll('.seg').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.vision === v)))
  }

  function update () {
    if (!open) return
    const style = STYLE[state.style] || { text: 'The colours as they are now; choose a style, or press New palette' }
    updateStyles()
    el.sliders.forEach(fn => fn())
    el.selects.forEach(fn => fn())
    el.bases.forEach(fn => fn())
    el.accentField.hidden = !style.accents
    el.accents.value = String(state.accents)
    el.accentValue.textContent = String(state.accents)
    el.ownField.hidden = !style.own
    if (document.activeElement !== el.own) el.own.value = state.own
    el.pictureField.hidden = !style.picture
    el.reverse.hidden = !style.gradient
    el.apart.hidden = !style.distinct
    el.grouped.hidden = !!style.gradient || !!style.exact || !targets.some((t, i) => t.group && targets.some((x, j) => j !== i && x.group === t.group))
    el.order.hidden = !!fixedStyle()
    el.shuffle.hidden = !!fixedStyle()
    el.back.disabled = at <= 0
    el.forward.disabled = at >= history.length - 1
    const free = targets.filter(t => !locked.has(t.uid)).length
    el.count.textContent = `${style.text}. For ${targets.length} ${spec.nounFor ? spec.nounFor(base) : spec.noun}${free < targets.length ? `, ${targets.length - free} locked` : ''}.`
    updateColors()
    updateReview()
    el.vision.querySelectorAll('.seg').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.vision === vision)))
  }

  // ---- open and close ----

  function show () {
    if (open || !app.hasDocument()) return
    base = app.store.doc
    targets = spec.targets(base)
    if (!targets.length) { app.toast(`There are no ${spec.noun} to colour yet.`); return }
    open = true
    app.setSelection({})
    state = { ...DEFAULTS, grouped: spec.grouped !== false, seed: newSeed(), style: 'original' }
    locked = new Map()
    history = []
    at = -1
    samplesKey = ''
    document.body.classList.add('palette-open')
    build()
    updateKept()
    // Starts with the colours as they are: the first click changes them.
    remember()
    refresh()
    requestAnimationFrame(() => requestAnimationFrame(() => { window.dispatchEvent(new Event('resize')); canvas.fit() }))
    root.querySelector('.btn-primary').focus({ preventScroll: true })
  }

  function close () {
    if (!open) return
    open = false
    comparing = false
    clearTimeout(pushTimer)
    setVision('')
    setPreview(null)
    document.body.classList.remove('palette-open')
    requestAnimationFrame(() => requestAnimationFrame(() => { window.dispatchEvent(new Event('resize')); canvas.fit() }))
  }
  function cancel () { close() }
  function apply () {
    const make = result
    const changed = state.style !== 'original' || toned() || locked.size || state.background !== 'keep' || state.patterns !== 'keep'
    close()
    if (!changed) return
    if (app.edit('Change colours', d => make(d))) app.setStatus('New colours applied')
  }

  window.addEventListener('keydown', e => {
    if (!open) return
    const typing = isTyping() && !['checkbox', 'range', 'color'].includes(document.activeElement.type)
    const key = e.key.toLowerCase()
    const mod = e.metaKey || e.ctrlKey
    const done = () => { e.preventDefault(); e.stopImmediatePropagation() }
    if (e.key === 'Escape') { done(); cancel(); return }
    if (typing) { e.stopImmediatePropagation(); return }
    if (mod && key === 'z') { done(); go(e.shiftKey ? 1 : -1); return }
    if (mod) { if (['s', 'o', 'e', 'a', 'y'].includes(key)) done(); return }
    if (e.code === 'Space') { done(); if (!e.repeat) generate(); return }
    if (key === 'v') { done(); vary(); return }
    if (document.activeElement && document.activeElement.type === 'range') { e.stopImmediatePropagation(); return }
    if (e.key === 'ArrowLeft') { done(); go(-1); return }
    if (e.key === 'ArrowRight') { done(); go(1); return }
    if (e.key === 'Enter' && !(document.activeElement && document.activeElement.closest('#palette button, #palette summary'))) { done(); apply(); return }
    if (['Delete', 'Backspace', '/', 'PageUp', 'PageDown', 'ArrowUp', 'ArrowDown'].includes(e.key)) e.stopImmediatePropagation()
  }, true)

  return { open: show, close, toggle: () => (open ? cancel() : show()), get isOpen () { return open }, get state () { return state }, get colors () { return colors }, generate, vary, change, go, apply, cancel, lock: (uid, hex) => { locked.set(uid, hex); remember(); refresh() } }
}
