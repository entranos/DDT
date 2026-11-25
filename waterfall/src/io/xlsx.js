// Reading and writing Excel workbooks for the waterfall editor, which manages five
// sheets: values, diagrams, moments, carriers and settings.

import { openWorkbook, writeWorkbook, wrongEditorMessage } from '../../../shared/src/workbook.js'
import { documentToFileData, SCHEMA_VERSION } from '../model/schema.js'

const MANAGED = ['values', 'diagrams', 'moments', 'carriers', 'settings']

export function readXlsx (bytes) {
  const file = openWorkbook(bytes, MANAGED)
  const wrong = wrongEditorMessage(file.has, 'waterfall')
  if (wrong || !file.has('values')) throw new Error(wrong || 'This workbook has no "values" sheet. Download the template from the start screen to see the expected layout.')
  return {
    raw: {
      ...Object.fromEntries(MANAGED.map(k => [k, file.rows(k)])),
      version: file.props.WaterfallEditorSchemaVersion || 1,
      columns: Object.fromEntries(MANAGED.map(k => [k, file.header(k)]))
    },
    workbook: file.workbook,
    sheetNames: file.sheetNames
  }
}

// Returns an ArrayBuffer. `workbook` is the workbook the document was opened from, if any.
export function writeXlsx (doc, { workbook = null, sheetNames = {} } = {}) {
  const data = documentToFileData(doc, 'xlsx')
  return writeWorkbook({ managed: MANAGED, data, columns: data.columns, props: { WaterfallEditorSchemaVersion: String(SCHEMA_VERSION) }, workbook, sheetNames })
}
