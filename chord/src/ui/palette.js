// What the palette mode colours in the chord editor: the carriers. Nodes follow theirs.

import { updateCarrier } from '../model/commands.js'
import { carrierColor, isFiniteNumber, scenarioIds } from '../model/schema.js'

export const palette = {
  noun: 'carriers',
  patterns: true,
  light: { nodeColor: '#B9B2A6' },
  dark: { nodeColor: '#8A8378' },
  targets: doc => doc.carriers.map(c => ({
    uid: c._uid, label: c.title || c.id, names: [c.id, c.title], color: carrierColor(doc, c),
    weight: doc.flows.reduce((t, f) => t + (f.carrier === c.id ? scenarioIds(doc).reduce((s, id) => s + (isFiniteNumber(f[id]) && f[id] > 0 ? f[id] : 0), 0) : 0), 0)
  })),
  apply: (doc, changes) => [...changes].reduce((d, [uid, patch]) => updateCarrier(d, uid, patch), doc)
}
