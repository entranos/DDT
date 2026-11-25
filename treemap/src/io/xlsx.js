// Reading and writing Excel workbooks for the treemap editor, which manages four
// sheets: values, blocks, carriers and settings.

import { openWorkbook, writeWorkbook, wrongEditorMessage } from '../../../shared/src/workbook.js'
import { documentToFileData, SCHEMA_VERSION } from '../model/schema.js'

const MANAGED = ['values', 'blocks', 'carriers', 'settings']

export function readXlsx (bytes) {
  const file = openWorkbook(bytes, MANAGED)
  const wrong = wrongEditorMessage(file.has, 'treemap')
  if (wrong || !file.has('values')) throw new Error(wrong || 'This workbook has no "values" sheet. Download the template from the start screen to see the expected layout.')
  return {
    raw: {
      ...Object.fromEntries(MANAGED.map(k => [k, file.rows(k)])),
      version: file.props.TreemapEditorSchemaVersion || 1,
      columns: { values: file.header('values'), blocks: file.header('blocks'), carriers: file.header('carriers') }
    },
    workbook: file.workbook,
    sheetNames: file.sheetNames
  }
}

// Returns an ArrayBuffer. `workbook` is the workbook the document was opened from, if any.
export function writeXlsx (doc, { workbook = null, sheetNames = {} } = {}) {
  const data = documentToFileData(doc, 'xlsx')
  return writeWorkbook({ managed: MANAGED, data, columns: data.columns, props: { TreemapEditorSchemaVersion: String(SCHEMA_VERSION) }, workbook, sheetNames })
}
