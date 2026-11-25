// One entry point for every file format the treemap editor reads and writes.
// A sankey diagram file opens as a new treemap.

import { normalizeDocument } from '../model/schema.js'
import { readXlsx, writeXlsx } from './xlsx.js'
import { readJson, readYaml, writeJson, writeYaml } from './text.js'
import { treemapFromSankey } from './fromSankey.js'
import { readDocument as readSankey } from '../../../sankey/src/io/formats.js'
import { FORMATS, ACCEPT, extensionOf, detectFormat, sheetIndex } from '../../../shared/src/formats.js'
import { editorFor } from '../../../shared/src/workbook.js'
import { lib } from '../../../shared/src/lib.js'

export { FORMATS, ACCEPT, extensionOf, detectFormat }

function tablesIn (format, bytes) {
  if (format === 'xlsx') {
    const index = sheetIndex(lib.XLSX.read(bytes, { type: 'array', bookSheets: true }))
    return k => !!index[k]
  }
  const text = new TextDecoder().decode(bytes)
  const data = format === 'json' ? JSON.parse(text) : lib.yaml.load(text)
  return k => !!(data && data[k])
}

// bytes: Uint8Array. Returns { doc, notes, format, workbook, sheetNames }, or with asNew
// and message when the document was made from another kind of file.
export function readDocument (name, bytes) {
  const format = detectFormat(name, bytes)
  if (editorFor(tablesIn(format, bytes)) === 'sankey') {
    const { doc, hidden, shown } = treemapFromSankey(readSankey(name, bytes).doc)
    if (!doc.values.length) throw new Error('This sankey diagram has no flows to make a treemap from.')
    const message = `Made a treemap from this sankey diagram: ${shown} block${shown === 1 ? '' : 's'} for the nodes where flows end.${hidden ? ` ${hidden} node${hidden === 1 ? '' : 's'} in between ${hidden === 1 ? 'is' : 'are'} hidden; show ${hidden === 1 ? 'it' : 'them'} with the eye in the list.` : ''} The sankey file itself stays as it is.`
    return { doc, notes: [], format: 'xlsx', workbook: null, sheetNames: {}, asNew: true, message }
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
