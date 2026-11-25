// Lays out groups › blocks › tiles as one nested treemap in which every tile is on the
// same scale: area per unit is equal everywhere.
//
// Headers and gaps come out of each block's area, which would shrink small blocks most.
// So blocks are re-weighted until their tile area matches their value at one shared
// area per unit. The first pass decides the rows (squarified); later passes keep them
// and only resize, so the result is stable and the same for canvas and export.
// After the treemaps in gu-flux-viewer (MIT, © 2026 entranos).

import { lib } from '../../../shared/src/lib.js'

// Tiles below this share of their block would be 1–2 px slivers that read as borders,
// and blocks below this share of everything can't be drawn to scale under a title of
// fixed height. They are left out of the drawing (not out of totals or tooltips).
export const MIN_TILE_SHARE = 0.005
export const MIN_BLOCK_SHARE = 0.005

const STACK_HYSTERESIS = 1.2

function tileMethod (chart) {
  const d3 = lib.d3
  const squarify = d3.treemapResquarify.ratio(1.3)
  if (chart !== 'bars') return squarify
  // Inside a block, bars stack the tiles as parallel strips: side by side in a wide
  // block, top to bottom in a tall one.
  return (parent, x0, y0, x1, y1) => {
    if (parent.data.kind !== 'block') return squarify(parent, x0, y0, x1, y1)
    const w = x1 - x0
    const h = y1 - y0
    const d = parent.data
    if (w > h * STACK_HYSTERESIS) d.stack = 'side'
    else if (h > w * STACK_HYSTERESIS) d.stack = 'stacked'
    else if (!d.stack) d.stack = w >= h ? 'side' : 'stacked'
    ;(d.stack === 'side' ? d3.treemapDice : d3.treemapSlice)(parent, x0, y0, x1, y1)
  }
}

const tileArea = node => lib.d3.sum(node.leaves(), l => (l.data.kind === 'tile' && l.value > 0 ? Math.max(0, l.x1 - l.x0) * Math.max(0, l.y1 - l.y0) : 0))
const drawnTotal = root => lib.d3.sum(root.leaves(), l => (l.data.kind === 'tile' && l.value > 0 ? l.data.tile.value : 0))

function layoutEqualScale (root, layout, weights) {
  const d3 = lib.d3
  const blocks = root.descendants().filter(n => n.data.kind === 'block')
  const totals = new Map(blocks.map(n => [n.data.key, n.data.block.total]))
  const grandTotal = d3.sum([...totals.values()])
  for (let i = 0; ; i++) {
    root.sum(d => {
      if (d.kind !== 'tile') return 0
      const total = totals.get(d.blockKey)
      if (total < grandTotal * MIN_BLOCK_SHARE || d.tile.value < total * MIN_TILE_SHARE) return 0
      return d.tile.value * (weights.get(d.blockKey) || 1)
    })
    layout(root)
    const drawn = blocks.filter(n => n.value > 0)
    const perUnit = d3.sum(drawn, tileArea) / d3.sum(drawn, n => n.data.block.total)
    const ratios = drawn.map(n => [n, tileArea(n) / (n.data.block.total * perUnit)])
    if (i === 80 || ratios.every(([, r]) => Math.abs(1 - r) < 0.004)) break
    // Damped so blocks sharing a row don't push each other back and forth; a block
    // squeezed below its title height has no tile area yet and is grown until it does.
    ratios.forEach(([n, r]) => {
      const factor = r > 0 ? Math.pow(r, -0.8) : 2
      weights.set(n.data.key, Math.max(0.02, Math.min(50, (weights.get(n.data.key) || 1) * factor)))
    })
  }
}

// model: buildModel(doc). Returns { groups, blocks, tiles, width, height, perUnit, skipped }
// with x0…y1 boxes starting at (0, 0); or null when there is nothing to draw.
//   pad: { groupGap, groupLabel, blockGap, blockHead, tileGap }
//   areaPerUnit: draw at this scale instead of filling width × height
export function layoutTreemap (model, { width, height, chart, pad, areaPerUnit = null, hasGroupLabel = () => true }) {
  const d3 = lib.d3
  if (!model.blocks.length || !(model.total > 0) || width < 20 || height < 20) return null
  const root = d3.hierarchy({
    kind: 'root',
    children: model.groups.map(g => ({
      kind: 'group',
      group: g,
      children: g.blocks.map(b => ({
        kind: 'block',
        key: b.key,
        block: b,
        children: b.tiles.map(t => ({ kind: 'tile', tile: t, blockKey: b.key }))
      }))
    }))
  })
  const layout = d3.treemap()
    .tile(tileMethod(chart))
    .size([width, height])
    .paddingInner(n => (n.depth === 0 ? pad.groupGap : n.depth === 1 ? pad.blockGap : pad.tileGap))
    .paddingTop(n => (n.depth === 1 && hasGroupLabel(n.data.group) ? pad.groupLabel : n.depth === 2 ? pad.blockHead : 0))
  const weights = new Map()
  layoutEqualScale(root, layout, weights)

  if (areaPerUnit > 0) {
    // Headers and gaps keep their size, so area doesn't follow the size directly: bisect
    // on the size and keep the closest fit.
    const target = areaPerUnit * drawnTotal(root)
    const error = f => {
      layout.size([Math.max(40, width * f), Math.max(40, height * f)])
      layoutEqualScale(root, layout, weights)
      return tileArea(root) / target - 1
    }
    let best = { f: 1, err: Math.abs(tileArea(root) / target - 1) }
    const attempt = f => { const err = error(f); if (Math.abs(err) < best.err) best = { f, err: Math.abs(err) }; return err }
    let lo = 0.05
    let hi = 1
    while (hi < 16 && tileArea(root) < target) { lo = hi; hi *= 2; attempt(hi) }
    for (let i = 0; i < 18 && best.err >= 0.002; i++) {
      const f = (lo + hi) / 2
      if (attempt(f) > 0) hi = f
      else lo = f
    }
    error(best.f)
  }

  const cents = v => Math.round(v * 100) / 100
  const box = n => ({ x0: cents(n.x0), y0: cents(n.y0), x1: cents(n.x1), y1: cents(n.y1) })
  const shown = n => n.value > 0 && n.x1 > n.x0 && n.y1 > n.y0
  const [w, h] = layout.size()
  const nodes = root.descendants()
  const skipped = nodes.filter(n => n.data.kind === 'tile' && !shown(n)).map(n => n.data.tile)
  return {
    width: w,
    height: h,
    perUnit: tileArea(root) / drawnTotal(root),
    groups: nodes.filter(n => n.data.kind === 'group' && shown(n)).map(n => ({ ...box(n), group: n.data.group })),
    blocks: nodes.filter(n => n.data.kind === 'block' && shown(n)).map(n => ({
      ...box(n),
      block: n.data.block,
      tiles: (n.children || []).filter(shown).map(t => ({ ...box(t), tile: t.data.tile }))
    })),
    skipped
  }
}
