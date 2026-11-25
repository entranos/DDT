// A small starter diagram and the downloadable xlsx template.

import { lib } from '../../../shared/src/lib.js'
import { normalizeDocument, SETTINGS, SCHEMA_VERSION } from '../model/schema.js'
import { standardColorOf } from '../../../shared/src/standardPalette.js'
import { ICON_NAMES } from '../../../shared/src/icons.js'
import { PATTERN_HELP, PATTERN_COLOR_HELP } from '../../../shared/src/patterns.js'

const STARTER = {
  version: `${SCHEMA_VERSION}.0`,
  blocks: [
    { id: 'industry', title: 'Industry', group: 'Final use', icon: 'industry', visible: 'Yes' },
    { id: 'buildings', title: 'Buildings', group: 'Final use', icon: 'buildings', visible: 'Yes' },
    { id: 'transport', title: 'Transport', group: 'Final use', icon: 'car', visible: 'Yes' },
    { id: 'power', title: 'Power plants', group: 'Conversion', icon: 'power-plant', visible: 'Yes' }
  ],
  values: [
    ['industry', 'gas', 160], ['industry', 'oil', 120], ['industry', 'electricity', 130], ['industry', 'heat', 60],
    ['buildings', 'gas', 190], ['buildings', 'electricity', 140], ['buildings', 'heat', 50],
    ['transport', 'oil', 310], ['transport', 'electricity', 40],
    ['power', 'gas', 180], ['power', 'biomass', 70]
  ].map(([block, carrier, value]) => ({ block, carrier, part: '', value, note: '' })),
  carriers: [
    { id: 'electricity', title: 'Electricity', color: standardColorOf('electricity'), icon: 'electricity' },
    { id: 'heat', title: 'Heat', color: standardColorOf('heat'), icon: 'heat' },
    { id: 'gas', title: 'Natural gas', color: standardColorOf('gas'), icon: 'gas' },
    { id: 'oil', title: 'Oil products', color: standardColorOf('oil'), icon: 'oil' },
    { id: 'biomass', title: 'Biomass', color: standardColorOf('biomass'), icon: 'biomass' }
  ],
  settings: [
    { setting: 'title', waarde: 'New treemap' },
    { setting: 'unit', waarde: 'PJ' }
  ]
}

export function starterDocument () {
  return normalizeDocument(JSON.parse(JSON.stringify(STARTER))).doc
}

const README = [
  ['sheet', 'column', 'what it holds'],
  ['values', 'block', 'ID of the block the value belongs to (see blocks sheet)'],
  ['values', 'carrier', 'ID of the carrier (see carriers sheet)'],
  ['values', 'part', 'Optional. Rows with the same block and carrier are one tile; parts are listed in its tooltip'],
  ['values', 'value', 'The amount; a tile’s area is proportional to it'],
  ['values', 'note', 'Optional, shown in the tooltip'],
  ['values', 'icon', 'Optional: an icon for this tile only, instead of its carrier’s (see blocks, icon)'],
  ['values', 'pattern', 'Optional: a pattern for this tile only, instead of its carrier’s (see carriers, pattern)'],
  ['values', 'patterncolor', 'Optional: the second colour of that pattern, as for carriers'],
  ['values', '(other layout)', 'A table with a row per block and a column per carrier is read too'],
  ['blocks', 'id', 'Unique ID used by the values sheet'],
  ['blocks', 'title', 'Name shown above the block'],
  ['blocks', 'group', 'Optional. Blocks with the same group are drawn together under its name'],
  ['blocks', 'icon', `Optional: ${ICON_NAMES.join(', ')}; none; tabler:<name> for any icon from tabler.io/icons; or an SVG path on a 24×24 grid`],
  ['blocks', 'visible', 'No leaves the block out of the drawing (its rows stay in the file)'],
  ['carriers', 'id', 'Unique ID used by the values sheet'],
  ['carriers', 'title', 'Name in the legend and tooltips'],
  ['carriers', 'color', 'Hex code, e.g. #3F88AE'],
  ['carriers', 'icon', 'As for blocks'],
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
  ;['values', 'blocks', 'carriers', 'settings'].forEach(k => XLSX.utils.book_append_sheet(wb, sheet(STARTER[k]), k))
  const ws = XLSX.utils.aoa_to_sheet([...README, ...SETTINGS.map(s => [s.key, String(s.default), `${s.label}${s.help ? '. ' + s.help : ''}`])])
  ws['!cols'] = [{ wch: 22 }, { wch: 18 }, { wch: 100 }]
  XLSX.utils.book_append_sheet(wb, ws, 'README')
  wb.Custprops = { TreemapEditorSchemaVersion: String(SCHEMA_VERSION) }
  return XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
}
