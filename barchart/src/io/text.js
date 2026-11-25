// Reading and writing JSON and YAML for the bar chart editor. Both share one structure:
// { type: 'barchart', version, exportDate, bars, series, settings }
// with the amounts of a bar together: { title, group, amounts: { <series id>: … } }

import { lib } from '../../../shared/src/lib.js'
import { documentToFileData } from '../model/schema.js'

export function toRaw (data) {
  if (!data || typeof data !== 'object' || !Array.isArray(data.bars)) throw new Error('The file does not contain a bar chart (expected bars and series).')
  const bars = data.bars.map(row => {
    if (!row || !row.amounts) return row
    const { amounts, ...rest } = row
    return { ...rest, ...amounts }
  })
  return { bars, series: data.series || [], settings: data.settings || [], version: data.version }
}

export const parseText = (text, format) => (format === 'json' ? JSON.parse(text) : lib.yaml.load(text))

function payload (doc, format) {
  const d = documentToFileData(doc, format)
  const ids = new Set(doc.series.map(s => s.id))
  const bars = d.bars.map(row => {
    const { title, group, ...rest } = row
    const amounts = Object.fromEntries(Object.entries(rest).filter(([k]) => ids.has(k)))
    const more = Object.fromEntries(Object.entries(rest).filter(([k]) => !ids.has(k)))
    return { title, ...(group === undefined ? {} : { group }), amounts, ...more }
  })
  return { type: 'barchart', version: d.version, exportDate: new Date().toISOString(), bars, series: d.series, settings: d.settings }
}

export const writeJson = doc => JSON.stringify(payload(doc, 'json'), null, 2) + '\n'
export const writeYaml = doc => lib.yaml.dump(payload(doc, 'yaml'), { indent: 2, lineWidth: -1, noRefs: true })
