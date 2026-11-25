// Reading and writing JSON and YAML for the treemap editor. Both share one structure:
// { type: 'treemap', version, exportDate, blocks, values, carriers, settings: [{setting, waarde}] }

import { lib } from '../../../shared/src/lib.js'
import { wrongEditorMessage } from '../../../shared/src/workbook.js'
import { documentToFileData } from '../model/schema.js'

function toRaw (data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('The file does not contain a treemap (expected blocks, values and carriers).')
  const wrong = wrongEditorMessage(k => !!data[k], 'treemap')
  if (wrong || !data.values) throw new Error(wrong || 'The file has no "values" section.')
  return { values: data.values || [], blocks: data.blocks || [], carriers: data.carriers || [], settings: data.settings || [], version: data.version }
}

export const readJson = text => ({ raw: toRaw(JSON.parse(text)) })
export const readYaml = text => ({ raw: toRaw(lib.yaml.load(text)) })

function payload (doc, format) {
  const d = documentToFileData(doc, format)
  return { type: 'treemap', version: d.version, exportDate: new Date().toISOString(), blocks: d.blocks, values: d.values, carriers: d.carriers, settings: d.settings }
}

export const writeJson = doc => JSON.stringify(payload(doc, 'json'), null, 2) + '\n'
export const writeYaml = doc => lib.yaml.dump(payload(doc, 'yaml'), { indent: 2, lineWidth: -1, noRefs: true })
