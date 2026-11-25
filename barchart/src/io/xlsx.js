// Reading and writing Excel workbooks for the bar chart editor, which manages three
// sheets: bars, series and settings.

import { openWorkbook, writeWorkbook } from '../../../shared/src/workbook.js'
import { documentToFileData, SCHEMA_VERSION } from '../model/schema.js'

const MANAGED = ['bars', 'series', 'settings']

export function readXlsx (bytes) {
  const file = openWorkbook(bytes, MANAGED)
  if (!file.has('bars')) throw new Error('This workbook has no "bars" sheet. Download the template from the start screen to see the expected layout.')
  return {
    raw: {
      ...Object.fromEntries(MANAGED.map(k => [k, file.rows(k)])),
      version: file.props.BarchartEditorSchemaVersion || 1,
      columns: Object.fromEntries(MANAGED.map(k => [k, file.header(k)]))
    },
    workbook: file.workbook,
    sheetNames: file.sheetNames
  }
}

// Returns an ArrayBuffer. `workbook` is the workbook the document was opened from, if any.
export function writeXlsx (doc, { workbook = null, sheetNames = {} } = {}) {
  const data = documentToFileData(doc, 'xlsx')
  return writeWorkbook({ managed: MANAGED, data, columns: data.columns, props: { BarchartEditorSchemaVersion: String(SCHEMA_VERSION) }, workbook, sheetNames })
}
