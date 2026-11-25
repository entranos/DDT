// Turns the document into what is drawn: groups of bars, and for every bar its parts, one
// per series, as stretches along the value axis.

import { softColor } from '../../../shared/src/color.js'
import { iconOf, namedIcon } from '../../../shared/src/icons.js'
import { fillOf } from '../../../shared/src/patterns.js'
import { getSetting, isFiniteNumber, isVisible, seriesColor, hexColor, iconKey, patternKey, patternColorKey } from './schema.js'

const own = v => String(v ?? '').trim()

// keepOrder: uids of bars in the order they had, while an amount is being dragged.
export function buildModel (doc, { keepOrder = null } = {}) {
  const multiply = getSetting(doc, 'multiply') || 1
  const mode = getSetting(doc, 'mode')
  const order = getSetting(doc, 'order')
  const soft = c => (getSetting(doc, 'softenColors') ? softColor(c) : c)
  const softMark = f => ({ ...f, mark: f.mark ? soft(f.mark) : null })
  const series = doc.series.filter(s => isVisible(s) && s.id).map(s => ({ uid: s._uid, id: s.id, title: s.title || s.id, color: soft(seriesColor(doc, s)), icon: iconOf({ id: s.id, icon: s.icon }), row: s, ...softMark(fillOf(s)) }))
  const single = series.length === 1

  const bars = doc.bars.filter(isVisible).map(row => {
    const amounts = series.map(s => (isFiniteNumber(row[s.id]) ? row[s.id] * multiply : 0))
    const total = amounts.reduce((a, b) => a + b, 0)
    const whole = amounts.reduce((a, b) => a + Math.abs(b), 0)
    let up = 0
    let down = 0
    const parts = []
    series.forEach((s, i) => {
      const amount = amounts[i]
      // With one series a bar may have a colour of its own.
      const color = single && hexColor(row.color) ? soft(hexColor(row.color)) : s.color
      const value = mode === 'share' ? (whole > 0 ? amount / whole : 0) : amount
      let from = 0
      if (mode !== 'grouped') from = value >= 0 ? up : down
      const to = from + value
      if (mode !== 'grouped') { if (value >= 0) up = to; else down = to } else { up = Math.max(up, to); down = Math.min(down, to) }
      const ownIcon = own(row[iconKey(s.id)])
      parts.push({
        key: `${row._uid}|${s.uid}`,
        barUid: row._uid,
        series: s,
        index: i,
        amount,
        share: whole > 0 ? Math.abs(amount) / whole : 0,
        from,
        to,
        empty: Math.abs(amount) < 1e-12,
        color,
        icon: ownIcon ? namedIcon(ownIcon) : s.icon,
        ...softMark(fillOf({ pattern: row[patternKey(s.id)], patterncolor: row[patternColorKey(s.id)] }, row, s.row)) // pattern, mark
      })
    })
    return { uid: row._uid, row, title: row.title || '', group: row.group || '', note: row.note, icon: own(row.icon) ? namedIcon(row.icon) : iconOf({ id: row.title, icon: '' }), parts, total, whole, up, down }
  })

  const groups = []
  bars.forEach(b => {
    let g = groups.find(x => x.title === b.group)
    if (!g) { g = { title: b.group, bars: [] }; groups.push(g) }
    g.bars.push(b)
  })
  if (keepOrder) groups.forEach(g => g.bars.sort((a, b) => keepOrder.indexOf(a.uid) - keepOrder.indexOf(b.uid)))
  else if (order !== 'listed') groups.forEach(g => g.bars.sort((a, b) => (order === 'largest' ? b.total - a.total : a.total - b.total)))

  const values = bars.flatMap(b => [b.up, b.down])
  return {
    mode,
    single,
    series,
    groups,
    bars: groups.flatMap(g => g.bars),
    multiply,
    max: Math.max(0, ...values),
    min: Math.min(0, ...values),
    barByUid: new Map(bars.map(b => [b.uid, b])),
    partByKey: new Map(bars.flatMap(b => b.parts.map(p => [p.key, p]))),
    // A single series needs no legend: the title says what it is.
    legend: single ? [] : series.map(s => ({ uid: s.uid, label: s.title, icon: s.icon, color: s.color, pattern: s.pattern, mark: s.mark }))
  }
}

// The amount that gives a part this share of its bar, its other parts staying the same.
export function amountForShare (bar, part, share) {
  const rest = bar.whole - Math.abs(part.amount)
  const s = Math.max(0, Math.min(0.97, share))
  return rest > 0 ? (s / (1 - s)) * rest : part.amount
}
