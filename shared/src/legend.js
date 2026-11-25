// A legend of colour chips with icons and names, as an even grid: as many columns as the
// widest entry allows, balanced so its rows fill evenly.

import { textWidth, fitText, drawIcon, round1 } from './svgText.js'
import { inkOn } from './color.js'

const CHIP_NEUTRAL = '#E6E2DA' // entries without a colour of their own
const plain = color => color

// items: [{ uid, label, icon: { path } | null, color | null, pattern }]. k: text scale.
// Returns the grid with its height, or null when there is nothing to show.
export function layoutLegend (items, { width, k, font, icons = true }) {
  if (!items.length) return null
  const chip = 18 * k
  const row = 27 * k
  const px = 11 * k
  const gap = 18 * k
  // On a patterned chip an icon would hardly show: then all icons stand beside their chips.
  const beside = icons && items.some(i => i.icon && i.pattern)
  const lead = chip + (beside ? 22 * k : 0) + 8 * k
  const widest = Math.max(...items.map(l => textWidth(l.label, px, 400, font)))
  const itemW = lead + widest + 8 * k
  const room = Math.max(60, width)
  const maxCols = Math.max(1, Math.floor((room + gap) / (itemW + gap)))
  const rows = Math.ceil(items.length / maxCols)
  const cols = Math.ceil(items.length / rows)
  return { chip, row, px, gap, k, font, cols, rows, beside, lead, colW: (room - gap * (cols - 1)) / cols, height: rows * row - (row - chip) }
}

// Draws it at x, y; returns [{ uid, box, chipNode, color, pattern, node }] for the editor's overlay.
export function drawLegend (root, items, grid, { x: x0, y: y0, ink, icons = true, paint = plain, onChip = c => inkOn(c) }) {
  const { chip, row, px, gap, k, font, cols, colW, beside, lead } = grid
  const lg = root.append('g').attr('class', 'legend')
  return items.map((item, i) => {
    const x = x0 + (i % cols) * (colW + gap)
    const y = y0 + Math.floor(i / cols) * row
    const color = item.color || CHIP_NEUTRAL
    const pattern = item.color ? item.pattern || '' : ''
    const chipNode = lg.append('rect').attr('x', round1(x)).attr('y', round1(y)).attr('width', round1(chip)).attr('height', round1(chip)).attr('rx', round1(5 * k)).attr('fill', paint(color, pattern, item.mark))
    if (item.icon && icons) {
      if (beside) drawIcon(lg, item.icon.path, x + chip + 7 * k, y + 1.5 * k, 15 * k, ink, 1.2 * k)
      else drawIcon(lg, item.icon.path, x + 3 * k, y + 3 * k, 12 * k, item.color ? onChip(color) : ink, 1.2 * k)
    }
    const label = fitText(item.label, colW - lead, px, 400, font)
    const node = lg.append('text').attr('class', 'legend-text').attr('data-uid', item.uid).attr('x', round1(x + lead)).attr('y', round1(y + chip / 2 + px * 0.35))
      .attr('font-size', round1(px)).attr('font-weight', 400).attr('text-anchor', 'start').attr('fill', ink).text(label)
    return {
      uid: item.uid,
      color,
      pattern,
      mark: item.mark,
      chipNode: chipNode.node(),
      node: node.node(),
      box: { x0: x - 3 * k, y0: y - 3 * k, x1: Math.min(x + colW, x + lead + textWidth(label, px, 400, font) + 6 * k), y1: y + chip + 3 * k }
    }
  })
}
