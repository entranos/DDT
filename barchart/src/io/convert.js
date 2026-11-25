// Makes a bar chart from other things: a treemap, a waterfall or a sankey diagram, or a
// plain table with a row per bar and a column per series.

import { getSetting as treemapSetting, blockIsVisible, carrierColor as treemapColor } from '../../../treemap/src/model/schema.js'
import { getSetting as waterfallSetting, isVisible, carrierColor as waterfallColor } from '../../../waterfall/src/model/schema.js'
import { treemapFromSankey } from '../../../treemap/src/io/fromSankey.js'
import { normalizeDocument, reservedColumn, isFiniteNumber, toNumber, iconKey, patternKey, patternColorKey } from '../model/schema.js'

const blank = v => v === undefined || v === null || String(v).trim() === ''
const given = row => Object.fromEntries(Object.entries(row).filter(([, v]) => !blank(v)))

// Carriers become series; their IDs become columns of the bars table.
function seriesFrom (carriers, color) {
  const taken = new Set()
  return carriers.map(c => {
    let id = reservedColumn(c.id) || !c.id ? `${c.id || 'series'} (series)` : c.id
    while (taken.has(id)) id = `${id} 2`
    taken.add(id)
    return { carrier: c, row: { id, title: c.title || c.id, color: color(c), ...given({ icon: c.icon, pattern: c.pattern, patterncolor: c.patterncolor }), visible: true } }
  })
}

const common = get => ['title', 'unit', 'multiply', 'decimals', 'softenColors', 'font', 'backgroundColor'].map(setting => ({ setting, waarde: get(setting) })).filter(s => !blank(s.waarde))

// A bar per block, split by carrier.
export function chartFromTreemap (doc) {
  const series = seriesFrom(doc.carriers.filter(c => doc.values.some(v => v.carrier === c.id)), c => treemapColor(doc, c))
  const bars = doc.blocks.filter(blockIsVisible).map(b => {
    const bar = { title: b.title || b.id, group: b.group || '', ...given({ icon: b.icon }) }
    series.forEach(s => {
      const rows = doc.values.filter(v => v.block === b.id && v.carrier === s.carrier.id && isFiniteNumber(v.value))
      if (!rows.length) return
      bar[s.row.id] = rows.reduce((sum, v) => sum + v.value, 0)
      const own = key => (rows.find(v => !blank(v[key])) || {})[key]
      Object.assign(bar, given({ [iconKey(s.row.id)]: own('icon'), [patternKey(s.row.id)]: own('pattern'), [patternColorKey(s.row.id)]: own('patterncolor') }))
    })
    return bar
  })
  return normalizeDocument({ bars, series: series.map(s => s.row), settings: common(k => treemapSetting(doc, k)) }).doc
}

// A bar per moment, split by carrier, in a group per diagram.
export function chartFromWaterfall (doc) {
  const series = seriesFrom(doc.carriers.filter(c => doc.values.some(v => v.carrier === c.id)), c => waterfallColor(doc, c))
  const bars = doc.diagrams.filter(isVisible).flatMap(d => doc.moments.filter(m => isVisible(m) && m.id).map(m => {
    const bar = { title: m.title || m.id, group: d.title || (doc.diagrams.length > 1 ? d.id : '') }
    series.forEach(s => {
      const rows = doc.values.filter(v => v.diagram === d.id && v.carrier === s.carrier.id)
      const amounts = rows.map(v => v[m.id]).filter(isFiniteNumber)
      if (amounts.length) bar[s.row.id] = amounts.reduce((a, b) => a + b, 0)
      const own = rows.find(v => !blank(v.pattern) || !blank(v.patterncolor)) || {}
      Object.assign(bar, given({ [patternKey(s.row.id)]: own.pattern, [patternColorKey(s.row.id)]: own.patterncolor }))
    })
    return bar
  }))
  const settings = common(k => waterfallSetting(doc, k))
  if (waterfallSetting(doc, 'subtitle')) settings.push({ setting: 'subtitle', waarde: waterfallSetting(doc, 'subtitle') })
  return normalizeDocument({ bars, series: series.map(s => s.row), settings }).doc
}

export function chartFromSankey (doc) {
  return chartFromTreemap(treemapFromSankey(doc).doc)
}

// rows: arrays of cells, the first with the column names. Returns a document, or null when
// there is no column of numbers.
export function chartFromTable (rows) {
  const filled = rows.filter(r => r && r.some(c => !blank(c)))
  const head = filled.findIndex((r, i) => filled[i + 1] && r.filter(c => !blank(c)).length >= 2 && filled.slice(i + 1).some(x => x.some(c => isFiniteNumber(toNumber(c)))))
  if (head < 0) return null
  const width = Math.max(...filled.slice(head).map(r => r.length))
  const names = Array.from({ length: width }, (_, i) => (blank(filled[head][i]) ? '' : String(filled[head][i]).trim()))
  const body = filled.slice(head + 1)
  const numeric = i => { const cells = body.map(r => r[i]).filter(c => !blank(c)); return cells.length > 0 && cells.filter(c => isFiniteNumber(toNumber(c))).length >= cells.length * 0.6 }
  const isNumeric = names.map((_, i) => numeric(i))
  // The names are in the first column of text; a year per row counts as a name as well.
  let nameAt = isNumeric.findIndex((n, i) => !n && body.some(r => !blank(r[i])))
  if (nameAt < 0) nameAt = 0
  const cols = isNumeric.map((n, i) => i).filter(i => isNumeric[i] && i !== nameAt)
  if (!cols.length) return null
  const groupAt = names.findIndex((n, i) => i !== nameAt && !isNumeric[i] && /^(group|groep|category|categorie)$/i.test(n))
  const taken = new Set()
  const ids = new Map(cols.map(i => {
    let id = names[i] || `Series ${i}`
    if (reservedColumn(id)) id = `${id} (series)`
    while (taken.has(id)) id = `${id} 2`
    taken.add(id)
    return [i, id]
  }))
  const bars = body.filter(r => !blank(r[nameAt])).map(r => ({
    title: String(r[nameAt]).trim(),
    group: groupAt >= 0 && !blank(r[groupAt]) ? String(r[groupAt]).trim() : '',
    ...Object.fromEntries(cols.filter(i => !blank(r[i])).map(i => [ids.get(i), toNumber(r[i])]))
  }))
  if (!bars.length) return null
  return normalizeDocument({ bars, series: [], settings: [], columns: { bars: ['title', 'group', ...ids.values()] } }).doc
}
