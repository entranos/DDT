// Reading and writing Excel workbooks.
//
// The editor manages five sheets (links, nodes, carriers, settings, remarks).
// Every other sheet in an opened workbook is written back untouched, in its
// original position.

import { lib } from '../../../shared/src/lib.js'
import { sheetIndex } from '../../../shared/src/formats.js'
import { wrongEditorMessage } from '../../../shared/src/workbook.js'
import { documentToFileData, SCHEMA_VERSION } from '../model/schema.js'

const MANAGED = ['links', 'nodes', 'carriers', 'settings', 'remarks']

function findSheets (workbook) {
  const found = {}
  workbook.SheetNames.forEach(name => {
    const lower = name.trim().toLowerCase()
    if (MANAGED.includes(lower) && !found[lower]) found[lower] = name
  })
  // Older files prefix sheets per dataset: snky_<dataset>_<sheet>. Use the first dataset.
  if (!found.links && !found.nodes) {
    let dataset = null
    workbook.SheetNames.forEach(name => {
      const m = /^snky_([^_]*)_(links|nodes|remarks|carriers|settings)$/i.exec(name)
      if (!m) return
      if (dataset === null) dataset = m[1]
      if (m[1] === dataset && !found[m[2].toLowerCase()]) found[m[2].toLowerCase()] = name
    })
  }
  return found
}

export function readXlsx (data) {
  const XLSX = lib.XLSX
  const workbook = XLSX.read(data, { type: 'array' })
  const sheets = findSheets(workbook)
  if (!sheets.links) {
    const index = sheetIndex(workbook)
    const other = wrongEditorMessage(k => !!index[k], 'sankey')
    if (other) throw new Error(other)
  }
  if (!sheets.links && !sheets.nodes) {
    throw new Error('This workbook has no "links" or "nodes" sheet. Download the template from the start screen to see the expected layout.')
  }
  const rows = key => (sheets[key] ? XLSX.utils.sheet_to_json(workbook.Sheets[sheets[key]]) : [])
  const header = key => {
    if (!sheets[key]) return []
    const first = XLSX.utils.sheet_to_json(workbook.Sheets[sheets[key]], { header: 1, blankrows: false })[0] || []
    return first.filter(c => c !== undefined && c !== null && c !== '').map(String)
  }
  // Hidden document property with the format version (older builds wrote FluxSchemaVersion).
  const props = workbook.Custprops || {}
  const version = props.SankeyEditorSchemaVersion || props.FluxSchemaVersion
  return {
    raw: {
      nodes: rows('nodes'),
      links: rows('links'),
      carriers: rows('carriers'),
      settings: rows('settings'),
      remarks: rows('remarks'),
      version: version || 1,
      columns: { nodes: header('nodes'), links: header('links'), carriers: header('carriers') }
    },
    workbook,
    sheetNames: sheets
  }
}

function makeSheet (rows, header) {
  const XLSX = lib.XLSX
  const ws = rows.length
    ? XLSX.utils.json_to_sheet(rows, { header })
    : XLSX.utils.aoa_to_sheet([header || []])
  const cols = header && header.length ? header : Object.keys(rows[0] || {})
  ws['!cols'] = cols.map(c => {
    const longest = rows.reduce((m, r) => Math.max(m, String(r[c] ?? '').length), String(c).length)
    return { wch: Math.min(48, Math.max(8, longest + 2)) }
  })
  return ws
}

// Returns an ArrayBuffer. `workbook` is the workbook the document was opened from, if any.
export function writeXlsx (doc, { workbook = null, sheetNames = {} } = {}) {
  const XLSX = lib.XLSX
  const data = documentToFileData(doc, 'xlsx')
  const managed = {
    links: makeSheet(data.links, data.columns.links),
    nodes: makeSheet(data.nodes, data.columns.nodes),
    carriers: makeSheet(data.carriers, data.columns.carriers),
    settings: makeSheet(data.settings, data.columns.settings),
    remarks: Array.isArray(data.remarks) && data.remarks.length ? makeSheet(data.remarks) : null
  }
  const wb = XLSX.utils.book_new()
  const written = new Set()
  const nameToKey = Object.fromEntries(Object.entries(sheetNames).map(([k, v]) => [v, k]))
  if (workbook) {
    workbook.SheetNames.forEach(name => {
      const key = nameToKey[name]
      if (key) {
        const legacy = /^snky_/i.test(name)
        const sheet = managed[key] || workbook.Sheets[name]
        XLSX.utils.book_append_sheet(wb, sheet, legacy ? key : name)
        written.add(key)
      } else if (!MANAGED.includes(name.trim().toLowerCase())) {
        XLSX.utils.book_append_sheet(wb, workbook.Sheets[name], name)
      }
    })
    if (workbook.Props) wb.Props = { ...workbook.Props }
  }
  MANAGED.forEach(key => {
    if (!written.has(key) && managed[key]) XLSX.utils.book_append_sheet(wb, managed[key], key)
  })
  const custprops = { ...(workbook && workbook.Custprops) }
  delete custprops.FluxSchemaVersion
  wb.Custprops = { ...custprops, SankeyEditorSchemaVersion: String(SCHEMA_VERSION) }
  return XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
}
