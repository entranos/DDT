// Text boxes: free texts on a diagram that can be placed and sized anywhere, the same in
// every editor. They live in their own table, "texts", are drawn on top of the diagram, and
// are saved with the file (a "texts" sheet, or a "texts" list in JSON and YAML).
//
//   { text, x, y, width, height, size, weight, color, align, background, border, visible }
//   x, y, width, height in the diagram's units, like the title's position. A height smaller
//   than the text needs is drawn as high as it needs; left empty, the box fits the text.
//   size, color empty: those of the diagram's texts.

import { lib } from './lib.js'
import { newUid, parseBoolean, toNumber, isFiniteNumber } from './values.js'
import { textWidth, fontStack, round1 } from './svgText.js'
import { inkOn } from './color.js'

export const TEXT_COLUMNS = ['text', 'x', 'y', 'width', 'height', 'size', 'weight', 'color', 'align', 'background', 'border', 'visible']
const NUMBERS = ['x', 'y', 'width', 'height', 'size']
export const WEIGHTS = [{ value: 'light', label: 'Light', weight: 300 }, { value: 'regular', label: 'Regular', weight: 400 }, { value: 'medium', label: 'Medium', weight: 500 }, { value: 'bold', label: 'Bold', weight: 700 }]
export const ALIGNS = [{ value: 'left', label: 'Left' }, { value: 'center', label: 'Centre' }, { value: 'right', label: 'Right' }]
export const DEFAULT_WIDTH = 220

