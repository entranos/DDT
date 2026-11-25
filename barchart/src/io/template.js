// A small starter chart and the downloadable xlsx template.

import { lib } from '../../../shared/src/lib.js'
import { ICON_NAMES } from '../../../shared/src/icons.js'
import { PATTERN_HELP, PATTERN_COLOR_HELP } from '../../../shared/src/patterns.js'
import { standardColorOf } from '../../../shared/src/standardPalette.js'
import { makeSheet } from '../../../shared/src/workbook.js'
import { normalizeDocument, SETTINGS, SCHEMA_VERSION } from '../model/schema.js'

const STARTER = {
  version: `${SCHEMA_VERSION}.0`,
  bars: [
    { title: 'Industry', group: '', Electricity: 140, Heat: 60, 'Natural gas': 190, icon: 'industry', visible: 'Yes', note: '' },
    { title: 'Buildings', group: '', Electricity: 180, Heat: 45, 'Natural gas': 220, icon: 'buildings', visible: 'Yes', note: '' },
    { title: 'Agriculture', group: '', Electricity: 40, Heat: 25, 'Natural gas': 70, icon: 'agriculture', visible: 'Yes', note: '' },
    { title: 'Transport', group: '', Electricity: 60, Heat: 0, 'Natural gas': 10, icon: 'car', visible: 'Yes', note: '' }
  ],
  series: [
    { id: 'Electricity', title: 'Electricity', color: standardColorOf('electricity'), icon: 'electricity', visible: 'Yes' },
    { id: 'Heat', title: 'Heat', color: standardColorOf('heat'), icon: 'heat', visible: 'Yes' },
    { id: 'Natural gas', title: 'Natural gas', color: standardColorOf('gas'), icon: 'gas', visible: 'Yes' }
  ],
  settings: [
    { setting: 'title', waarde: 'New bar chart' },
    { setting: 'unit', waarde: 'PJ' },
    { setting: 'orientation', waarde: 'vertical' },
    { setting: 'mode', waarde: 'stacked' }
  ]
}

export function starterDocument () {
  return normalizeDocument(JSON.parse(JSON.stringify(STARTER))).doc
}

const README = [
  ['sheet', 'column', 'what it holds'],
  ['bars', 'title', 'Name of the bar'],
  ['bars', 'group', 'Optional. Bars with the same group are drawn together under its name'],
  ['bars', '(one column per series)', 'The amount of that series'],
  ['bars', 'icon', `Optional: ${ICON_NAMES.join(', ')}; none; tabler:<name> for any icon from tabler.io/icons; or an SVG path on a 24×24 grid`],
  ['bars', 'color', 'Optional, for charts with one series: a colour for this bar, e.g. #3F88AE'],
  ['bars', 'pattern', `${PATTERN_HELP}. For all parts of this bar`],
  ['bars', 'patterncolor', PATTERN_COLOR_HELP],
  ['bars', 'visible', 'No leaves the bar out of the drawing (its row stays in the file)'],
  ['bars', 'note', 'Optional, shown in the tooltip'],
  ['bars', '<series>_icon / _pattern / _patterncolor', 'Optional: an icon or pattern for one part of this bar, instead of its series’'],
  ['series', 'id', 'Column name of this series in the bars sheet. Their order is the order of stacking'],
  ['series', 'title', 'Name in the legend and tooltips'],
  ['series', 'color', 'Hex code, e.g. #3F88AE'],
  ['series', 'pattern', PATTERN_HELP],
  ['series', 'patterncolor', PATTERN_COLOR_HELP],
  ['series', 'icon', 'As for bars'],
  ['series', 'visible', 'No leaves the series out of the drawing'],
  ['(no series sheet)', '', 'Every column of numbers in the bars sheet is then a series'],
  ['settings', 'setting / waarde', 'One row per setting; see the list below'],
  [],
  ['setting', 'default', 'meaning']
]

export function templateWorkbook () {
  const XLSX = lib.XLSX
  const wb = XLSX.utils.book_new()
  ;['bars', 'series', 'settings'].forEach(k => XLSX.utils.book_append_sheet(wb, makeSheet(STARTER[k], Object.keys(STARTER[k][0])), k))
  const choices = s => (s.options ? ` (${s.options.map(o => o.value).join(', ')})` : '')
  const ws = XLSX.utils.aoa_to_sheet([...README, ...SETTINGS.map(s => [s.key, String(s.default), `${s.label}${choices(s)}${s.help ? '. ' + s.help : ''}`])])
  ws['!cols'] = [{ wch: 22 }, { wch: 32 }, { wch: 100 }]
  XLSX.utils.book_append_sheet(wb, ws, 'README')
  wb.Custprops = { BarchartEditorSchemaVersion: String(SCHEMA_VERSION) }
  return XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
}
