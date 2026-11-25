// Line icons on a 24×24 grid, drawn as thin strokes. A row of a table (a block, a carrier,
// a flow) names one in its `icon` column: one of the energy icons here, "tabler:<name>"
// from the full icon library, or an SVG path of its own.
// Most icons come from gu-flux-viewer (MIT, © 2026 entranos).

import { PREFIX, libraryPath, iconsLoaded } from './iconLibrary.js'

const FLAME = 'M12 3c1 3 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3.5 2-4.5 0 2 1 3 2 3 0-3-1-5 1-8.5Z'
const DROP = 'M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11Z'

export const ICONS = {
  industry: 'M3 21V11l5 3v-3l5 3v-3l5 3V4h3v17Z',
  buildings: 'M4 11l8-7 8 7M6 9.5V20h12V9.5M10 20v-5h4v5',
  agriculture: 'M12 21v-9M12 12c0-4.4 3-7 8-7 0 5-3 7-8 7ZM12 15c0-3.3-2.2-5.5-7-5.5 0 4 2.2 5.5 7 5.5Z',
  car: 'M3 15l2-5.5A2 2 0 0 1 6.9 8h10.2a2 2 0 0 1 1.9 1.5L21 15v3h-2.5M5.5 18H3v-3M3 15h18M6 18a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0-3 0M15 18a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0-3 0',
  plane: 'M12 3c1 0 1.5 1 1.5 2v5l7 4v2l-7-2v4l2 1.5V21l-3.5-1-3.5 1v-1.5l2-1.5v-4l-7 2v-2l7-4V5c0-1 .5-2 1.5-2Z',
  ship: 'M3 14h18l-2.5 6h-13ZM6 14V9h12v5M12 9V4',
  'power-plant': 'M5 21c1.5-4.5 1.5-9.5 0-13h8c-1.5 3.5-1.5 8.5 0 13ZM16 21v-9h3v9M3 21h18M6.5 5c.6-1.2 1.8-1.2 2.4 0s1.8 1.2 2.4 0',
  electrolysis: 'M4 9h16v9a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3ZM8.5 4v10M15.5 4v10M11 17a1 1 0 1 0 2 0a1 1 0 1 0-2 0M11.3 12.5a.8.8 0 1 0 1.6 0a.8.8 0 1 0-1.6 0',
  conversion: 'M4 12a8 8 0 0 1 14-5.3M18 3v4h-4M20 12a8 8 0 0 1-14 5.3M6 21v-4h4',
  refinery: 'M9 3h6M10 3v6l-5.5 9.5A2 2 0 0 0 6.2 21h11.6a2 2 0 0 0 1.7-2.5L14 9V3M7.5 15h9',
  'data-centre': 'M4 4h16v6H4ZM4 14h16v6H4ZM7 7h1M7 17h1M12 7h5M12 17h5',
  storage: 'M5 7c0-1.7 3.1-3 7-3s7 1.3 7 3v10c0 1.7-3.1 3-7 3s-7-1.3-7-3ZM5 7c0 1.7 3.1 3 7 3s7-1.3 7-3',
  battery: 'M3 8h15v9H3ZM18 11h3v3h-3M7.5 10.5v4M11.5 10.5v4',
  export: 'M3 12h13M11 7l5 5-5 5M20 4v16',
  electricity: 'M13 3 5 13h6l-1 8 8-10h-6l1-8Z',
  heat: 'M8 20c-2-3 2-5 0-8s2-5 0-8M12 20c-2-3 2-5 0-8s2-5 0-8M16 20c-2-3 2-5 0-8s2-5 0-8',
  'waste-heat': 'M6 20c-2-3 2-5 0-8s2-5 0-8M10 20c-2-3 2-5 0-8s2-5 0-8M14 12h7M18 9l3 3-3 3',
  hydrogen: 'M3.5 5v14M12.5 5v14M3.5 12h9M15.5 14.6c.3-1.3 1.3-2 2.5-2 1.4 0 2.5 1 2.5 2.3 0 1.1-.7 1.9-1.6 2.7L15.5 20h5',
  gas: FLAME,
  oil: DROP,
  'crude-oil': 'M6 4h12M6 20h12M7 4c-1.2 5-1.2 11 0 16M17 4c1.2 5 1.2 11 0 16M6.4 9.5h11.2M6.4 14.5h11.2',
  coal: 'M3 19l2.5-5 3.5 1.5 2.5-4.5 4 2.5 2.5-3.5L21 13v6Z',
  biomass: 'M12 21v-6M12 15c-4 0-7-2.5-7-6a7 6 0 0 1 14 0c0 3.5-3 6-7 6Z',
  biofuel: 'M5 19c0-8 5-14 14-14 0 9-6 14-14 14ZM5 19l7-7',
  ammonia: 'M9.5 11a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0-5 0M12 13.5V17M10 9.2 6.8 6.5M14 9.2l3.2-2.7M11 18.5a1 1 0 1 0 2 0a1 1 0 1 0-2 0M5 5.5a1 1 0 1 0 2 0a1 1 0 1 0-2 0M17 5.5a1 1 0 1 0 2 0a1 1 0 1 0-2 0',
  geothermal: 'M3 20h18M3 16h6M15 16h6M12 20V6M9 9l3-3 3 3',
  'ambient-heat': 'M3 9h11a3 3 0 1 0-3-3M3 15h14a3 3 0 1 1-3 3M3 12h7',
  solar: 'M5.5 5h13l2 10h-17ZM4.5 10h15M12 5v10M9 20h6M12 15v5',
  sun: 'M8 12a4 4 0 1 0 8 0a4 4 0 1 0-8 0M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4',
  wind: 'M12 10v11M9 21h6M11 9a1 1 0 1 0 2 0a1 1 0 1 0-2 0M12 8 10 2.5M13 9.5l5.5 1.5M11.2 9.8 7 14',
  nuclear: 'M10.5 12a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0-3 0M3 12a9 3.5 0 1 0 18 0a9 3.5 0 1 0-18 0M7.5 4.2a9 3.5 60 1 0 9 15.6a9 3.5 60 1 0-9-15.6M7.5 19.8a9 3.5-60 1 0 9-15.6a9 3.5-60 1 0-9 15.6',
  synthetic: 'M12 3l7.8 4.5v9L12 21l-7.8-4.5v-9ZM12 8l3.5 2v4L12 16l-3.5-2v-4Z',
  plastic: 'M10 3h4M10.5 3v3L8 9v10a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2V9l-2.5-3V3M8 13h8',
  waste: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6',
  methanol: DROP + 'M9.5 15h5'
}

