// Reading and writing the JSON and YAML formats. Both share one structure:
// { version, exportDate, nodes, links, carriers, settings: [{setting, waarde}], remarks }

import { lib } from '../../../shared/src/lib.js'
import { wrongEditorMessage } from '../../../shared/src/workbook.js'
import { documentToFileData } from '../model/schema.js'

function toRaw (data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('The file does not contain a diagram (expected nodes, links, carriers and settings).')
  const wrong = data.links ? null : wrongEditorMessage(k => !!data[k], 'sankey')
  if (wrong || (!data.nodes && !data.links)) throw new Error(wrong || 'The file has no "nodes" or "links" section.')
  return {
    nodes: data.nodes || [],
    links: data.links || [],
    carriers: data.carriers || data.legend || [],
    settings: data.settings || [],
    remarks: data.remarks === undefined ? [] : data.remarks,
    version: data.version
  }
}

export function readJson (text) {
  return { raw: toRaw(JSON.parse(text)) }
}

export function readYaml (text) {
  return { raw: toRaw(lib.yaml.load(text)) }
}

function payload (doc, format) {
  const d = documentToFileData(doc, format)
  return {
    version: d.version,
    exportDate: new Date().toISOString(),
    nodes: d.nodes,
    links: d.links,
    carriers: d.carriers,
    settings: d.settings,
    remarks: d.remarks
  }
}

export function writeJson (doc) {
  return JSON.stringify(payload(doc, 'json'), null, 2) + '\n'
}

export function writeYaml (doc) {
  return lib.yaml.dump(payload(doc, 'yaml'), { indent: 2, lineWidth: -1, noRefs: true })
}
