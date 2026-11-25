// One entry point for every file format the chord editor reads and writes. Workbooks with a
// sheet of flows per scenario, sankey files and plain tables open as a new diagram.

import { normalizeDocument } from '../model/schema.js'
import { readXlsx, writeXlsx } from './xlsx.js'
import { toRaw, parseText, writeJson, writeYaml } from './text.js'
import { isScenarioWorkbook, documentFromScenarios } from './fromScenarios.js'
import { chordFromSankey, chordFromTable } from './convert.js'
import { readDocument as readSankey } from '../../../sankey/src/io/formats.js'
import { FORMATS, ACCEPT, extensionOf, detectFormat, sheetIndex } from '../../../shared/src/formats.js'
import { editorFor, wrongEditorMessage } from '../../../shared/src/workbook.js'
import { lib } from '../../../shared/src/lib.js'

export { FORMATS, ACCEPT, extensionOf, detectFormat }

const asNew = (doc, message) => ({ doc, notes: [], format: 'xlsx', workbook: null, sheetNames: {}, asNew: true, message })
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`
const tableMessage = (name, doc) => `Made a chord diagram from ${name}: ${plural(doc.nodes.length, 'node', 'nodes')}, ${plural(doc.flows.length, 'flow', 'flows')}. The file itself stays as it is.`

// bytes: Uint8Array. Returns { doc, notes, format, workbook, sheetNames }, or with asNew
// and message when the document was made from another kind of file.
export function readDocument (name, bytes) {
  const format = detectFormat(name, bytes)
  let data = null
  let has
  if (format === 'xlsx') {
    const book = lib.XLSX.read(bytes, { type: 'array', bookSheets: true })
    if (isScenarioWorkbook(book.SheetNames)) {
      const doc = documentFromScenarios(lib.XLSX.read(bytes, { type: 'array' }))
      if (!doc) throw new Error('This workbook has a "config" sheet, but no sheet with flows (source, target and value).')
      return asNew(doc, `Made a chord diagram with ${plural(doc.scenarios.length, 'scenario', 'scenarios')} from this workbook. Switch between them in the list or the settings. The workbook itself stays as it is.`)
    }
    const index = sheetIndex(book)
    has = k => !!index[k]
  } else {
    data = parseText(new TextDecoder().decode(bytes), format)
    has = k => !!(data && !Array.isArray(data) && data[k])
  }
  if (editorFor(has) === 'sankey') {
    const doc = chordFromSankey(readSankey(name, bytes).doc)
    if (!doc.flows.length) throw new Error('This sankey diagram has no flows to make a chord diagram from.')
    return asNew(doc, `Made a chord diagram from this sankey diagram: ${plural(doc.nodes.length, 'node', 'nodes')} around a circle, ordered to keep flows from crossing. The sankey file itself stays as it is.`)
  }
  const wrong = wrongEditorMessage(has, 'chord')
  if (wrong) throw new Error(wrong)

  if (format === 'xlsx') {
    if (!has('flows')) return fromSheets(bytes)
    const result = readXlsx(bytes)
    const { doc, notes } = normalizeDocument(result.raw)
    return { doc, notes, format, workbook: result.workbook, sheetNames: result.sheetNames }
  }
  if (Array.isArray(data) && data.length && data.every(r => r && typeof r === 'object' && !Array.isArray(r))) {
    const cols = [...new Set(data.flatMap(r => Object.keys(r)))]
    const doc = chordFromTable([cols, ...data.map(r => cols.map(c => r[c]))])
    if (doc) return asNew(doc, tableMessage('this list', doc))
  }
  const { doc, notes } = normalizeDocument(toRaw(data))
  return { doc, notes, format, workbook: null, sheetNames: {} }
}

// A workbook with ordinary tables: one becomes the diagram, with a choice when there are more.
function fromSheets (bytes) {
  const workbook = lib.XLSX.read(bytes, { type: 'array' })
  const found = workbook.SheetNames.map(name => ({ name, doc: chordFromTable(lib.XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, blankrows: false })) })).filter(x => x.doc)
  if (!found.length) throw new Error('This workbook has no "flows" sheet, no table with a source and a target column, and no matrix with the same names along both sides. Download the template from the start screen to see the expected layout.')
  const make = x => asNew(x.doc, tableMessage(`sheet “${x.name}”`, x.doc))
  if (found.length === 1) return make(found[0])
  return {
    choose: {
      title: 'Choose what to open',
      text: 'This workbook has several tables with flows. One of them becomes a new chord diagram; the workbook itself stays as it is.',
      options: found.map((x, i) => ({ value: String(i), label: `${x.name} (${plural(x.doc.flows.length, 'flow', 'flows')})` })),
      make: value => make(found[Number(value)])
    }
  }
}

// Returns { data: ArrayBuffer|string, mime }.
export function writeDocument (doc, format, context = {}) {
  if (format === 'xlsx') return { data: writeXlsx(doc, context), mime: FORMATS.xlsx.mime }
  if (format === 'json') return { data: writeJson(doc), mime: FORMATS.json.mime }
  return { data: writeYaml(doc), mime: FORMATS.yaml.mime }
}
