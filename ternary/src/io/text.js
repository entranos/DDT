// Reading and writing JSON and YAML for the ternary editor. Both share one structure:
// { type: 'ternary', version, exportDate, axes, series, points, settings: [{setting, waarde}] }

import { lib } from '../../../shared/src/lib.js'
import { wrongEditorMessage } from '../../../shared/src/workbook.js'
import { documentToFileData } from '../model/schema.js'

function toRaw (data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('The file does not contain a ternary diagram (expected points and series).')
  if (!data.points) throw new Error(wrongEditorMessage(k => !!data[k], 'ternary') || 'The file has no "points" section.')
  return {
    points: data.points || [],
    series: data.series || [],
    axes: data.axes || [],
    settings: data.settings || [],
    version: data.version
  }
}

export const readJson = text => ({ raw: toRaw(JSON.parse(text)) })
export const readYaml = text => ({ raw: toRaw(lib.yaml.load(text)) })

function payload (doc, format) {
  const d = documentToFileData(doc, format)
  return { type: 'ternary', version: d.version, exportDate: new Date().toISOString(), axes: d.axes, series: d.series, points: d.points, settings: d.settings }
}

export const writeJson = doc => JSON.stringify(payload(doc, 'json'), null, 2) + '\n'
export const writeYaml = doc => lib.yaml.dump(payload(doc, 'yaml'), { indent: 2, lineWidth: -1, noRefs: true })
