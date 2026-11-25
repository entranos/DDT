// Reading and writing Excel workbooks for the chord editor, which manages seven sheets:
// flows, nodes, groups, carriers, scenarios, details and settings.

import { openWorkbook, writeWorkbook } from '../../../shared/src/workbook.js'
import { documentToFileData, SCHEMA_VERSION, TABLES } from '../model/schema.js'

const MANAGED = [...TABLES, 'settings']

export function readXlsx (bytes) {
  const file = openWorkbook(bytes, MANAGED)
  if (!file.has('flows')) throw new Error('This workbook has no "flows" sheet. Download the template from the start screen to see the expected layout.')
  return {
    raw: {
      ...Object.fromEntries(MANAGED.map(k => [k, file.rows(k)])),
      version: file.props.ChordEditorSchemaVersion || 1,
      columns: Object.fromEntries(MANAGED.map(k => [k, file.header(k)]))
    },
    workbook: file.workbook,
    sheetNames: file.sheetNames
  }
}

// Returns an ArrayBuffer. `workbook` is the workbook the document was opened from, if any.
export function writeXlsx (doc, { workbook = null, sheetNames = {} } = {}) {
  const data = documentToFileData(doc, 'xlsx')
  return writeWorkbook({ managed: MANAGED, data, columns: data.columns, props: { ChordEditorSchemaVersion: String(SCHEMA_VERSION) }, workbook, sheetNames })
}
