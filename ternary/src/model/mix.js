// Turns the document into what is drawn: the corners, each series with its points as
// shares, and the points that can't be placed. A point's shares are its three values
// divided by their sum.

import { isFiniteNumber, seriesIsDashed, seriesIsHighlighted, seriesIsVisible, GROUP_PALETTE } from './schema.js'

// Group colours; a series without its own colour gets its group's hue, shaded by rank.
export function seriesColors (doc) {
  const groups = [...new Set(doc.series.map(s => s.group || s.id))]
  const out = new Map()
  doc.series.forEach(s => {
    const base = /^#[0-9a-f]{6}$/i.test(s.color || '') ? s.color : GROUP_PALETTE[groups.indexOf(s.group || s.id) % GROUP_PALETTE.length]
    if (/^#[0-9a-f]{6}$/i.test(s.color || '')) { out.set(s._uid, s.color); return }
    const siblings = doc.series.filter(x => (x.group || x.id) === (s.group || s.id) && !/^#[0-9a-f]{6}$/i.test(x.color || ''))
    const rank = siblings.indexOf(s)
    out.set(s._uid, siblings.length > 1 ? shade(base, (rank / (siblings.length - 1) - 0.5) * 0.36) : base)
  })
  return out
}

// Lighten (t > 0) or darken (t < 0) a hex colour a little.
export function shade (hex, t) {
  const c = hex.replace('#', '')
  const rgb = [0, 2, 4].map(i => parseInt(c.slice(i, i + 2), 16))
  const mix = rgb.map(v => Math.round(t > 0 ? v + (255 - v) * t : v * (1 + t)))
  return `#${mix.map(v => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('')}`
}

export function buildModel (doc) {
  const byCorner = {}
  doc.axes.forEach(a => { byCorner[a.corner] = a })
  const complete = ['left', 'right', 'bottom'].every(c => byCorner[c])
  const order = { left: byCorner.left, right: byCorner.right, bottom: byCorner.bottom }
  const colors = seriesColors(doc)
  const unplaced = []

  const pointsOf = new Map(doc.series.map(s => [s.id, []]))
  doc.points.forEach((p, index) => {
    const list = pointsOf.get(p.series)
    if (!complete) { unplaced.push({ point: p, reason: 'corners' }); return }
    const values = ['left', 'right', 'bottom'].map(c => p[order[c].id])
    if (values.some(v => !isFiniteNumber(v) || v < 0)) { unplaced.push({ point: p, reason: 'values' }); return }
    const total = values.reduce((a, b) => a + b, 0)
    if (!(total > 0)) { unplaced.push({ point: p, reason: 'zero' }); return }
    if (!list) { unplaced.push({ point: p, reason: 'series' }); return }
    list.push({
      uid: p._uid,
      index,
      year: p.year,
      label: isFiniteNumber(p.year) ? String(p.year) : (p.year === undefined || p.year === null ? '' : String(p.year)),
      values,
      total,
      shares: { left: values[0] / total, right: values[1] / total, bottom: values[2] / total }
    })
  })

  const series = doc.series.map((s, i) => {
    const points = (pointsOf.get(s.id) || []).sort((a, b) => {
      const ya = isFiniteNumber(a.year); const yb = isFiniteNumber(b.year)
      if (ya && yb) return a.year - b.year || a.index - b.index
      return a.index - b.index
    })
    return {
      uid: s._uid,
      id: s.id,
      title: s.title || s.id,
      group: s.group || '',
      color: colors.get(s._uid),
      dashed: seriesIsDashed(s),
      highlight: seriesIsHighlighted(s),
      visible: seriesIsVisible(s),
      index: i,
      points
    }
  })

  return {
    axes: order,
    complete,
    series,
    seriesByUid: new Map(series.map(s => [s.uid, s])),
    pointByUid: new Map(series.flatMap(s => s.points.map(p => [p.uid, { series: s, point: p }]))),
    unplaced
  }
}
