// Makes a treemap from a sankey diagram: a block per node with incoming flows, split by
// the carriers that flow in. Nodes where flows end are drawn; nodes that pass them on
// would count them twice, so they start hidden (the eye in the list shows them).

import { getSetting as sankeySetting } from '../../../sankey/src/model/schema.js'
import { normalizeDocument, isFiniteNumber } from '../model/schema.js'

// A leading "." or "_" in a sankey title only says how to draw its label.
const clean = node => String(node.title || node.id).replace(/^[._]+/, '').trim() || node.id

export function treemapFromSankey (sankey) {
  const nodes = new Map(sankey.nodes.map(n => [n.id, n]))
  const flows = sankey.links.filter(l => isFiniteNumber(l.value) && l.value > 0 && l.target)
  const gives = new Set(flows.map(l => l.source))
  const targets = [...new Set(flows.map(l => l.target))]
  const order = new Map(sankey.nodes.map((n, i) => [n.id, i]))
  targets.sort((a, b) => Number(gives.has(a)) - Number(gives.has(b)) || (order.get(a) ?? 1e9) - (order.get(b) ?? 1e9))
  const title = sankeySetting(sankey, 'title')
  const raw = {
    blocks: targets.map(id => ({ id, title: clean(nodes.get(id) || { id }), group: gives.has(id) ? 'Intermediate' : '', visible: !gives.has(id) })),
    values: flows.map(l => ({ block: l.target, carrier: l.carrier || 'unknown', part: clean(nodes.get(l.source) || { id: l.source || '' }), value: l.value, ...(l.annotate ? { note: l.annotate } : {}), ...(l.icon ? { icon: l.icon } : {}), ...(l.pattern ? { pattern: l.pattern } : {}), ...(l.patterncolor ? { patterncolor: l.patterncolor } : {}) })),
    carriers: sankey.carriers.map(c => ({ id: c.id, title: c.name || c.title || c.id, color: c.color, ...(c.icon ? { icon: c.icon } : {}), ...(c.pattern ? { pattern: c.pattern } : {}), ...(c.patterncolor ? { patterncolor: c.patterncolor } : {}) })),
    settings: [
      { setting: 'title', waarde: title || '' },
      { setting: 'unit', waarde: sankeySetting(sankey, 'unit') || '' },
      { setting: 'multiply', waarde: sankeySetting(sankey, 'scaleDataValue') || 1 }
    ]
  }
  const { doc } = normalizeDocument(raw)
  const hidden = targets.filter(id => gives.has(id)).length
  return { doc, hidden, shown: targets.length - hidden }
}
