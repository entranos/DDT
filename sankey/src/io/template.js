// A small starter diagram and the downloadable xlsx template.

import { lib } from '../../../shared/src/lib.js'
import { normalizeDocument, SETTINGS, SCHEMA_VERSION } from '../model/schema.js'
import { STANDARD_COLORS, standardColorOf } from '../../../shared/src/standardPalette.js'
import { ICON_NAMES } from '../../../shared/src/icons.js'
import { PATTERN_HELP, PATTERN_COLOR_HELP } from '../../../shared/src/patterns.js'

const STARTER = {
  version: `${SCHEMA_VERSION}.0`,
  nodes: [
    { id: 'supply', title: 'Supply', x: 120, y: 160, direction: 'right', labelposition: 'left' },
    { id: 'conversion', title: 'Conversion', x: 460, y: 160, direction: 'right', labelposition: 'right' },
    { id: 'use_a', title: 'Use A', x: 800, y: 100, direction: 'right', labelposition: 'right' },
    { id: 'use_b', title: 'Use B', x: 800, y: 300, direction: 'right', labelposition: 'right' }
  ],
  links: [
    { source: 'supply', target: 'conversion', value: 100, carrier: 'energy', type: 0 },
    { source: 'conversion', target: 'use_a', value: 60, carrier: 'energy', type: 0 },
    { source: 'conversion', target: 'use_b', value: 40, carrier: 'heat', type: 0 }
  ],
  carriers: [
    { id: 'energy', color: STANDARD_COLORS[0] },
    { id: 'heat', color: standardColorOf('heat') }
  ],
  settings: SETTINGS.map(s => ({ setting: s.key, waarde: s.key === 'title' ? 'New diagram' : s.key === 'canvasWidth' ? 1000 : s.key === 'canvasHeight' ? 520 : s.default })),
  remarks: []
}

export function starterDocument () {
  return normalizeDocument(JSON.parse(JSON.stringify(STARTER))).doc
}

const README = [
  ['sheet', 'column', 'what it holds'],
  ['links', 'source', 'ID of the node the flow starts at (must exist in the nodes sheet)'],
  ['links', 'target', 'ID of the node the flow ends at'],
  ['links', 'value', 'Flow size, a number'],
  ['links', 'carrier', 'Carrier ID; sets the colour (see carriers)'],
  ['links', 'type', 'Optional. Give flows between the same two nodes different types'],
  ['links', 'annotate', 'Optional text shown when hovering the flow'],
  ['links', 'icon', 'Optional: an icon for this flow only, instead of its carrier’s (see carriers, icon)'],
  ['links', 'iconposition', 'Optional: where its icon sits on the flow, from 0 (start) to 100 (end)'],
  ['links', 'pattern', 'Optional: a pattern for this flow only, instead of its carrier’s (see carriers, pattern)'],
  ['links', 'patterncolor', 'Optional: the second colour of that pattern, as for carriers'],
  ['nodes', 'id', 'Unique node ID used by the links sheet'],
  ['nodes', 'title', 'Label shown in the diagram. Start with "." to hide it, with "_" to show only the value'],
  ['nodes', 'x', 'Horizontal position in pixels (whole number)'],
  ['nodes', 'y', 'Vertical position in pixels (whole number)'],
  ['nodes', 'direction', '"right" (flows leave to the right) or "left"'],
  ['nodes', 'labelposition', '"right" or "left" of the node'],
  ['carriers', 'id', 'Carrier ID used by the links sheet'],
  ['carriers', 'color', 'Colour as a hex code, e.g. #3F88AE'],
  ['carriers', 'icon', `Optional, shown on its flows: ${ICON_NAMES.join(', ')}; none; tabler:<name> for any icon from tabler.io/icons; or an SVG path on a 24×24 grid`],
  ['carriers', 'pattern', PATTERN_HELP],
  ['carriers', 'patterncolor', PATTERN_COLOR_HELP],
  ['settings', 'setting / waarde', 'One row per setting; see the list below'],
  [],
  ['setting', 'default', 'meaning']
]

export function templateWorkbook () {
  const XLSX = lib.XLSX
  const wb = XLSX.utils.book_new()
  const sheet = rows => XLSX.utils.json_to_sheet(rows)
  XLSX.utils.book_append_sheet(wb, sheet(STARTER.links), 'links')
  XLSX.utils.book_append_sheet(wb, sheet(STARTER.nodes), 'nodes')
  XLSX.utils.book_append_sheet(wb, sheet(STARTER.carriers), 'carriers')
  XLSX.utils.book_append_sheet(wb, sheet(STARTER.settings.map(s => ({ ...s, waarde: typeof s.waarde === 'boolean' ? (s.waarde ? 'Yes' : 'No') : s.waarde }))), 'settings')
  const readme = [...README, ...SETTINGS.map(s => [s.key, String(s.default), `${s.label}${s.help ? '. ' + s.help : ''}`])]
  const ws = XLSX.utils.aoa_to_sheet(readme)
  ws['!cols'] = [{ wch: 22 }, { wch: 18 }, { wch: 90 }]
  XLSX.utils.book_append_sheet(wb, ws, 'README')
  wb.Custprops = { SankeyEditorSchemaVersion: String(SCHEMA_VERSION) }
  return XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
}