// IDs (as used in energy datasets, Dutch and English) that get an icon by themselves.
const ALIASES = {
  industry: 'industrie industrial finaal_industrie',
  buildings: 'gebouwde_omgeving built_environment households huishoudens utiliteit services buildings',
  agriculture: 'landbouw farming',
  car: 'mobiliteit mobiliteit_nationaal transport mobility road',
  plane: 'mobiliteit_internationaal luchtvaart aviation',
  ship: 'scheepvaart shipping bunkers zeevaart',
  'power-plant': 'elektriciteitsproductie power_plants power_generation centrales',
  electrolysis: 'waterstofproductie hydrogen_production elektrolyse',
  conversion: 'waterstofconversie conversie',
  refinery: 'brand_en_grondstofproductie raffinage refining',
  'data-centre': 'datacenters data_centres',
  export: 'uitvoer exports',
  electricity: 'elektriciteit elektronen power stroom',
  heat: 'warmte district_heating',
  'waste-heat': 'restwarmte waste_heat',
  hydrogen: 'waterstof h2',
  gas: 'methane methaan aardgas natural_gas gas_power_fuel_mix',
  oil: 'oil_products olieproducten olie',
  'crude-oil': 'oil_ruw ruwe_aardolie crude',
  coal: 'coal_products kolen',
  biomass: 'biomassa biomassa_ruw',
  biofuel: 'biomassa_product bio biofuels biobrandstoffen',
  ammonia: 'ammoniak',
  geothermal: 'geothermie',
  'ambient-heat': 'omgevingswarmte ambient_heat',
  solar: 'solar_pv zon zon_pv zonne_energie',
  sun: 'solar_thermal zonthermie',
  nuclear: 'uranium kernenergie',
  synthetic: 'synthetisch e_fuels',
  plastic: 'plastics plastic_afval',
  waste: 'non_biogenic_waste waste_mix afval',
  methanol: 'fossil_methanol'
}
const BY_ID = new Map(Object.keys(ICONS).map(n => [n, n]))
Object.entries(ALIASES).forEach(([name, ids]) => ids.split(' ').forEach(id => BY_ID.set(id, name)))

const normal = id => String(id || '').trim().toLowerCase().replace(/[\s-]+/g, '_')

const valueOf = row => String(row.icon ?? '').trim()
const isPath = value => /^m\s*-?[\d.]/i.test(value)
const byId = id => BY_ID.get(normal(id)) || BY_ID.get(normal(id).replace(/_/g, '-'))

// The icon a value names: { name, path }, or null. `name` is null for an own drawing.
export function namedIcon (value) {
  const v = String(value ?? '').trim()
  if (!v || v.toLowerCase() === 'none') return null
  if (ICONS[v]) return { name: v, path: ICONS[v] }
  if (isPath(v)) return { name: null, path: v }
  const name = v.startsWith(PREFIX) ? null : byId(v)
  if (name) return { name, path: ICONS[name] }
  const path = libraryPath(v)
  return path ? { name: v.startsWith(PREFIX) ? v : PREFIX + v, path } : null
}

// The icon a row shows: the one it names, or a fitting one for a well-known ID.
export function iconOf (row) {
  const value = valueOf(row)
  if (value) return namedIcon(value)
  const name = byId(row.id)
  return name ? { name, path: ICONS[name] } : null
}

// Rows whose icon can only come from the library.
const fromLibrary = row => {
  const value = valueOf(row)
  return value !== '' && value.toLowerCase() !== 'none' && !ICONS[value] && !isPath(value) && (value.startsWith(PREFIX) || !byId(value))
}
export const needsLibrary = rows => !iconsLoaded() && rows.some(fromLibrary)

// Rows naming an icon that doesn't exist (known once the library is loaded).
export const unknownIcons = rows => (iconsLoaded() ? rows.filter(r => fromLibrary(r) && !namedIcon(valueOf(r))) : [])

// Library icons these rows use, for the picker.
export const libraryIconsIn = rows => [...new Set(rows.map(valueOf).filter(v => v.startsWith(PREFIX) && libraryPath(v)))]

export const ICON_NAMES = Object.keys(ICONS)
export const iconLabel = name => { const n = name.replace(PREFIX, ''); return n.charAt(0).toUpperCase() + n.slice(1).replace(/-/g, ' ') }
