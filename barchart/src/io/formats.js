// One entry point for every file format the bar chart editor reads and writes. Treemap,
// waterfall and sankey files, and plain tables, open as a new chart.

import { normalizeDocument } from '../model/schema.js'
import { readXlsx, writeXlsx } from './xlsx.js'
import { toRaw, parseText, writeJson, writeYaml } from './text.js'
import { chartFromTreemap, chartFromWaterfall, chartFromSankey, chartFromTable } from './convert.js'
import { readDocument as readTreemap } from '../../../treemap/src/io/formats.js'
import { readDocument as readWaterfall } from '../../../waterfall/src/io/formats.js'
import { readDocument as readSankey } from '../../../sankey/src/io/formats.js'
import { FORMATS, ACCEPT, extensionOf, detectFormat, sheetIndex } from '../../../shared/src/formats.js'
import { editorFor, wrongEditorMessage } from '../../../shared/src/workbook.js'
import { lib } from '../../../shared/src/lib.js'

export { FORMATS, ACCEPT, extensionOf, detectFormat }

const OTHERS = {
  treemap: { read: readTreemap, make: chartFromTreemap, text: 'a bar per block, split by carrier' },
  waterfall: { read: readWaterfall, make: chartFromWaterfall, text: 'a bar per moment, split by carrier' },
  sankey: { read: readSankey, make: chartFromSankey, text: 'a bar for every node where flows end, split by carrier' }
}

function asNew (doc, message) {
  if (!doc.bars.length) throw new Error('There is nothing in this file to make a bar chart from.')
  return { doc, notes: [], format: 'xlsx', workbook: null, sheetNames: {}, asNew: true, message }
}

const tableMessage = (name, doc) => `Made a bar chart from ${name}: ${doc.bars.length} bar${doc.bars.length === 1 ? '' : 's'}, ${doc.series.length} series. The file itself stays as it is.`

// bytes: Uint8Array. Returns { doc, notes, format, workbook, sheetNames }, or with asNew
// and message when the document was made from another kind of file.
export function readDocument (name, bytes) {
  const format = detectFormat(name, bytes)
  let data = null
  let has
  if (format === 'xlsx') {
    const index = sheetIndex(lib.XLSX.read(bytes, { type: 'array', bookSheets: true }))
    has = k => !!index[k]
  } else {
    data = parseText(new TextDecoder().decode(bytes), format)
    has = k => !!(data && !Array.isArray(data) && data[k])
  }
  const editor = editorFor(has)
  if (OTHERS[editor]) {
    const { read, make, text } = OTHERS[editor]
    const result = read(name, bytes)
    const done = doc => asNew(make(doc), `Made a bar chart from this ${editor} diagram: ${text}. The ${editor} file itself stays as it is.`)
    return result.choose ? { choose: { ...result.choose, make: value => done(result.choose.make(value).doc) } } : done(result.doc)
  }
  const wrong = wrongEditorMessage(has, 'bar chart')
  if (wrong) throw new Error(wrong)

  if (format === 'xlsx') {
    if (!has('bars')) return fromSheets(bytes)
    const result = readXlsx(bytes)
    const { doc, notes } = normalizeDocument(result.raw)
    return { doc, notes, format, workbook: result.workbook, sheetNames: result.sheetNames }
  }
  if (Array.isArray(data) && data.length && data.every(r => r && typeof r === 'object' && !Array.isArray(r))) {
    const cols = [...new Set(data.flatMap(r => Object.keys(r)))]
    const doc = chartFromTable([cols, ...data.map(r => cols.map(c => r[c]))])
    if (doc) return asNew(doc, tableMessage('this table', doc))
  }
  const { doc, notes } = normalizeDocument(toRaw(data))
  return { doc, notes, format, workbook: null, sheetNames: {} }
}

// A workbook with ordinary tables: one becomes the chart, with a choice when there are more.
function fromSheets (bytes) {
  const workbook = lib.XLSX.read(bytes, { type: 'array' })
  const found = workbook.SheetNames.map(name => ({ name, doc: chartFromTable(lib.XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, blankrows: false })) })).filter(x => x.doc)
  if (!found.length) throw new Error('This workbook has no "bars" sheet, and no table with a row per bar and columns of numbers. Download the template from the start screen to see the expected layout.')
  const make = x => asNew(x.doc, tableMessage(`sheet “${x.name}”`, x.doc))
  if (found.length === 1) return make(found[0])
  return {
    choose: {
      title: 'Choose what to open',
      text: 'This workbook has several tables. One of them becomes a new bar chart; the workbook itself stays as it is.',
      options: found.map((x, i) => ({ value: String(i), label: `${x.name} (${x.doc.bars.length} × ${x.doc.series.length})` })),
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
