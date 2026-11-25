// What the palette mode colours in the ternary editor: the series (trajectories).

import { updateSeries } from '../model/commands.js'
import { seriesColors } from '../model/mix.js'
import { seriesIsHighlighted } from '../model/schema.js'

export const palette = {
  noun: 'series',
  patterns: false,
  targets (doc) {
    const colors = seriesColors(doc)
    return doc.series.map(s => ({ uid: s._uid, label: s.title || s.id, names: [s.id, s.title], group: s.group || null, color: colors.get(s._uid), weight: seriesIsHighlighted(s) ? 2 : 1 }))
  },
  apply: (doc, changes) => [...changes].reduce((d, [uid, patch]) => updateSeries(d, uid, patch), doc)
}
