// A subtle drop shadow behind the shapes of a diagram: blurred copies of them in a layer
// underneath, cut out where the shapes themselves are, so see-through fills keep their colour.

export const SHADOW_SETTING = { key: 'dropShadow', group: 'fills', type: 'boolean', default: false, label: 'Drop shadow', help: 'A soft shadow behind the shapes.' }

// Adds the layer to `parent`, to be filled with copies of the shapes through add().
// box: the part of the drawing it can fall in, { x, y, width, height }.
export function createShadow (parent, defs, box, { blur = 4, offset = 2.5, strength = 0.22 } = {}) {
  const room = blur * 4 + offset
  const filter = defs.append('filter').attr('id', 'drop-shadow').attr('filterUnits', 'userSpaceOnUse').attr('color-interpolation-filters', 'sRGB')
    .attr('x', box.x - room).attr('y', box.y - room).attr('width', box.width + room * 2).attr('height', box.height + room * 2)
  filter.append('feGaussianBlur').attr('in', 'SourceAlpha').attr('stdDeviation', blur).attr('result', 'blurred')
  filter.append('feOffset').attr('in', 'blurred').attr('dx', 0).attr('dy', offset).attr('result', 'moved')
  filter.append('feComposite').attr('in', 'moved').attr('in2', 'SourceAlpha').attr('operator', 'out')
  // A viewer without filters shows the bare copies: hidden behind the shapes, and faint.
  const layer = parent.append('g').attr('class', 'shadow').attr('opacity', strength).attr('filter', 'url(#drop-shadow)').attr('fill', '#000000')
  return {
    layer,
    rect: (x0, y0, x1, y1, r = 0) => layer.append('rect').attr('x', x0).attr('y', y0).attr('width', Math.max(0, x1 - x0)).attr('height', Math.max(0, y1 - y0)).attr('rx', r || null),
    path: d => layer.append('path').attr('d', d)
  }
}
