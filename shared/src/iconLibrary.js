// The full Tabler Icons set (MIT, see ../icons/tabler-LICENSE.txt): thousands of line
// icons on a 24×24 grid. The data file is large, so it is loaded the first time a
// diagram or the icon picker needs it. Icons are stored in files as "tabler:<name>".

const DATA_URL = new URL('../icons/tabler-outline-3.52.0.json', import.meta.url)
export const PREFIX = 'tabler:'

let icons = null // Map name → { name, path, category, words }
let loading = null

export const iconsLoaded = () => !!icons

// data: the parsed data file. Called by the loader, and by tests.
export function setIconData (data) {
  icons = new Map(Object.entries(data.icons).map(([name, [path, category, tags]]) => [name, {
    name, path, category, words: `${name.replace(/-/g, ' ')} ${tags}`.split(' ')
  }]))
  return icons
}

export function loadIcons () {
  if (icons) return Promise.resolve(icons)
  if (!loading) {
    loading = fetch(DATA_URL).then(r => {
      if (!r.ok) throw new Error(`the server answered ${r.status}`)
      return r.json()
    }).then(setIconData).catch(e => { loading = null; throw new Error(`Could not load the icon library: ${e.message}`) })
  }
  return loading
}

// The path of "tabler:<name>" or "<name>", or null (also while the set isn't loaded).
export function libraryPath (value) {
  const icon = icons && icons.get(String(value).trim().replace(PREFIX, '').toLowerCase().replace(/[\s_]+/g, '-'))
  return icon ? icon.path : null
}

// Dutch words for what energy diagrams are about, next to the set's English names.
const DUTCH = {
  zon: 'sun solar', zonnepaneel: 'solar', windmolen: 'windmill turbine', kern: 'atom radioactive', kernenergie: 'atom radioactive', kerncentrale: 'atom radioactive',
  stroom: 'bolt electricity plug', elektriciteit: 'bolt electricity plug', bliksem: 'bolt', stekker: 'plug', accu: 'battery', batterij: 'battery',
  warmte: 'flame heat temperature radiator', vuur: 'flame', vlam: 'flame', koude: 'snowflake', ijs: 'snowflake', thermometer: 'temperature',
  olie: 'barrel droplet oil', vat: 'barrel', druppel: 'droplet', aardgas: 'flame gas', tankstation: 'gas-station', brandstof: 'gas-station fuel', steenkool: 'pick mountain',
  boom: 'tree', blad: 'leaf', plant: 'plant leaf', hout: 'tree wood', biomassa: 'leaf tree plant', landbouw: 'tractor plant', tractor: 'tractor', koe: 'milk', dier: 'paw', mest: 'plant',
  fabriek: 'factory', industrie: 'factory', chemie: 'flask test-pipe', staal: 'hammer crane', huis: 'home', woning: 'home', gebouw: 'building', kantoor: 'building', ziekenhuis: 'hospital', school: 'school', winkel: 'store shop', brug: 'bridge',
  auto: 'car', vrachtwagen: 'truck', bestelwagen: 'truck', bus: 'bus', trein: 'train', fiets: 'bike', schip: 'ship', boot: 'ship sailboat', vliegtuig: 'plane', laadpaal: 'charging', verkeer: 'road car',
  water: 'droplet ripple', zee: 'ripple wave', rivier: 'ripple', aarde: 'world globe', wereld: 'world globe', berg: 'mountain', lucht: 'cloud wind', wolk: 'cloud',
  afval: 'trash recycle', recycling: 'recycle', kringloop: 'recycle', geld: 'coin currency', mensen: 'users', mens: 'user', server: 'server', computer: 'device-desktop', lamp: 'bulb', motor: 'engine', leiding: 'pipeline', buis: 'pipeline', opslag: 'database box', uitvoer: 'package-export arrow', invoer: 'package-import arrow', pijl: 'arrow'
}

// Icons for a search text and/or category, best matches first. Every word must match.
export function findIcons ({ query = '', category = '' } = {}) {
  if (!icons) return []
  const terms = query.trim().toLowerCase().split(/[\s-]+/).filter(Boolean)
  const list = [...icons.values()].filter(i => !category || i.category === category)
  if (!terms.length) return list
  const alternatives = terms.map(t => [t, ...(DUTCH[t] || '').split(/[\s-]/).filter(Boolean)])
  // How well one term matches an icon: its name, a whole word, or the start of a word.
  const rate = (icon, t) => {
    if (icon.name === t) return 4
    const inName = icon.name.split('-')
    if (inName[0] === t) return 3.5
    if (inName.includes(t)) return 3
    if (icon.words.includes(t)) return 2
    if (inName.some(w => w.startsWith(t))) return 1.5
    return t.length > 1 && icon.words.some(w => w.startsWith(t)) ? 1 : 0
  }
  return list.map(icon => {
    const scores = alternatives.map(alts => Math.max(...alts.map((a, i) => (i === 0 ? 1 : 0.95) * rate(icon, a))))
    return { icon, score: scores.every(x => x > 0) ? scores.reduce((a, b) => a + b, 0) : 0 }
  }).filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score || a.icon.name.length - b.icon.name.length || a.icon.name.localeCompare(b.icon.name))
    .map(x => x.icon)
}

export function iconCategories () {
  return icons ? [...new Set([...icons.values()].map(i => i.category).filter(Boolean))].sort() : []
}
