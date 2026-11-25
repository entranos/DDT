// Reads the waterfall workbooks of the viewer this editor is modelled on. They hold many
// selections, each as sheets with totals per carrier and year:
//   <application>_boven_<sector>_tot, …_midden_…, …_onder_…
// (the sheets without _tot hold the steps, which are the differences between these totals).
// One selection becomes a new diagram: "boven" above, "onder" below.

import { lib } from '../../../shared/src/lib.js'
import { normalizeDocument, isFiniteNumber, toNumber } from '../model/schema.js'

const SHEET = /^(.+?)_(boven|midden|onder)_(.+)_tot$/i
const PLACES = [
  { id: 'boven', title: 'Opbouw', subtitle: 'CO₂-vrij' },
  { id: 'midden', title: 'CC(S)', subtitle: '' },
  { id: 'onder', title: 'Afbouw', subtitle: 'Fossiel' }
]
// Names as in that viewer's menus.
const APPLICATIONS = { alle: 'Alle toepassingen', warmte: 'Warmte', proces: 'Proces', transport: 'Transport', overige: 'Overige' }
const SECTORS = {
  alle: 'Alle sectoren', hh: 'Huishoudens', ut: 'Utiliteit', lb: 'Landbouw', ind_alle: 'Alle industrie', mob_nat: 'Mobiliteit nationaal', mob_int: 'Mobiliteit internationaal', overige: 'Overige',
  ind_ch: 'Chemie', ind_km: 'Kunstmest', ind_fe: 'Ferro', ind_nf: 'Non-ferro', ind_fd: 'Voedsel', ind_ws: 'Afval', ind_ov: 'Industrie overige'
}
const CARRIERS = {
  mt_elektriciteit: ['Elektriciteit', '#F8D377', 'electricity'],
  mt_waterstof: ['Waterstof, ammoniak', '#7555F6', 'hydrogen'],
  mt_warmte: ['Warmte', '#DD5471', 'heat'],
  mt_biomassa: ['Biomassa', '#62D3A4', 'biofuel'],
  mt_synthetisch: ['Synthetisch', '#E99172', 'synthetic'],
  mt_fossiel: ['Olie, kolen, foss. methanol', '#444444', 'oil'],
  mt_methaan: ['Methaan', '#3F88AE', 'gas'],
  mt_aardwarmte: ['Aardwarmte', '#06402B', 'geothermal'],
  mt_omgevingswarmte: ['Omgevingswarmte', '#aaaaaa', 'ambient-heat']
}
const nice = id => { const t = id.replace(/^mt_/, '').replace(/_/g, ' '); return t.charAt(0).toUpperCase() + t.slice(1) }
const named = (map, id) => map[id.toLowerCase()] || nice(id)

export const isTotalsWorkbook = sheetNames => sheetNames.some(n => SHEET.test(n))

// The selections in a workbook: [{ value, label }], the overall one first.
export function selectionsIn (workbook) {
  const found = new Map()
  workbook.SheetNames.forEach(name => {
    const m = SHEET.exec(name)
    if (!m) return
    const value = `${m[1]}\u0000${m[3]}`
    if (!found.has(value)) found.set(value, { value, label: `${named(APPLICATIONS, m[1])} | ${named(SECTORS, m[3])}` })
  })
  return [...found.values()]
}

// The document of one selection.
export function documentFromTotals (workbook, selection) {
  const [app, sector] = selection.split('\u0000')
  const values = []
  const years = []
  const carriers = []
  const diagrams = []
  PLACES.forEach(place => {
    const name = workbook.SheetNames.find(n => n.toLowerCase() === `${app}_${place.id}_${sector}_tot`.toLowerCase())
    if (!name) return
    const rows = lib.XLSX.utils.sheet_to_json(workbook.Sheets[name]).filter(r => r && r.name !== undefined)
    rows.forEach(r => Object.keys(r).forEach(k => { if (k !== 'name' && !years.includes(k)) years.push(k) }))
    if (!rows.some(r => years.some(y => toNumber(r[y])))) return
    diagrams.push({ ...place, visible: true })
    rows.forEach(r => {
      const id = String(r.name).trim()
      if (!carriers.some(c => c.id === id)) {
        const [title, color, icon] = CARRIERS[id.toLowerCase()] || [nice(id), '', '']
        carriers.push({ id, title, color, icon })
      }
      values.push({ diagram: place.id, carrier: id, ...Object.fromEntries(years.map(y => [y, isFiniteNumber(toNumber(r[y])) ? toNumber(r[y]) : 0])) })
    })
  })
  const { doc } = normalizeDocument({
    diagrams,
    moments: years.map(id => ({ id, title: id, visible: true })),
    carriers,
    values,
    settings: [
      { setting: 'title', waarde: 'Watervaldiagram finaal verbruik' },
      { setting: 'subtitle', waarde: `${named(APPLICATIONS, app)} | ${named(SECTORS, sector)}` },
      { setting: 'unit', waarde: 'PJ' },
      { setting: 'decimals', waarde: '0' },
      { setting: 'softenColors', waarde: true }
    ]
  })
  return doc
}
