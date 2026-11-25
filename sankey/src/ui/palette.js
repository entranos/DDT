// What the palette mode colours in the sankey editor: the carriers.

import { lib } from '../../../shared/src/lib.js'
import { updateCarrier } from '../model/commands.js'
import { isFiniteNumber } from '../model/schema.js'

const hex = color => { const c = lib.d3.color(String(color || '')); return c ? c.formatHex() : '#999999' }

export const palette = {
  noun: 'carriers',
  patterns: true,
  light: { nodeColor: '#333333' },
  dark: { nodeColor: '#E4DFD6' },
  targets: doc => doc.carriers.map(c => ({
    uid: c._uid, label: c.name || c.id, names: [c.id, c.name], color: hex(c.color),
    weight: doc.links.reduce((t, l) => t + (l.carrier === c.id && isFiniteNumber(l.value) ? l.value : 0), 0)
  })),
  apply: (doc, changes) => [...changes].reduce((d, [uid, patch]) => updateCarrier(d, uid, patch), doc)
}
