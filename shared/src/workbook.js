// Reading and writing Excel workbooks in which an editor manages some sheets. Every
// other sheet of an opened workbook is written back untouched, in its original position.

import { lib } from './lib.js'
import { sheetIndex } from './formats.js'

// managed: sheet names the editor uses, lower case. Sheets are found whatever their case.
export function openWorkbook (bytes, managed) {
  const XLSX = lib.XLSX
  const workbook = XLSX.read(bytes, { type: 'array' })
  const index = sheetIndex(workbook)
  const sheetNames = {}
  managed.forEach(k => { if (index[k]) sheetNames[k] = index[k] })
  const sheet = key => (sheetNames[key] ? workbook.Sheets[sheetNames[key]] : null)
  return {
    workbook,
    sheetNames,
    has: key => !!index[key],
    rows: key => (sheet(key) ? XLSX.utils.sheet_to_json(sheet(key)) : []),
    header (key) {
      if (!sheet(key)) return []
      const first = XLSX.utils.sheet_to_json(sheet(key), { header: 1, blankrows: false })[0] || []
      return first.filter(c => c !== undefined && c !== null && c !== '').map(String)
    },
    props: workbook.Custprops || {}
  }
}

export function makeSheet (rows, header) {
  const XLSX = lib.XLSX
  const ws = rows.length ? XLSX.utils.json_to_sheet(rows, { header }) : XLSX.utils.aoa_to_sheet([header || []])
  const cols = header && header.length ? header : Object.keys(rows[0] || {})
  ws['!cols'] = cols.map(c => {
    const longest = rows.reduce((m, r) => Math.max(m, String(r[c] ?? '').length), String(c).length)
    return { wch: Math.min(48, Math.max(8, longest + 2)) }
  })
  return ws
}

// data: { <managed sheet>: rows }, columns: { <managed sheet>: header }.
// workbook, sheetNames: what the document was opened from, if any. Returns an ArrayBuffer.
export function writeWorkbook ({ managed, data, columns, props, workbook = null, sheetNames = {} }) {
  const XLSX = lib.XLSX
  const own = Object.fromEntries(managed.map(k => [k, makeSheet(data[k], columns[k])]))
  const wb = XLSX.utils.book_new()
  const written = new Set()
  const keyOf = Object.fromEntries(Object.entries(sheetNames).map(([k, v]) => [v, k]))
  if (workbook) {
    workbook.SheetNames.forEach(sheetName => {
      const key = keyOf[sheetName]
      if (key) { XLSX.utils.book_append_sheet(wb, own[key], sheetName); written.add(key) } else if (!managed.includes(sheetName.trim().toLowerCase())) XLSX.utils.book_append_sheet(wb, workbook.Sheets[sheetName], sheetName)
    })
    if (workbook.Props) wb.Props = { ...workbook.Props }
  }
  managed.forEach(key => { if (!written.has(key)) XLSX.utils.book_append_sheet(wb, own[key], key) })
  wb.Custprops = { ...(workbook && workbook.Custprops), ...props }
  return XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
}

// Which editor a file belongs to, from its tables. has(name): whether it has that table.
export function editorFor (has) {
  if (has('points')) return 'ternary'
  if (has('bars')) return 'bar chart'
  if (has('flows') && !has('links')) return 'chord'
  if (has('moments') && has('values')) return 'waterfall'
  if (has('values') && has('carriers')) return 'treemap'
  if (has('links') || has('nodes')) return 'sankey'
  return has('values') ? 'treemap' : null
}

const TABLES = { ternary: 'points', 'bar chart': 'bars', chord: 'flows', waterfall: 'moments', treemap: 'values', sankey: 'links' }
export function wrongEditorMessage (has, own) {
  const other = editorFor(has)
  return other && other !== own ? `This is a ${/ /.test(other) ? other : `${other} diagram`} file (it has a "${TABLES[other]}" table). Open it in the ${other} editor.` : null
}
