// What the palette mode colours in the waterfall editor: the carriers.

import { updateCarrier } from '../model/commands.js'
import { carrierColor, isFiniteNumber } from '../model/schema.js'

export const palette = {
  noun: 'carriers',
  patterns: true,
  targets: doc => doc.carriers.map(c => ({
    uid: c._uid, label: c.title || c.id, names: [c.id, c.title], color: carrierColor(doc, c),
    weight: doc.values.reduce((t, v) => t + (v.carrier === c.id ? doc.moments.reduce((s, m) => s + (isFiniteNumber(v[m.id]) ? Math.abs(v[m.id]) : 0), 0) : 0), 0)
  })),
  apply: (doc, changes) => [...changes].reduce((d, [uid, patch]) => updateCarrier(d, uid, patch), doc)
}
