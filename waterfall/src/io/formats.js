// One entry point for every file format the waterfall editor reads and writes.

import { normalizeDocument } from '../model/schema.js'
import { readXlsx, writeXlsx } from './xlsx.js'
import { readJson, readYaml, writeJson, writeYaml } from './text.js'
import { isTotalsWorkbook, selectionsIn, documentFromTotals } from './fromTotals.js'
import { FORMATS, ACCEPT, extensionOf, detectFormat } from '../../../shared/src/formats.js'
import { lib } from '../../../shared/src/lib.js'

export { FORMATS, ACCEPT, extensionOf, detectFormat }

// bytes: Uint8Array. Returns { doc, notes, format, workbook, sheetNames }, or
// { choose: { title, text, options, make(value) → result } } for a workbook that holds
// many diagrams.
export function readDocument (name, bytes) {
  const format = detectFormat(name, bytes)
  if (format === 'xlsx' && isTotalsWorkbook(lib.XLSX.read(bytes, { type: 'array', bookSheets: true }).SheetNames)) {
    const workbook = lib.XLSX.read(bytes, { type: 'array' })
    return {
      choose: {
        title: 'Choose what to open',
        text: 'This workbook holds the totals of many selections. One of them becomes a new waterfall diagram; the workbook itself stays as it is.',
        options: selectionsIn(workbook),
        make: value => ({ doc: documentFromTotals(workbook, value), notes: [], format: 'xlsx', asNew: true })
      }
    }
  }
  let result
  if (format === 'xlsx') result = readXlsx(bytes)
  else {
    const text = new TextDecoder().decode(bytes)
    result = format === 'json' ? readJson(text) : readYaml(text)
  }
  const { doc, notes } = normalizeDocument(result.raw)
  return { doc, notes, format, workbook: result.workbook || null, sheetNames: result.sheetNames || {} }
}

// Returns { data: ArrayBuffer|string, mime }.
export function writeDocument (doc, format, context = {}) {
  if (format === 'xlsx') return { data: writeXlsx(doc, context), mime: FORMATS.xlsx.mime }
  if (format === 'json') return { data: writeJson(doc), mime: FORMATS.json.mime }
  return { data: writeYaml(doc), mime: FORMATS.yaml.mime }
}
