// Reading and writing JSON and YAML for the chord editor. Both share one structure:
// { type: 'chord', version, exportDate, flows, nodes, groups, carriers, scenarios, details, settings }
// with the amounts of a flow together: { source, target, carrier, amounts: { <scenario id>: … } }

import { lib } from '../../../shared/src/lib.js'
import { documentToFileData, scenarioIds, TABLES } from '../model/schema.js'

const spread = row => {
  if (!row || !row.amounts) return row
  const { amounts, ...rest } = row
  return { ...rest, ...amounts }
}

export function toRaw (data) {
  if (!data || typeof data !== 'object' || !Array.isArray(data.flows)) throw new Error('The file does not contain a chord diagram (expected flows and nodes).')
  return { ...Object.fromEntries(TABLES.map(k => [k, (data[k] || []).map(spread)])), settings: data.settings || [], version: data.version }
}

export const parseText = (text, format) => (format === 'json' ? JSON.parse(text) : lib.yaml.load(text))

function payload (doc, format) {
  const d = documentToFileData(doc, format)
  const ids = new Set(scenarioIds(doc))
  const gather = row => {
    const entries = Object.entries(row)
    const head = entries.filter(([key]) => !ids.has(key) && ['source', 'target', 'carrier', 'part', 'node', 'title'].includes(key))
    return { ...Object.fromEntries(head), amounts: Object.fromEntries(entries.filter(([key]) => ids.has(key))), ...Object.fromEntries(entries.filter(([key]) => !ids.has(key) && !head.some(([x]) => x === key))) }
  }
  return { type: 'chord', version: d.version, exportDate: new Date().toISOString(), ...Object.fromEntries(TABLES.map(k => [k, ['flows', 'details'].includes(k) ? d[k].map(gather) : d[k]])), settings: d.settings }
}

export const writeJson = doc => JSON.stringify(payload(doc, 'json'), null, 2) + '\n'
export const writeYaml = doc => lib.yaml.dump(payload(doc, 'yaml'), { indent: 2, lineWidth: -1, noRefs: true })
