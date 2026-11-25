// The standard colours of the suite: the main colours of the viewer its ternary and treemap
// editors are modelled on (electricity yellow, hydrogen purple, heat rose, methane blue, …),
// in calmer tones that work as fills. What has a known meaning always gets the same colour;
// anything else takes the colours in order, which keeps neighbours apart for colour-blind
// readers too.

import { iconOf } from './icons.js'

const C = {
  blue: '#3B78B0',
  yellow: '#E0A93B',
  green: '#3F9A74',
  purple: '#7862C6',
  coral: '#DD8560',
  deepGreen: '#0A7350',
  sky: '#5AB2DA',
  rose: '#C8586F',
  olive: '#8A9A2B',
  umber: '#6B655C',
  plum: '#9A6FA6',
  sand: '#B9B2A6',
  mint: '#7CC2A0',
  ink: '#4A4641',
  grey: '#9B948A',
  brown: '#9A7A58'
}

// In order, for things without a meaning of their own.
export const STANDARD_COLORS = [C.blue, C.yellow, C.green, C.purple, C.coral, C.deepGreen, C.sky, C.rose, C.olive, C.umber, C.plum, C.sand]

// By meaning: the names of the energy icons, which know many IDs in Dutch and English.
export const STANDARD = [
  { id: 'electricity', label: 'Electricity', color: C.yellow },
  { id: 'hydrogen', label: 'Hydrogen', color: C.purple },
  { id: 'heat', label: 'Heat', color: C.rose },
  { id: 'gas', label: 'Methane', color: C.blue },
  { id: 'biomass', label: 'Biomass', color: C.green },
  { id: 'synthetic', label: 'Synthetic', color: C.coral },
  { id: 'nuclear', label: 'Nuclear', color: C.sky },
  { id: 'wind', label: 'Wind, renewable', color: C.mint },
  { id: 'geothermal', label: 'Geothermal', color: C.deepGreen },
  { id: 'oil', label: 'Oil, fossil', color: C.umber },
  { id: 'coal', label: 'Coal', color: C.ink },
  { id: 'waste', label: 'Waste', color: C.grey },
  { id: 'losses', label: 'Losses', color: C.sand }
]
const COLOR = Object.fromEntries(STANDARD.map(s => [s.id, s.color]))
const BY_ICON = {
  ...COLOR,
  'waste-heat': '#D98A97',
  ammonia: '#9A88D2',
  'crude-oil': '#8C8172',
  biofuel: '#5FA98A',
  'ambient-heat': '#A9A196',
  solar: '#C9B45A',
  sun: '#C9B45A',
  plastic: C.plum,
  methanol: C.brown,
  electrolysis: C.purple
}
// Words without an icon of their own.
const WORDS = {
  losses: 'verlies verliezen loss losses omzettingsverlies omzettingsverliezen',
  wind: 'hernieuwbaar hernieuwbaar_overig renewable renewables duurzaam',
  oil: 'fossiel fossil carbon_fossil koolstof_fossiel',
  biomass: 'carbon_bio_and_syn koolstof_biogeen biogeen bio_en_synthetisch',
  nuclear: 'kern kernenergie uranium',
  hydrogen: 'hydrogen_and_ammonia waterstof_en_ammoniak waterstof_ammoniak',
  coal: 'kolen steenkool'
}
const BY_WORD = new Map(Object.entries(WORDS).flatMap(([id, words]) => words.split(' ').map(w => [w, id])))

const normal = v => String(v ?? '').trim().toLowerCase().replace(/^(mt_|finaal_)/, '').replace(/[\s,&/-]+/g, '_')

// The standard colour of something by what it is called, or null.
export function standardColorOf (...names) {
  for (const n of names) {
    const key = normal(n)
    if (!key) continue
    if (BY_WORD.has(key)) return COLOR[BY_WORD.get(key)]
    const icon = iconOf({ id: key })
    if (icon && BY_ICON[icon.name]) return BY_ICON[icon.name]
  }
  return null
}

// For the i-th of a list, when it has no colour of its own.
export const standardColor = (i, ...names) => standardColorOf(...names) || STANDARD_COLORS[Math.max(0, i) % STANDARD_COLORS.length]

// For a new one: by its name, or the first colour that isn't used yet.
export function nextStandardColor (used, ...names) {
  const taken = new Set(used.map(c => String(c ?? '').toLowerCase()))
  const own = standardColorOf(...names)
  if (own && !taken.has(own.toLowerCase())) return own
  return STANDARD_COLORS.find(c => !taken.has(c.toLowerCase())) || STANDARD_COLORS[used.length % STANDARD_COLORS.length]
}
