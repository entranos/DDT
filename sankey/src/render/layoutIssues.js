// Issues that only show up once the diagram is drawn: overlapping labels,
// labels too small to read in the export, and nodes outside the canvas.

import { getSetting } from '../model/schema.js'
import { formatNumber } from '../../../shared/src/format.js'

const MIN_READABLE_PX = 8

export function layoutIssues (doc, layout, labelBoxes) {
  const issues = []
  if (layout.error) {
    issues.push({ severity: 'error', key: 'layout-error', message: `The diagram could not be laid out: ${layout.error.message}. Check the flows listed above.`, targets: [] })
  }

  const names = new Map(layout.nodes.map(n => [n.uid, n.title || n.id]))
  const pairs = []
  for (let i = 0; i < labelBoxes.length; i++) {
    const a = labelBoxes[i]
    for (let j = i + 1; j < labelBoxes.length; j++) {
      const b = labelBoxes[j]
      if (a.x0 < b.x1 - 1 && b.x0 < a.x1 - 1 && a.y0 < b.y1 - 1 && b.y0 < a.y1 - 1) pairs.push([a.uid, b.uid])
    }
  }
  if (pairs.length) {
    const uids = [...new Set(pairs.flat())]
    const shown = pairs.slice(0, 3).map(([a, b]) => `"${names.get(a)}" and "${names.get(b)}"`).join('; ')
    issues.push({
      severity: 'warning',
      key: 'label-overlap',
      message: `${pairs.length} pair${pairs.length > 1 ? 's' : ''} of labels overlap: ${shown}${pairs.length > 3 ? '; …' : ''}. Move the nodes apart or put a label on the other side.`,
      targets: uids.map(uid => ({ kind: 'node', uid }))
    })
  }

  const scale = getSetting(doc, 'scaleCanvas')
  const effective = getSetting(doc, 'labelFontSize') * scale
  if (labelBoxes.length && effective < MIN_READABLE_PX) {
    issues.push({
      severity: 'warning',
      key: 'label-small',
      message: `Labels export at ${formatNumber(effective, 1)} px (label size ${formatNumber(getSetting(doc, 'labelFontSize'), 1)} × output scale ${formatNumber(scale, 2)}), which is hard to read. Raise the label size under Labels and font.`,
      targets: []
    })
  }

  const w = getSetting(doc, 'canvasWidth') / scale
  const h = getSetting(doc, 'canvasHeight') / scale
  const outside = layout.nodes.filter(n => n.value > 0 && (n.x0 < 0 || n.x0 > w || n.y0 < 0 || n.y1 > h))
  if (outside.length) {
    issues.push({
      severity: 'warning',
      key: 'offscreen',
      message: `${outside.length} node${outside.length > 1 ? 's are' : ' is'} outside the canvas and will be cut off in exports: ${outside.slice(0, 3).map(n => `"${n.title || n.id}"`).join(', ')}${outside.length > 3 ? ', …' : ''}.`,
      targets: outside.map(n => ({ kind: 'node', uid: n.uid })),
      fix: { label: 'Move inside', action: 'bringIntoView' }
    })
  }
  return issues
}
