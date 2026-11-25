// Reads the workbooks of the chord viewer this editor is modelled on: a sheet of flows per
// scenario (source, target, sourceGroup, targetGroup, carrier, sector, value, and rows with
// datatype "metadata"), a "scenarios" sheet with their titles, and a "config" sheet with
// colours. All scenarios become one new diagram.

import { lib } from '../../../shared/src/lib.js'
import { normalizeDocument, isFiniteNumber, toNumber, hexColor } from '../model/schema.js'
import { untangle } from '../model/chords.js'

const text = v => String(v ?? '').trim()
const lower = v => text(v).toLowerCase()
const isConfig = name => ['config', 'scenarios'].includes(lower(name)) || lower(name).startsWith('ignore_')
const rowsOf = (workbook, name) => lib.XLSX.utils.sheet_to_json(workbook.Sheets[name])
const hasFlows = rows => rows.some(r => text(r.source) && text(r.target) && isFiniteNumber(toNumber(r.value)))

export function isScenarioWorkbook (sheetNames) {
  const names = sheetNames.map(lower)
  return !names.includes('flows') && names.includes('config') && sheetNames.some(n => !isConfig(n))
}

// As that viewer orders and places its groups.
const GROUP_ORDER = ['finaal verbruik', 'xp', 'export', 'verliezen', 'verlies', 'c', 'h2', 'e']
const OUTER = ['finaal verbruik', 'xp', 'export', 'verlies', 'verliezen']
// The lines it shows under nodes, by the id of a metadata row.
const DETAILS = [
  ['Elektriciteit', { zon_pv: 'Zon PV', wind_op_zee: 'Wind op zee', wind_op_land: 'Wind op land', elektriciteit_centrales: 'Centrales', elektriciteit_import: 'Import' }],
  ['Waterstof_en_ammoniak', { import_waterstof_en_ammoniak: 'Import' }],
  ['Warmte', { omgevingswarmte: 'Omgevingswarmte', aardwarmte: 'Aardwarmte', hernieuwbare_warmtebronnen: 'Hernieuwbare warmtebronnen' }],
  ['Koolstof biogeen en synthetisch', { import_biosyn: 'Import bio en syn producten', import_bioruw: 'Import ruwe biomassa', production_bioruw: 'Productie ruwe biomassa' }],
  ['Koolstof fossiel', { import_fossiel_aardolie: 'Import aardolie', import_aardgas: 'Import aardgas', import_fossiel_aardolieproducten_kolenproducten_aardgas_en_methanol: 'Import overig fossiel' }],
  ['Finaal verbruik', { huishoudens: 'Huishoudens', utiliteit: 'Utiliteit', industrie: 'Industrie', mobiliteit_nationaal: 'Mobiliteit nationaal', bunkers: 'Bunkers', landbouw: 'Landbouw', datacenters: 'Datacenters', overige: 'Overige', gebouwde_omgeving: 'Gebouwde omgeving' }]
]
const MIX = 'carbon_fossil_and_bio_and_syn' // drawn in stripes of two carriers
const CARRIER_ORDER = ['electricity', 'hydrogen_and_ammonia', 'hydrogen', 'heat', 'carbon_bio_and_syn', 'carbon_fossil', MIX, 'waste', 'verlies']

const nice = id => { const t = text(id).replace(/^_+/, '').replace(/_/g, ' '); return t.charAt(0).toUpperCase() + t.slice(1) }

function readConfig (workbook) {
  const out = { carrier_colors: {}, carrier_labels: {}, group_colors: {}, chart_config: {}, group_arc_config: {}, node_order: {} }
  const name = workbook.SheetNames.find(n => lower(n) === 'config')
  if (!name) return out
  let section = null
  lib.XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1 }).forEach(([key, value]) => {
    const k = text(key)
    if (out[k] && (value === undefined || value === '' || value === null)) section = k
    else if (section && k && value !== undefined && value !== null && value !== '') out[section][k] = value
  })
  return out
}

