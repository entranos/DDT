// The top of a diagram: its title, subtitle and legend, and where the space below starts.

import { textWidth, round1 } from './svgText.js'
import { layoutLegend, drawLegend } from './legend.js'

// Settings used: title, titleFontSize, titlePositionX/Y, titleColor, subtitle,
// subtitleFontSize, legend ('top' | 'bottom' | 'none').
// Returns { top, bottom, subtitle: { node, box } | null, legend }.
export function drawHeading (root, { get, W, H, k, margin, ink, muted, font, items, icons = true, paint, onChip }) {
  const title = get('title')
  const x = get('titlePositionX')
  const y = get('titlePositionY')
  if (title) {
    root.append('text').attr('class', 'diagram-title').attr('x', x).attr('y', y)
      .attr('font-size', get('titleFontSize')).attr('font-weight', 400).attr('fill', get('titleColor')).text(title)
  }
  let textBottom = title ? y + get('titleFontSize') * 0.3 : 0
  let subtitle = null
  const str = get('subtitle')
  if (str) {
    const px = get('subtitleFontSize')
    const sy = title ? y + px * 1.75 : y
    const node = root.append('text').attr('class', 'diagram-subtitle').attr('x', round1(x)).attr('y', round1(sy)).attr('font-size', round1(px)).attr('font-weight', 400).attr('fill', muted).text(str).node()
    subtitle = { node, box: { x0: x, y0: sy - px, x1: x + textWidth(str, px, 400, font), y1: sy + px * 0.35 } }
    textBottom = sy + px * 0.3
  }
  const place = get('legend')
  const grid = place === 'none' ? null : layoutLegend(items, { width: W - 2 * margin, k: k * 1.1, font, icons })
  let top = margin
  if (textBottom && textBottom < H * 0.35) top = Math.max(margin, textBottom + 24 * k)
  const legendTop = place === 'top' ? top : null
  if (grid && place === 'top') top += grid.height + 26 * k
  const bottom = H - margin - (grid && place === 'bottom' ? grid.height + 26 * k : 0)
  const legend = grid ? drawLegend(root, items, grid, { x: margin, y: legendTop !== null ? legendTop : H - margin - grid.height, ink, icons, paint, onChip }) : []
  return { top, bottom, subtitle, legend }
}
