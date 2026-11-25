// A small starter diagram and the downloadable xlsx template.

import { lib } from '../../../shared/src/lib.js'
import { normalizeDocument, DEFAULT_AXES, SETTINGS, SCHEMA_VERSION } from '../model/schema.js'

const years = [2020, 2030, 2040, 2050]
const mix = rows => rows.map((r, i) => ({ year: years[i], electrons: r[0], fossil: r[1], bio: r[2] }))

const STARTER = {
  version: `${SCHEMA_VERSION}.0`,
  axes: DEFAULT_AXES,
  series: [
    { id: 'history', title: 'History', group: 'History', style: 'dashed', highlight: 'No', visible: 'Yes' },
    { id: 'scenario_a', title: 'Scenario A', group: 'Scenarios', style: 'solid', highlight: 'Yes', visible: 'Yes' },
    { id: 'scenario_b', title: 'Scenario B', group: 'Scenarios', style: 'solid', highlight: 'No', visible: 'Yes' }
  ],
  points: [
    ...[[2000, 18, 75, 7], [2010, 20, 70, 10], [2020, 23, 63, 14]].map(([year, electrons, fossil, bio]) => ({ series: 'history', year, electrons, fossil, bio })),
    ...mix([[23, 63, 14], [35, 48, 17], [52, 25, 23], [64, 10, 26]]).map(p => ({ series: 'scenario_a', ...p })),
    ...mix([[23, 63, 14], [30, 50, 20], [38, 30, 32], [44, 14, 42]]).map(p => ({ series: 'scenario_b', ...p }))
  ],
  settings: [
    { setting: 'title', waarde: 'New ternary diagram' },
    { setting: 'canvasWidth', waarde: 900 },
    { setting: 'unit', waarde: '%' }
  ]
}

export function starterDocument () {
  return normalizeDocument(JSON.parse(JSON.stringify(STARTER))).doc
}

const README = [
  ['sheet', 'column', 'what it holds'],
  ['points', 'series', 'ID of the series the point belongs to (see series sheet)'],
  ['points', 'year', 'Year of the point; also its label and its place along the line'],
  ['points', '(one column per corner)', 'Value of that share. Use any unit (PJ, %, …): each point is scaled so its three shares make 100%'],
  ['series', 'id', 'Unique ID used by the points sheet'],
  ['series', 'title', 'Name in the legend and tooltips'],
  ['series', 'group', 'Optional. Series with the same group share a colour family and a legend heading'],
  ['series', 'color', 'Optional hex code, e.g. #3F88AE; empty picks one per group'],
  ['series', 'style', '"solid" or "dashed" (e.g. history)'],
  ['series', 'highlight', 'Yes draws the line heavier, with year labels'],
  ['series', 'visible', 'No leaves the series out of the drawing (its rows stay in the file)'],
  ['axes', 'id', 'Column name of this share in the points sheet'],
  ['axes', 'label', 'Name shown at the corner'],
  ['axes', 'corner', '"left" (top left), "right" (top right) or "bottom"'],
  ['axes', 'low / high', 'Optional texts along the direction arrows, e.g. "Few electrons" / "Many electrons"'],
  ['settings', 'setting / waarde', 'One row per setting; see the list below'],
  [],
  ['setting', 'default', 'meaning']
]

export function templateWorkbook () {
  const XLSX = lib.XLSX
  const wb = XLSX.utils.book_new()
  const sheet = rows => XLSX.utils.json_to_sheet(rows)
  XLSX.utils.book_append_sheet(wb, sheet(STARTER.points), 'points')
  XLSX.utils.book_append_sheet(wb, sheet(STARTER.series), 'series')
  XLSX.utils.book_append_sheet(wb, sheet(STARTER.axes.map(({ _uid, ...a }) => a)), 'axes')
  XLSX.utils.book_append_sheet(wb, sheet(STARTER.settings), 'settings')
  const ws = XLSX.utils.aoa_to_sheet([...README, ...SETTINGS.map(s => [s.key, String(s.default), `${s.label}${s.help ? '. ' + s.help : ''}`])])
  ws['!cols'] = [{ wch: 22 }, { wch: 18 }, { wch: 90 }]
  XLSX.utils.book_append_sheet(wb, ws, 'README')
  wb.Custprops = { TernaryEditorSchemaVersion: String(SCHEMA_VERSION) }
  return XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
}
