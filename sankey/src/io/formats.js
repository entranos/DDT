// One entry point for every supported file format.

import { normalizeDocument } from '../model/schema.js'
import { readXlsx, writeXlsx } from './xlsx.js'
import { readJson, readYaml, writeJson, writeYaml } from './text.js'
import { FORMATS, ACCEPT, extensionOf, detectFormat } from '../../../shared/src/formats.js'

export { FORMATS, ACCEPT, extensionOf, detectFormat }

// bytes: Uint8Array. Returns { doc, notes, format, workbook, sheetNames }.
export function readDocument (name, bytes) {
  const format = detectFormat(name, bytes)
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
