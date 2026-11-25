// What the palette mode colours in the bar chart editor: the series, or with a single one
// the bars.

import { updateSeries, updateBar } from '../model/commands.js'
import { isVisible, isFiniteNumber, seriesColor, hexColor } from '../model/schema.js'

const only = doc => { const shown = doc.series.filter(s => isVisible(s) && s.id); return shown.length === 1 ? shown[0] : null }

export const palette = {
  noun: 'series',
  nounFor: doc => (only(doc) ? 'bars' : 'series'),
  patterns: true,
  grouped: false,
  targets (doc) {
    const single = only(doc)
    if (single) {
      return doc.bars.filter(isVisible).map(b => ({
        uid: b._uid, label: [b.title, b.group].filter(Boolean).join(', ') || '(no name)', names: [b.title], group: b.group || null, color: hexColor(b.color) || seriesColor(doc, single), weight: isFiniteNumber(b[single.id]) ? b[single.id] : 0
      }))
    }
    return doc.series.filter(s => s.id).map(s => ({
      uid: s._uid, label: s.title || s.id, names: [s.id, s.title], color: seriesColor(doc, s),
      weight: doc.bars.reduce((t, b) => t + (isVisible(b) && isFiniteNumber(b[s.id]) ? Math.abs(b[s.id]) : 0), 0)
    }))
  },
  apply: (doc, changes) => [...changes].reduce((d, [uid, patch]) => (d.series.some(s => s._uid === uid) ? updateSeries(d, uid, patch) : updateBar(d, uid, patch)), doc)
}
