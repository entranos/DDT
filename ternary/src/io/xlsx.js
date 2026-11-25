// Reading and writing Excel workbooks for the ternary editor, which manages four
// sheets: points, series, axes and settings.

import { openWorkbook, writeWorkbook, wrongEditorMessage } from '../../../shared/src/workbook.js'
import { documentToFileData, SCHEMA_VERSION } from '../model/schema.js'

const MANAGED = ['points', 'series', 'axes', 'settings']

export function readXlsx (bytes) {
  const file = openWorkbook(bytes, MANAGED)
  if (!file.has('points')) throw new Error(wrongEditorMessage(file.has, 'ternary') || 'This workbook has no "points" sheet. Download the template from the start screen to see the expected layout.')
  return {
    raw: {
      ...Object.fromEntries(MANAGED.map(k => [k, file.rows(k)])),
      version: file.props.TernaryEditorSchemaVersion || 1,
      columns: { points: file.header('points'), series: file.header('series'), axes: file.header('axes') }
    },
    workbook: file.workbook,
    sheetNames: file.sheetNames
  }
}

// Returns an ArrayBuffer. `workbook` is the workbook the document was opened from, if any.
export function writeXlsx (doc, { workbook = null, sheetNames = {} } = {}) {
  const data = documentToFileData(doc, 'xlsx')
  return writeWorkbook({ managed: MANAGED, data, columns: data.columns, props: { TernaryEditorSchemaVersion: String(SCHEMA_VERSION) }, workbook, sheetNames })
}
