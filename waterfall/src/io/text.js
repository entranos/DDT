// Reading and writing JSON and YAML for the waterfall editor. Both share one structure:
// { type: 'waterfall', version, exportDate, diagrams, moments, carriers, values, settings }
// with the amounts of a row together: { diagram, carrier, amounts: { 2030: …, 2035: … } }

import { lib } from '../../../shared/src/lib.js'
import { wrongEditorMessage } from '../../../shared/src/workbook.js'
import { documentToFileData } from '../model/schema.js'

function toRaw (data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('The file does not contain a waterfall diagram (expected diagrams, moments, carriers and values).')
  const wrong = wrongEditorMessage(k => !!data[k], 'waterfall')
  if (wrong || !data.values) throw new Error(wrong || 'The file has no "values" section.')
  const values = (data.values || []).map(row => {
    if (!row || !row.amounts) return row
    const { amounts, ...rest } = row
    return { ...rest, ...amounts }
  })
  return { values, diagrams: data.diagrams || [], moments: data.moments || [], carriers: data.carriers || [], settings: data.settings || [], version: data.version }
}

export const readJson = text => ({ raw: toRaw(JSON.parse(text)) })
export const readYaml = text => ({ raw: toRaw(lib.yaml.load(text)) })

function payload (doc, format) {
  const d = documentToFileData(doc, format)
  const moments = new Set(doc.moments.map(m => m.id))
  const values = d.values.map(row => {
    const rest = Object.fromEntries(Object.entries(row).filter(([k]) => !moments.has(k)))
    const amounts = Object.fromEntries(Object.entries(row).filter(([k]) => moments.has(k)))
    const { diagram, carrier, ...more } = rest
    return { diagram, carrier, amounts, ...more }
  })
  return { type: 'waterfall', version: d.version, exportDate: new Date().toISOString(), diagrams: d.diagrams, moments: d.moments, carriers: d.carriers, values, settings: d.settings }
}

export const writeJson = doc => JSON.stringify(payload(doc, 'json'), null, 2) + '\n'
export const writeYaml = doc => lib.yaml.dump(payload(doc, 'yaml'), { indent: 2, lineWidth: -1, noRefs: true })
