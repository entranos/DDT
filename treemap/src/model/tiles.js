// Turns the document into what is drawn: groups › blocks › tiles, for the chosen view.
//   per block    a block per block, a tile per carrier, coloured by carrier
//   per carrier  a block per carrier, a tile per block, in shades of the carrier's colour

import { lib } from '../../../shared/src/lib.js'
import { getSetting, isFiniteNumber, blockIsVisible, carrierColor } from './schema.js'
import { iconOf, namedIcon } from '../../../shared/src/icons.js'
import { softColor } from '../../../shared/src/color.js'
import { fillOf } from '../../../shared/src/patterns.js'

// Per carrier, blocks are told apart by tints and shades of the carrier's own colour:
// mixed toward ink for the first, toward white for the last. Mixing (rather than
// shifting HSL lightness) keeps dark steps from turning oversaturated.
const SHADE_DARK = 0.22
const SHADE_LIGHT = 0.55
export function shadeOf (base, i, count) {
  if (!(count >= 2)) return base
  const v = -SHADE_DARK + (i / (count - 1)) * (SHADE_DARK + SHADE_LIGHT)
  return v < 0 ? lib.d3.interpolateLab(base, '#3A3632')(-v) : lib.d3.interpolateLab(base, '#FFFFFF')(v)
}

export function buildModel (doc) {
  const multiply = getSetting(doc, 'multiply') || 1
  const perBlock = getSetting(doc, 'view') === 'block'
  const bySize = getSetting(doc, 'order') === 'size'
  const soften = getSetting(doc, 'softenColors')
  const softMark = f => ({ ...f, mark: f.mark && soften ? softColor(f.mark) : f.mark })
  const blocks = doc.blocks.filter(blockIsVisible)
  const blockById = new Map(blocks.map(b => [b.id, b]))
  const anyBlock = new Set(doc.blocks.map(b => b.id))
  const carrierById = new Map(doc.carriers.map(c => [c.id, c]))
  const colors = new Map(doc.carriers.map(c => [c.id, soften ? softColor(carrierColor(doc, c)) : carrierColor(doc, c)]))

  // Values per block and carrier; rows for the same pair are parts of one tile.
  const cells = new Map()
  const unplaced = []
  doc.values.forEach(v => {
    if (!isFiniteNumber(v.value) || v.value < 0) { unplaced.push({ value: v, reason: 'value' }); return }
    if (!anyBlock.has(v.block) || !carrierById.has(v.carrier)) { unplaced.push({ value: v, reason: 'missing' }); return }
    if (v.value === 0 || !blockById.has(v.block)) return
    const key = `${v.block}\u0000${v.carrier}`
    if (!cells.has(key)) cells.set(key, { key, blockId: v.block, carrierId: v.carrier, value: 0, uids: [], parts: [] })
    const cell = cells.get(key)
    cell.value += v.value * multiply
    cell.uids.push(v._uid)
    if (!cell.icon) cell.icon = String(v.icon ?? '').trim()
    if (!cell.pattern) cell.pattern = String(v.pattern ?? '').trim()
    if (!cell.patterncolor) cell.patterncolor = String(v.patterncolor ?? '').trim()
    cell.parts.push({ uid: v._uid, label: v.part === undefined || v.part === null ? '' : String(v.part), value: v.value * multiply, note: v.note })
  })

  const tileOf = (cell, color) => {
    const block = blockById.get(cell.blockId)
    const carrier = carrierById.get(cell.carrierId)
    const shown = perBlock ? carrier : block
    return {
      kind: 'tile',
      key: cell.key,
      uid: cell.uids[0],
      uids: cell.uids,
      value: cell.value,
      parts: [...cell.parts].sort((a, b) => b.value - a.value),
      blockUid: block._uid,
      carrierUid: carrier._uid,
      label: shown.title || shown.id,
      icon: cell.icon ? namedIcon(cell.icon) : iconOf(shown),
      ...softMark(fillOf(cell, carrier)), // pattern, mark
      highlight: shown._uid, // tiles for the same carrier (per carrier: block) light up together
      color
    }
  }
  const container = (row, tiles) => {
    const total = tiles.reduce((s, t) => s + t.value, 0)
    if (bySize) tiles.sort((a, b) => b.value - a.value)
    return { kind: 'block', key: row._uid, uid: row._uid, title: row.title || row.id, icon: iconOf(row), total, tiles }
  }
  const sortBlocks = list => (bySize ? [...list].sort((a, b) => b.total - a.total) : list)

  let groups
  if (perBlock) {
    groups = []
    blocks.forEach(b => {
      const tiles = doc.carriers.map(c => cells.get(`${b.id}\u0000${c.id}`)).filter(Boolean).map(cell => tileOf(cell, colors.get(cell.carrierId)))
      if (!tiles.length) return
      const name = b.group || ''
      let g = groups.find(x => x.title === name)
      if (!g) { g = { kind: 'group', key: `group:${name}`, title: name, blocks: [] }; groups.push(g) }
      g.blocks.push(container(b, tiles))
    })
    groups.forEach(g => { g.blocks = sortBlocks(g.blocks) })
  } else {
    const list = doc.carriers.map(c => {
      const own = blocks.map(b => cells.get(`${b.id}\u0000${c.id}`)).filter(Boolean)
      return own.length ? container(c, own.map((cell, i) => tileOf(cell, shadeOf(colors.get(c.id), i, own.length)))) : null
    }).filter(Boolean)
    groups = list.length ? [{ kind: 'group', key: 'group:', title: '', blocks: sortBlocks(list) }] : []
  }
  groups.forEach(g => { g.total = g.blocks.reduce((s, b) => s + b.total, 0) })
  const allBlocks = groups.flatMap(g => g.blocks)
  const tiles = allBlocks.flatMap(b => b.tiles)

  // Legend: the carriers (per block view) or blocks (per carrier view) that are drawn.
  const drawn = new Set(tiles.map(t => t.highlight))
  const legend = (perBlock ? doc.carriers : blocks).filter(x => drawn.has(x._uid)).map(x => ({
    uid: x._uid, label: x.title || x.id, icon: iconOf(x), color: perBlock ? colors.get(x.id) : null, ...(perBlock ? softMark(fillOf(x)) : { pattern: '', mark: null })
  }))

  return {
    perBlock,
    groups,
    blocks: allBlocks,
    tiles,
    total: groups.reduce((s, g) => s + g.total, 0),
    legend,
    blockByUid: new Map(allBlocks.map(b => [b.uid, b])),
    tileByUid: new Map(tiles.flatMap(t => t.uids.map(u => [u, t]))),
    blockOfTile: new Map(allBlocks.flatMap(b => b.tiles.map(t => [t.key, b]))),
    colors,
    unplaced
  }
}
