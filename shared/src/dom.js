// Tiny DOM helpers: h() builds elements, icon() returns an inline SVG icon.

export function h (tag, props = {}, ...children) {
  const el = document.createElement(tag)
  let value
  Object.entries(props || {}).forEach(([k, v]) => {
    if (v === undefined || v === null || v === false) return
    if (k === 'class') el.className = v
    else if (k === 'text') el.textContent = v
    else if (k === 'value') value = v
    else if (k === 'dataset') Object.assign(el.dataset, v)
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v)
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v)
    else if (typeof v === 'boolean' || typeof v === 'number') { if (k in el) el[k] = v; else el.setAttribute(k, String(v)) }
    else el.setAttribute(k, v)
  })
  children.flat(Infinity).forEach(c => {
    if (c === null || c === undefined || c === false) return
    el.append(c instanceof Node ? c : document.createTextNode(String(c)))
  })
  if (value !== undefined) el.value = value
  return el
}

const PATHS = {
  open: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  save: 'M5 3h11l3 3v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM7 3v5h8V3M7 21v-7h10v7',
  export: 'M12 3v12M7 8l5-5 5 5M5 15v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4',
  undo: 'M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11',
  redo: 'M15 14l5-5-5-5M20 9H9.5a5.5 5.5 0 0 0 0 11H13',
  zoomIn: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-4.35-4.35M11 8v6M8 11h6',
  zoomOut: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-4.35-4.35M8 11h6',
  fit: 'M4 9V5a1 1 0 0 1 1-1h4M15 4h4a1 1 0 0 1 1 1v4M20 15v4a1 1 0 0 1-1 1h-4M9 20H5a1 1 0 0 1-1-1v-4',
  help: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 16v-4M12 8h.01',
  plus: 'M12 5v14M5 12h14',
  trash: 'M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6',
  close: 'M18 6 6 18M6 6l12 12',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-4.35-4.35',
  chevron: 'M9 6l6 6-6 6',
  chevronDown: 'M6 9l6 6 6-6',
  alert: 'M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01',
  error: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM15 9l-6 6M9 9l6 6',
  check: 'M20 6 9 17l-5-5',
  target: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  alignLeft: 'M4 3v18M8 7h10v4H8zM8 14h6v4H8z',
  alignRight: 'M20 3v18M6 7h10v4H6zM10 14h6v4h-6z',
  alignTop: 'M3 4h18M7 8h4v10H7zM14 8h4v6h-4z',
  alignBottom: 'M3 20h18M7 6h4v10H7zM14 10h4v6h-4z',
  distH: 'M4 4v16M20 4v16M10 8h4v8h-4z',
  distV: 'M4 4h16M4 20h16M8 10h8v4H8z',
  flows: 'M3 7h6c4 0 6 10 12 10M3 17h6c4 0 6-10 12-10',
  node: 'M10 4h4v16h-4z',
  copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
  download: 'M12 3v12M7 10l5 5 5-5M5 21h14',
  file: 'M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9zM14 3v6h6',
  sparkle: 'M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6',
  panel: 'M3 4h18v16H3zM9 4v16',
  panelRight: 'M3 4h18v16H3zM15 4v16',
  drawer: 'M3 4h18v16H3zM3 15h18',
  details: 'M4 6h16M4 12h10M4 18h7',
  eye: 'M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  eyeOff: 'M9.9 5.7A10.4 10.4 0 0 1 12 5.5C18.4 5.5 22 12 22 12a18 18 0 0 1-2.6 3.4M6.5 7.3C3.6 9.1 2 12 2 12s3.6 6.5 10 6.5c1.9 0 3.5-.5 4.9-1.2M9.9 9.9a3 3 0 0 0 4.2 4.2M3 3l18 18',
  triangle: 'M3 5h18l-9 15.5z',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  pencil: 'M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4',
  columnAdd: 'M4 4h7v16H4zM18 9v6M15 12h6',
  text: 'M5 7V5h14v2M12 5v14M9 19h6',
  sliders: 'M4 6h9M17 6h3M15 4v4M4 12h3M11 12h9M9 10v4M4 18h11M19 18h1M17 16v4',
  palette: 'M12 3a9 9 0 1 0 0 18c1.2 0 1.8-.8 1.8-1.7 0-1.2-1-1.5-1-2.6 0-.9.7-1.7 1.8-1.7H17a4 4 0 0 0 4-4c0-4.6-4-8-9-8zM7.5 11.500h.01M10 7.500h.01M14.500 7.500h.01M17 11h.01',
  dice: 'M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zM8.500 8.500h.01M15.500 8.500h.01M12 12h.01M8.500 15.500h.01M15.500 15.500h.01',
  lock: 'M6 11h12v9H6zM8.500 11V8a3.500 3.500 0 0 1 7 0v3',
  unlock: 'M6 11h12v9H6zM8.500 11V7a3.500 3.500 0 0 1 6.800-1.200',
  arrowLeft: 'M19 12H5M11 6l-6 6 6 6',
  arrowRight: 'M5 12h14M13 6l6 6-6 6',
  bookmark: 'M7 4h10v16l-5-4-5 4z',
  waves: 'M3 8c3-4 5 4 9 0s6 4 9 0M3 16c3-4 5 4 9 0s6 4 9 0',
  shuffle: 'M3 7h4l10 10h4M18 14l3 3-3 3M3 17h4l2.500-2.500M14.500 9.500 17 7h4M18 4l3 3-3 3',
  picture: 'M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4M15 9h.01'
}

export function icon (name, size = 16) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('width', size)
  svg.setAttribute('height', size)
  svg.setAttribute('fill', 'none')
  svg.setAttribute('stroke', 'currentColor')
  svg.setAttribute('stroke-width', '1.8')
  svg.setAttribute('stroke-linecap', 'round')
  svg.setAttribute('stroke-linejoin', 'round')
  svg.setAttribute('aria-hidden', 'true')
  svg.classList.add('icon')
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  path.setAttribute('d', PATHS[name] || '')
  svg.appendChild(path)
  return svg
}

export function clear (el) {
  while (el.firstChild) el.removeChild(el.firstChild)
  return el
}

// What a shortcut means in a text box that was opened to edit one thing: 'commit' for Save,
// Open and Export (the text counts first), 'leave' for undo and redo when nothing was typed
// yet (they are then about the document, not the text), or null.
export function shortcutIn (e, unchanged) {
  if (!(e.metaKey || e.ctrlKey) || e.altKey) return null
  const key = e.key.toLowerCase()
  if (['s', 'o', 'e'].includes(key)) return 'commit'
  return ['z', 'y'].includes(key) && unchanged ? 'leave' : null
}

export const isTyping = () => {
  const el = document.activeElement
  return !!el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))
}