// Returns a document, or null when there are no flows.
export function documentFromScenarios (workbook) {
  const config = readConfig(workbook)
  const titles = new Map()
  const titleSheet = workbook.SheetNames.find(n => lower(n) === 'scenarios')
  if (titleSheet) rowsOf(workbook, titleSheet).forEach(r => { if (text(r.sheet_id) && text(r.title)) titles.set(text(r.sheet_id), text(r.title)) })

  const scenarios = []
  const flows = new Map()
  const details = new Map()
  const groupOf = new Map()
  workbook.SheetNames.filter(n => !isConfig(n)).forEach(sheet => {
    const rows = rowsOf(workbook, sheet)
    const own = rows.filter(r => lower(r.datatype) !== 'metadata')
    if (!hasFlows(own)) return
    scenarios.push({ id: sheet, title: titles.get(sheet) || sheet })
    own.forEach(r => {
      const source = text(r.source)
      const target = text(r.target)
      const value = toNumber(r.value)
      if (!source || !target || !isFiniteNumber(value)) return
      if (text(r.sourceGroup) && !groupOf.has(source)) groupOf.set(source, text(r.sourceGroup))
      if (text(r.targetGroup) && !groupOf.has(target)) groupOf.set(target, text(r.targetGroup))
      const part = [nice(r.subcarrier), nice(r.sector)].filter(Boolean).join(', ')
      const key = [source, target, text(r.carrier), part].join('\u0000')
      if (!flows.has(key)) flows.set(key, { source, target, carrier: text(r.carrier), part })
      const f = flows.get(key)
      f[sheet] = (f[sheet] || 0) + value
    })
    rows.filter(r => lower(r.datatype) === 'metadata' && text(r.metadata_id) && isFiniteNumber(toNumber(r.value))).forEach(r => {
      DETAILS.forEach(([node, items]) => {
        const title = items[text(r.metadata_id)]
        if (!title) return
        const key = `${node}\u0000${title}`
        if (!details.has(key)) details.set(key, { node, title })
        details.get(key)[sheet] = toNumber(r.value)
      })
    })
  })
  if (!flows.size) return null
  const list = [...flows.values()]
  const ids = scenarios.map(s => s.id)
  const weight = f => ids.reduce((t, id) => t + (f[id] || 0), 0)

  // Groups in that viewer's order (or the one in the workbook), then the largest.
  const nodeIds = [...new Set(list.flatMap(f => [f.source, f.target]))]
  const groupIds = [...new Set(nodeIds.map(id => groupOf.get(id) || ''))]
  const totalOf = g => list.reduce((t, f) => t + ((groupOf.get(f.source) || '') === g ? weight(f) : 0) + ((groupOf.get(f.target) || '') === g ? weight(f) : 0), 0)
  const listed = text(config.node_order._groups).split(',').map(lower).filter(Boolean)
  // The workbook's own order counts when it is about these groups.
  const order = groupIds.filter(g => listed.includes(lower(g))).length >= groupIds.length / 2 ? listed : GROUP_ORDER
  const rank = g => { const i = order.indexOf(lower(g)); return i < 0 ? order.length : i }
  groupIds.sort((a, b) => rank(a) - rank(b) || totalOf(b) - totalOf(a))
  const links = list.map(f => ({ source: f.source, target: f.target, value: weight(f) }))
  const arranged = untangle(groupIds.map(g => nodeIds.filter(id => (groupOf.get(id) || '') === g)), links)
  arranged.forEach((members, i) => {
    const wanted = text(config.node_order[groupIds[i]]).split(',').map(lower).filter(Boolean)
    if (!wanted.length) return
    const at = id => { const j = wanted.indexOf(lower(id)); return j < 0 ? wanted.length : j }
    arranged[i] = [...members].sort((a, b) => at(a) - at(b))
  })

  const groupColor = g => hexColor(config.group_colors[g]) || hexColor((Object.entries(config.group_colors).find(([k]) => lower(g).includes(lower(k))) || [])[1]) || ''
  const colors = config.carrier_colors
  const carriers = [...new Set(list.map(f => f.carrier))].filter(Boolean)
  const carrierRank = id => { const i = CARRIER_ORDER.indexOf(id); return i < 0 ? CARRIER_ORDER.length : i }
  carriers.sort((a, b) => carrierRank(a) - carrierRank(b))
  const chart = { ...config.group_arc_config, ...config.chart_config }
  const settings = [
    ['canvasWidth', toNumber(chart.width)], ['canvasHeight', toNumber(chart.height)],
    ['backgroundColor', hexColor(chart.page_background_color)], ['discColor', hexColor(chart.middle_backdrop_circle_color)],
    ['groupColor', hexColor(chart.group_arc_color)], ['groupWidth', toNumber(chart.group_arc_width)],
    ['legend', 'bottom'], ['unit', 'PJ'], ['decimals', '0'], ['scaleMode', 'largest'], ['spacing', 'compact'], ['ribbonOrder', 'carrier'], ['bend', 100]
  ].filter(([, v]) => v !== null && v !== undefined && v !== '' && !(typeof v === 'number' && !isFiniteNumber(v)))
  const { doc } = normalizeDocument({
    flows: list,
    nodes: arranged.flat().map(id => ({ id, title: nice(id), group: groupOf.get(id) || '', ...(id.startsWith('_') ? { label: false } : {}) })),
    groups: groupIds.filter(Boolean).map(id => ({ id, title: id, color: groupColor(id), place: OUTER.includes(lower(id)) ? 'outside' : 'inside' })),
    carriers: carriers.map(id => (id === MIX
      ? { id, title: text(config.carrier_labels[id]) || 'Carbon (fossil, bio/syn)', color: hexColor(colors.carbon_fossil) || '#4E4E4E', pattern: 'stripes', patterncolor: hexColor(colors.carbon_bio_and_syn) || '#61D4A4' }
      : { id, title: text(config.carrier_labels[id]) || nice(id), color: hexColor(colors[id]) || '#CCCCCC' })),
    scenarios,
    details: [...details.values()].filter(d => nodeIds.includes(d.node)),
    settings: settings.map(([setting, waarde]) => ({ setting, waarde })),
    columns: { flows: ['source', 'target', 'carrier', 'part', ...ids] }
  })
  return doc
}