const text = v => (v === undefined || v === null ? '' : String(v))
const hex = v => { const s = text(v).trim(); return /^#[0-9a-f]{6}$/i.test(s) ? s : /^#[0-9a-f]{3}$/i.test(s) ? '#' + s.slice(1).split('').map(c => c + c).join('') : null }
const number = v => (isFiniteNumber(v) ? v : null)
export const isShown = row => (row.visible === undefined || row.visible === null || row.visible === '' ? true : parseBoolean(row.visible))
export const weightOf = v => { const w = String(v ?? '').trim().toLowerCase(); const n = Number(w); return (WEIGHTS.find(x => x.value === w || x.weight === n) || WEIGHTS[1]).weight }
export const alignOf = v => { const a = String(v ?? '').trim().toLowerCase(); return a === 'centre' || a === 'middle' ? 'center' : ['left', 'center', 'right'].includes(a) ? a : 'left' }

function cleanRow (row) {
  const out = { ...row }
  if (out.text === undefined && out.tekst !== undefined) { out.text = out.tekst; delete out.tekst }
  out.text = text(out.text)
  NUMBERS.forEach(k => { if (k in out && text(out[k]).trim() !== '') out[k] = toNumber(out[k]) })
  return out
}

function columnOrder (rows, header = []) {
  const cols = []
  const add = c => { if (!String(c).startsWith('_') && !cols.includes(c)) cols.push(c) }
  header.forEach(add)
  rows.forEach(r => Object.keys(r).forEach(add))
  const front = TEXT_COLUMNS.filter(c => cols.includes(c))
  return [...front, ...cols.filter(c => !front.includes(c))]
}

// The text boxes of a document, read from file rows.
export function attachTexts (doc, rows = [], header = []) {
  const texts = (rows || []).filter(r => r && typeof r === 'object').map(r => ({ ...cleanRow(r), _uid: newUid('t') }))
  return { ...doc, texts, meta: { ...doc.meta, textColumns: columnOrder(texts, header.map(c => (String(c).trim().toLowerCase() === 'tekst' ? 'text' : c))) } }
}

// Every document has a list of text boxes, also ones from before there were any.
export const ensureTexts = doc => (Array.isArray(doc.texts) && doc.meta && Array.isArray(doc.meta.textColumns) && doc.texts.every(t => t._uid) ? doc : attachTexts(doc, doc.texts || []))

// ---- edits ----

export function addText (doc, row = {}) {
  const t = { ...cleanRow(row), _uid: row._uid || newUid('t') }
  return { ...doc, texts: [...doc.texts, t] }
}

export function updateText (doc, uid, patch) {
  const i = doc.texts.findIndex(t => t._uid === uid)
  if (i < 0) return doc
  const clean = cleanRow(patch)
  if (!('text' in patch)) delete clean.text
  if ('visible' in clean && typeof clean.visible !== 'boolean' && clean.visible !== '') clean.visible = parseBoolean(clean.visible)
  NUMBERS.forEach(k => { if (isFiniteNumber(clean[k])) clean[k] = Math.round(clean[k] * 100) / 100 })
  const row = doc.texts[i]
  if (Object.entries(clean).every(([k, v]) => row[k] === v)) return doc
  return { ...doc, texts: doc.texts.map((t, j) => (j === i ? { ...t, ...clean } : t)) }
}

export function deleteTexts (doc, uids) {
  const texts = doc.texts.filter(t => !uids.includes(t._uid))
  return texts.length === doc.texts.length ? doc : { ...doc, texts }
}

// To the front (drawn last) or to the back.
export function orderTexts (doc, uids, where) {
  const moving = doc.texts.filter(t => uids.includes(t._uid))
  const rest = doc.texts.filter(t => !uids.includes(t._uid))
  const texts = where === 'front' ? [...rest, ...moving] : [...moving, ...rest]
  return texts.every((t, i) => t === doc.texts[i]) ? doc : { ...doc, texts }
}

// Copies, a little below and to the right. Returns { doc, uids }.
export function duplicateTexts (doc, uids) {
  const copies = doc.texts.filter(t => uids.includes(t._uid)).map(t => ({ ...t, _uid: newUid('t'), x: (number(t.x) ?? 0) + 16, y: (number(t.y) ?? 0) + 16 }))
  return { doc: { ...doc, texts: [...doc.texts, ...copies] }, uids: copies.map(t => t._uid) }
}

export function textRowEdits (doc, edits = [], newRows = []) {
  let next = edits.reduce((d, { uid, patch }) => updateText(d, uid, patch), doc)
  newRows.forEach(row => { next = addText(next, { x: 60, y: 60, width: DEFAULT_WIDTH, ...row }) })
  return next
}

export function deleteTextColumn (doc, key) {
  return { ...doc, texts: doc.texts.map(t => { if (!(key in t)) return t; const { [key]: gone, ...rest } = t; return rest }), meta: { ...doc.meta, textColumns: doc.meta.textColumns.filter(c => c !== key) } }
}

export function textIssues (doc) {
  const out = []
  ;(doc.texts || []).forEach((t, i) => {
    const bad = ['color', 'background', 'border'].filter(k => text(t[k]).trim() !== '' && !hex(t[k]))
    if (bad.length) out.push({ key: `text-color-${t._uid}`, severity: 'warning', message: `Text box ${i + 1}: ${bad.map(k => `${k} "${t[k]}"`).join(', ')} is not a hex code.`, targets: [{ kind: 'text', uid: t._uid }] })
  })
  return out
}

// ---- files ----

const forFile = (doc, format) => {
  const cols = columnOrder(doc.texts, doc.meta.textColumns)
  return doc.texts.map(t => {
    const out = {}
    cols.forEach(c => { if (t[c] !== undefined) out[c] = t[c] })
    if ('visible' in out && out.visible !== '') out.visible = format === 'xlsx' ? (parseBoolean(out.visible) ? 'Yes' : 'No') : parseBoolean(out.visible)
    return out
  })
}

const findSheet = names => names.find(n => n.trim().toLowerCase() === 'texts')

// { rows, header } of a file's text boxes, or null.
export function readTextsFrom (format, bytes) {
  const XLSX = lib.XLSX
  if (format === 'xlsx') {
    const name = findSheet(XLSX.read(bytes, { type: 'array', bookSheets: true }).SheetNames)
    if (!name) return null
    const ws = XLSX.read(bytes, { type: 'array', sheets: [name] }).Sheets[name]
    const header = (XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false })[0] || []).filter(c => c !== undefined && c !== null && c !== '').map(String)
    return { rows: XLSX.utils.sheet_to_json(ws), header }
  }
  const str = new TextDecoder().decode(bytes)
  const data = format === 'json' ? JSON.parse(str) : lib.yaml.load(str)
  return data && typeof data === 'object' && !Array.isArray(data) && Array.isArray(data.texts) ? { rows: data.texts, header: [] } : null
}

// The file an editor wrote, with the text boxes in it. data: ArrayBuffer (xlsx) or text.
export function addTextsTo (format, data, doc) {
  const rows = forFile(doc, format)
  if (format === 'xlsx') {
    const XLSX = lib.XLSX
    const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : data
    const had = findSheet(XLSX.read(bytes, { type: 'array', bookSheets: true }).SheetNames)
    if (!rows.length && !had) return data
    // A sheet from the file that was opened is replaced by the current text boxes.
    const wb = XLSX.read(bytes, { type: 'array', cellStyles: true })
    const name = findSheet(wb.SheetNames)
    if (name) { delete wb.Sheets[name]; wb.SheetNames = wb.SheetNames.filter(n => n !== name) }
    if (rows.length) {
      const header = columnOrder(doc.texts, doc.meta.textColumns)
      const ws = XLSX.utils.json_to_sheet(rows, { header })
      ws['!cols'] = header.map(c => ({ wch: c === 'text' ? 48 : 11 }))
      XLSX.utils.book_append_sheet(wb, ws, name || 'texts')
    }
    return XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
  }
  if (!rows.length) return data
  if (format === 'json') return JSON.stringify({ ...JSON.parse(data), texts: rows }, null, 2) + '\n'
  return lib.yaml.dump({ ...lib.yaml.load(data), texts: rows }, { indent: 2, lineWidth: -1, noRefs: true })
}

