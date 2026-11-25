// A small starter diagram and the downloadable xlsx template.

import { lib } from '../../../shared/src/lib.js'
import { ICON_NAMES } from '../../../shared/src/icons.js'
import { PATTERN_HELP, PATTERN_COLOR_HELP } from '../../../shared/src/patterns.js'
import { standardColorOf } from '../../../shared/src/standardPalette.js'
import { makeSheet } from '../../../shared/src/workbook.js'
import { normalizeDocument, SETTINGS, SCHEMA_VERSION } from '../model/schema.js'

const years = ['2030', '2040', '2050']
const row = (diagram, carrier, ...amounts) => ({ diagram, carrier, ...Object.fromEntries(years.map((y, i) => [y, amounts[i]])), note: '' })

const STARTER = {
  version: `${SCHEMA_VERSION}.0`,
  diagrams: [
    { id: 'growth', title: 'Growing', subtitle: 'CO₂-free', visible: 'Yes' },
    { id: 'decline', title: 'Declining', subtitle: 'Fossil', visible: 'Yes' }
  ],
  moments: years.map(id => ({ id, title: id, visible: 'Yes' })),
  carriers: [
    { id: 'electricity', title: 'Electricity', color: standardColorOf('electricity'), icon: 'electricity' },
    { id: 'heat', title: 'Heat', color: standardColorOf('heat'), icon: 'heat' },
    { id: 'biomass', title: 'Biomass', color: standardColorOf('biomass'), icon: 'biomass' },
    { id: 'oil', title: 'Oil products', color: standardColorOf('oil'), icon: 'oil' },
    { id: 'gas', title: 'Natural gas', color: standardColorOf('gas'), icon: 'gas' }
  ],
  values: [
    row('growth', 'electricity', 300, 480, 640), row('growth', 'heat', 60, 80, 120), row('growth', 'biomass', 140, 210, 260),
    row('decline', 'electricity', 180, 90, 30), row('decline', 'oil', 620, 400, 210), row('decline', 'gas', 480, 300, 130)
  ],
  settings: [
    { setting: 'title', waarde: 'New waterfall diagram' },
    { setting: 'unit', waarde: 'PJ' }
  ]
}

export function starterDocument () {
  return normalizeDocument({ ...JSON.parse(JSON.stringify(STARTER)), columns: { values: ['diagram', 'carrier', ...years, 'note'] } }).doc
}

const README = [
  ['sheet', 'column', 'what it holds'],
  ['values', 'diagram', 'ID of the diagram the row belongs to (see diagrams sheet)'],
  ['values', 'carrier', 'ID of the carrier (see carriers sheet)'],
  ['values', '(one column per moment)', 'What the carrier amounts to at that moment. The steps in between are worked out from these'],
  ['values', 'note', 'Optional, shown in the tooltip'],
  ['values', 'pattern', 'Optional: a pattern for these values only, instead of their carrier’s (see carriers, pattern)'],
  ['values', 'patterncolor', 'Optional: the second colour of that pattern, as for carriers'],
  ['diagrams', 'id', 'Unique ID used by the values sheet. Diagrams are drawn above each other, on shared columns'],
  ['diagrams', 'title / subtitle', 'Shown beside the diagram'],
  ['diagrams', 'visible', 'No leaves the diagram out of the drawing (its rows stay in the file)'],
  ['moments', 'id', 'Column name of this moment in the values sheet, e.g. 2030'],
  ['moments', 'title', 'Shown under its totals'],
  ['moments', 'visible', 'No skips the moment; the steps then go from the one before to the one after'],
  ['carriers', 'id', 'Unique ID used by the values sheet. Their order is the order of the steps'],
  ['carriers', 'title', 'Name in the legend and tooltips'],
  ['carriers', 'color', 'Hex code, e.g. #3F88AE'],
  ['carriers', 'icon', `Optional: ${ICON_NAMES.join(', ')}; none; tabler:<name> for any icon from tabler.io/icons; or an SVG path on a 24×24 grid`],
  ['carriers', 'pattern', PATTERN_HELP],
  ['carriers', 'patterncolor', PATTERN_COLOR_HELP],
  ['settings', 'setting / waarde', 'One row per setting; see the list below'],
  [],
  ['setting', 'default', 'meaning']
]

export function templateWorkbook () {
  const XLSX = lib.XLSX
  const wb = XLSX.utils.book_new()
  const headers = { values: ['diagram', 'carrier', ...years, 'note'] }
  ;['values', 'diagrams', 'moments', 'carriers', 'settings'].forEach(k => XLSX.utils.book_append_sheet(wb, makeSheet(STARTER[k], headers[k] || Object.keys(STARTER[k][0])), k))
  const ws = XLSX.utils.aoa_to_sheet([...README, ...SETTINGS.map(s => [s.key, String(s.default), `${s.label}${s.help ? '. ' + s.help : ''}`])])
  ws['!cols'] = [{ wch: 22 }, { wch: 24 }, { wch: 100 }]
  XLSX.utils.book_append_sheet(wb, ws, 'README')
  wb.Custprops = { WaterfallEditorSchemaVersion: String(SCHEMA_VERSION) }
  return XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
}
