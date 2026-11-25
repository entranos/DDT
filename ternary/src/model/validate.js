// Data checks behind the Issues panel. Runs after every edit.
// Issue: { key, severity: 'error'|'warning'|'info', message, targets: [{kind, uid}], fix? }

import { isFiniteNumber } from './schema.js'

const blank = v => v === undefined || v === null || String(v).trim() === ''
const row = i => i + 2 // spreadsheet row: row 1 is the header

export function validateDocument (doc) {
  const issues = []
  const add = (severity, key, message, targets = [], fix) => issues.push({ severity, key, message, targets, fix })

  // Corners
  const corners = new Map()
  doc.axes.forEach(a => corners.set(a.corner, (corners.get(a.corner) || 0) + 1))
  if (doc.axes.length !== 3 || ['left', 'right', 'bottom'].some(c => corners.get(c) !== 1)) {
    add('error', 'axes-corners', `A ternary diagram needs three corners (top left, top right, bottom); this one has ${doc.axes.length}.`, doc.axes.map(a => ({ kind: 'axis', uid: a._uid })))
  }
  const axisIds = new Map()
  doc.axes.forEach(a => axisIds.set(a.id, (axisIds.get(a.id) || 0) + 1))
  doc.axes.forEach(a => {
    if (blank(a.id)) add('error', `axis-noid-${a._uid}`, `The ${a.corner} corner has no ID. Its ID is the column name in the points table.`, [{ kind: 'axis', uid: a._uid }])
    else if (axisIds.get(a.id) > 1) add('error', `axis-dup-${a._uid}`, `Two corners use the column "${a.id}". Give each its own.`, [{ kind: 'axis', uid: a._uid }])
  })

  // Series
  const idCount = new Map()
  doc.series.forEach(s => idCount.set(s.id, (idCount.get(s.id) || 0) + 1))
  doc.series.forEach((s, i) => {
    const t = [{ kind: 'series', uid: s._uid }]
    if (blank(s.id)) add('error', `series-noid-${s._uid}`, `Series on row ${row(i)} has no ID.`, t)
    else if (idCount.get(s.id) > 1) add('error', `series-dup-${s._uid}`, `Series ID "${s.id}" is used ${idCount.get(s.id)} times (row ${row(i)}).`, t)
  })

  // Points
  const ids = new Set(doc.series.map(s => s.id))
  const seen = new Map()
  const usedSeries = new Set()
  doc.points.forEach((p, i) => {
    const t = [{ kind: 'point', uid: p._uid }]
    const name = `Point on row ${row(i)}${blank(p.series) ? '' : ` (${p.series}${blank(p.year) ? '' : `, ${p.year}`})`}`
    if (blank(p.series)) add('error', `point-noseries-${p._uid}`, `${name} has no series.`, t)
    else if (!ids.has(p.series)) add('error', `point-series-${p._uid}`, `${name} belongs to series "${p.series}", which does not exist.`, t, { label: 'Add the series', action: 'addMissingSeries' })
    else usedSeries.add(p.series)
    const missing = doc.axes.filter(a => blank(p[a.id]))
    const bad = doc.axes.filter(a => !blank(p[a.id]) && !isFiniteNumber(p[a.id]))
    const negative = doc.axes.filter(a => isFiniteNumber(p[a.id]) && p[a.id] < 0)
    if (missing.length) add('error', `point-missing-${p._uid}`, `${name} has no value for ${missing.map(a => a.label).join(', ')}.`, t)
    if (bad.length) add('error', `point-bad-${p._uid}`, `${name}: ${bad.map(a => `${a.label} "${p[a.id]}"`).join(', ')} is not a number.`, t)
    if (negative.length) add('error', `point-negative-${p._uid}`, `${name} has a negative value for ${negative.map(a => a.label).join(', ')}.`, t)
    if (!missing.length && !bad.length && !negative.length && doc.axes.length && doc.axes.every(a => p[a.id] === 0)) add('error', `point-zero-${p._uid}`, `${name} has only zeros, so its shares can't be worked out.`, t)
    if (blank(p.year)) add('warning', `point-noyear-${p._uid}`, `${name} has no year; it is placed after the others.`, t)
    else if (!isFiniteNumber(p.year)) add('warning', `point-year-${p._uid}`, `${name}: the year "${p.year}" is not a number.`, t)
    else {
      const key = `${p.series}\u0000${p.year}`
      if (!seen.has(key)) seen.set(key, [])
      seen.get(key).push({ p, i })
    }
  })
  seen.forEach(list => {
    if (list.length < 2) return
    add('warning', `point-dup-${list[0].p._uid}`, `${list[0].p.series} has ${list.length} points for ${list[0].p.year} (rows ${list.map(x => row(x.i)).join(', ')}).`, list.map(x => ({ kind: 'point', uid: x.p._uid })))
  })

  const empty = doc.series.filter(s => !blank(s.id) && !usedSeries.has(s.id))
  if (empty.length) {
    add('info', 'series-empty', `${empty.length} series ${empty.length > 1 ? 'have' : 'has'} no points: ${empty.slice(0, 4).map(s => `"${s.title || s.id}"`).join(', ')}${empty.length > 4 ? ', …' : ''}.`, empty.map(s => ({ kind: 'series', uid: s._uid })), { label: 'Remove them', action: 'purgeEmptySeries' })
  }
  return issues
}

const ORDER = { error: 0, warning: 1, info: 2 }
export const sortIssues = issues => [...issues].sort((a, b) => ORDER[a.severity] - ORDER[b.severity])