// ---- layout and drawing ----

// What texts look like when a box doesn't say: the diagram's own settings.
export function textDefaults (get) {
  const pick = (...keys) => { for (const k of keys) { const v = get(k); if (v !== undefined && v !== null && v !== '') return v } return null }
  return { size: Number(pick('fontSize', 'labelFontSize')) || 14, color: pick('textColor', 'labelTextColor', 'titleColor') || '#2B2B2B', font: fontStack(get('font')) }
}

// Lines of a text at a width: its own line breaks, then words; a word too long breaks too.
export function wrapText (str, width, px, weight, font, measure = textWidth) {
  const fits = s => measure(s, px, weight, font) <= width
  const lines = []
  String(str).split(/\r?\n/).forEach(paragraph => {
    let line = ''
    paragraph.split(/\s+/).filter(Boolean).forEach(word => {
      const next = line ? `${line} ${word}` : word
      if (fits(next)) { line = next; return }
      if (line) lines.push(line)
      let rest = word
      while (!fits(rest)) {
        let k = rest.length - 1
        while (k > 1 && !fits(rest.slice(0, k))) k--
        lines.push(rest.slice(0, k))
        rest = rest.slice(k)
      }
      line = rest
    })
    lines.push(line)
  })
  return lines
}

export function layoutText (row, { size, color, font, measure = textWidth }) {
  const px = number(row.size) > 0 ? row.size : size
  const weight = weightOf(row.weight)
  const pad = round1(px * 0.5)
  const width = Math.max(px * 2 + 2 * pad, number(row.width) > 0 ? row.width : DEFAULT_WIDTH)
  const lines = wrapText(row.text, width - 2 * pad, px, weight, font, measure)
  const lineH = round1(px * 1.3)
  const needed = lines.length * lineH + 2 * pad
  const background = hex(row.background)
  return {
    x: number(row.x) ?? 0,
    y: number(row.y) ?? 0,
    width,
    height: Math.max(needed, number(row.height) > 0 ? row.height : 0),
    needed,
    px,
    weight,
    pad,
    lineH,
    lines,
    align: alignOf(row.align),
    color: hex(row.color) || (background ? inkOn(background, { text: true }) : color),
    background,
    border: hex(row.border),
    font
  }
}

// Draws the text boxes into an SVG group. editor: also hidden and empty ones, faintly.
// editing: the box whose text is being typed, drawn without it.
// Returns { boxes: [{ uid, box, layout }], weights } (box in diagram units).
export function drawTextBoxes (parent, doc, get, { editor = false, editing = null } = {}) {
  const root = lib.d3.select(parent)
  root.selectAll('*').remove()
  const ctx = textDefaults(get)
  const out = { boxes: [], weights: [] }
  ;(doc.texts || []).forEach(row => {
    const shown = isShown(row)
    const empty = !row.text.trim()
    if (!editor && (!shown || empty)) return
    const l = layoutText(row, ctx)
    const g = root.append('g').attr('class', 'text-box').attr('data-uid', row._uid)
    if (!shown) g.attr('opacity', 0.3)
    if (l.background || l.border) {
      g.append('rect').attr('x', round1(l.x)).attr('y', round1(l.y)).attr('width', round1(l.width)).attr('height', round1(l.height)).attr('rx', 4)
        .attr('fill', l.background || 'none').attr('stroke', l.border || null).attr('stroke-width', l.border ? 1 : null)
    } else if (editor && empty && editing !== row._uid) {
      g.append('rect').attr('x', round1(l.x)).attr('y', round1(l.y)).attr('width', round1(l.width)).attr('height', round1(l.height)).attr('fill', 'none').attr('stroke', '#9a948a').attr('stroke-dasharray', '4 3')
    }
    if (editing !== row._uid) {
      const lines = empty && editor ? ['Text'] : l.lines
      const tx = l.align === 'left' ? l.x + l.pad : l.align === 'right' ? l.x + l.width - l.pad : l.x + l.width / 2
      lines.forEach((line, i) => {
        g.append('text').attr('x', round1(tx)).attr('y', round1(l.y + l.pad + l.lineH * (i + 0.5) + l.px * 0.35))
          .attr('font-family', l.font).attr('font-size', round1(l.px)).attr('font-weight', l.weight)
          .attr('text-anchor', { left: 'start', center: 'middle', right: 'end' }[l.align])
          .attr('fill', empty ? '#9a948a' : l.color).text(line)
      })
    }
    if (!out.weights.includes(l.weight)) out.weights.push(l.weight)
    out.boxes.push({ uid: row._uid, box: { x0: l.x, y0: l.y, x1: l.x + l.width, y1: l.y + l.height }, layout: l })
  })
  return out
}
