// A small starter diagram and the downloadable xlsx template.

import { lib } from '../../../shared/src/lib.js'
import { ICON_NAMES } from '../../../shared/src/icons.js'
import { PATTERN_HELP, PATTERN_COLOR_HELP } from '../../../shared/src/patterns.js'
import { standardColorOf } from '../../../shared/src/standardPalette.js'
import { makeSheet } from '../../../shared/src/workbook.js'
import { normalizeDocument, SETTINGS, SCHEMA_VERSION } from '../model/schema.js'

const STARTER = {
  version: `${SCHEMA_VERSION}.0`,
  flows: [
    ['wind', 'grid', 'electricity', 90, 180], ['solar', 'grid', 'electricity', 60, 140], ['gas_field', 'grid', 'gas', 70, 10], ['gas_field', 'homes', 'gas', 120, 30], ['gas_field', 'industry', 'gas', 110, 50],
    ['grid', 'homes', 'electricity', 80, 130], ['grid', 'industry', 'electricity', 100, 150], ['grid', 'transport', 'electricity', 20, 45], ['grid', 'losses', 'electricity', 20, 5]
  ].map(([source, target, carrier, a, b]) => ({ source, target, carrier, 2030: a, 2050: b, note: '' })),
  nodes: [
    { id: 'homes', title: 'Homes', group: 'Use', icon: 'buildings', visible: 'Yes' },
    { id: 'industry', title: 'Industry', group: 'Use', icon: 'industry', visible: 'Yes' },
    { id: 'transport', title: 'Transport', group: 'Use', icon: 'car', visible: 'Yes' },
    { id: 'losses', title: 'Losses', group: 'Losses', icon: '', visible: 'Yes' },
    { id: 'grid', title: 'Power grid', group: 'Conversion', icon: 'electricity', visible: 'Yes' },
    { id: 'gas_field', title: 'Gas fields', group: 'Supply', icon: 'gas', visible: 'Yes' },
    { id: 'solar', title: 'Solar', group: 'Supply', icon: 'solar', visible: 'Yes' },
    { id: 'wind', title: 'Wind', group: 'Supply', icon: 'wind', visible: 'Yes' }
  ],
  groups: ['Use', 'Losses', 'Conversion', 'Supply'].map(id => ({ id, title: id, color: '', place: '' })),
  carriers: [
    { id: 'electricity', title: 'Electricity', color: standardColorOf('electricity'), icon: 'electricity', visible: 'Yes' },
    { id: 'gas', title: 'Natural gas', color: standardColorOf('gas'), icon: 'gas', visible: 'Yes' }
  ],
  scenarios: [{ id: '2030', title: '2030' }, { id: '2050', title: '2050' }],
  details: [],
  settings: [
    { setting: 'title', waarde: 'New chord diagram' },
    { setting: 'unit', waarde: 'PJ' },
    { setting: 'scenario', waarde: '2030' }
  ]
}

export function starterDocument () {
  return normalizeDocument({ ...JSON.parse(JSON.stringify(STARTER)), columns: { flows: ['source', 'target', 'carrier', '2030', '2050', 'note'] } }).doc
}

const README = [
  ['sheet', 'column', 'what it holds'],
  ['flows', 'source / target', 'IDs of the nodes a flow goes from and to (see nodes sheet)'],
  ['flows', 'carrier', 'ID of the carrier; sets the colour (see carriers sheet)'],
  ['flows', 'part', 'Optional. Rows with the same source, target and carrier are one flow; parts are listed in its tooltip'],
  ['flows', '(one column per scenario)', 'The amount in that scenario, for example a year. With one scenario: a column "value"'],
  ['flows', 'note', 'Optional, shown in the tooltip'],
  ['flows', 'icon / pattern / patterncolor', 'Optional, for this flow only, instead of its carrier’s'],
  ['nodes', 'id', 'Unique ID used by the flows sheet. Their order is the order around the circle'],
  ['nodes', 'title', 'Name shown beside the node'],
  ['nodes', 'group', 'Optional. ID of a group (see groups sheet)'],
  ['nodes', 'color', 'Optional: a colour of its own, e.g. #3F88AE. Otherwise that of its carrier when it has only one'],
  ['nodes', 'icon', `Optional: ${ICON_NAMES.join(', ')}; none; tabler:<name> for any icon from tabler.io/icons; or an SVG path on a 24×24 grid`],
  ['nodes', 'label', 'No draws the node without arc and label: its flows end at the arc of a group inside the circle'],
  ['nodes', 'visible', 'No leaves the node and its flows out of the drawing'],
  ['nodes', 'labelx / labely', 'Optional: how far its label is moved from its automatic place, in pixels'],
  ['groups', 'id / title', 'Unique ID used by the nodes sheet, and the name along the arc'],
  ['groups', 'color', 'Optional: colour of the arc'],
  ['groups', 'place', 'Optional: outside (around the nodes) or inside (over the flows)'],
  ['carriers', 'id / title', 'Unique ID used by the flows sheet, and the name in the legend'],
  ['carriers', 'color', 'Hex code, e.g. #3F88AE'],
  ['carriers', 'pattern', PATTERN_HELP],
  ['carriers', 'patterncolor', PATTERN_COLOR_HELP],
  ['carriers', 'icon', 'As for nodes'],
  ['carriers', 'visible', 'No leaves its flows out of the drawing'],
  ['scenarios', 'id', 'Column name of its amounts in the flows and details sheets'],
  ['scenarios', 'title', 'Shown in the subtitle'],
  ['details', 'node / title', 'Optional small lines under the label of a node, with a column per scenario'],
  ['settings', 'setting / waarde', 'One row per setting; see the list below'],
  [],
  ['setting', 'default', 'meaning']
]

export function templateWorkbook () {
  const XLSX = lib.XLSX
  const wb = XLSX.utils.book_new()
  const headers = { flows: ['source', 'target', 'carrier', '2030', '2050', 'note'], details: ['node', 'title', '2030', '2050'] }
  ;['flows', 'nodes', 'groups', 'carriers', 'scenarios', 'details', 'settings'].forEach(k => XLSX.utils.book_append_sheet(wb, makeSheet(STARTER[k], headers[k] || Object.keys(STARTER[k][0])), k))
  const choices = s => (s.options ? ` (${s.options.map(o => o.value).join(', ')})` : '')
  const ws = XLSX.utils.aoa_to_sheet([...README, ...SETTINGS.map(s => [s.key, String(s.default), `${s.label}${choices(s)}${s.help ? '. ' + s.help : ''}`])])
  ws['!cols'] = [{ wch: 22 }, { wch: 26 }, { wch: 100 }]
  XLSX.utils.book_append_sheet(wb, ws, 'README')
  wb.Custprops = { ChordEditorSchemaVersion: String(SCHEMA_VERSION) }
  return XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
}
