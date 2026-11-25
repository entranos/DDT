// Data checks behind the Issues panel. Runs after every edit.
// Issue: { key, severity: 'error'|'warning'|'info', message, targets: [{kind, uid}], fix? }

import { isFiniteNumber, isVisible, getSetting, hexColor, reservedColumn, patternKey, patternColorKey } from './schema.js'
import { patternIssues, unknownPatterns } from '../../../shared/src/patterns.js'

const blank = v => v === undefined || v === null || String(v).trim() === ''
const row = i => i + 2 // spreadsheet row: row 1 is the header

export function validateDocument (doc) {
  const issues = []
  const add = (severity, key, message, targets = [], fix) => issues.push({ severity, key, message, targets, fix })

  const count = new Map()
  doc.series.forEach(s => count.set(s.id, (count.get(s.id) || 0) + 1))
  doc.series.forEach((s, i) => {
    const t = [{ kind: 'series', uid: s._uid }]
    if (blank(s.id)) add('error', `series-noid-${s._uid}`, `Series on row ${row(i)} has no ID. Its ID is the column name in the bars table.`, t)
    else if (count.get(s.id) > 1) add('error', `series-dup-${s._uid}`, `Series ID "${s.id}" is used ${count.get(s.id)} times (row ${row(i)}).`, t)
    else if (reservedColumn(s.id)) add('error', `series-reserved-${s._uid}`, `Series ID "${s.id}" is a column of the bars table itself. Give it another one.`, t)
    if (!blank(s.color) && !hexColor(s.color)) add('warning', `series-color-${s._uid}`, `Series "${s.title || s.id}" has a colour that is not a hex code: "${s.color}".`, t)
  })
  doc.bars.forEach((b, i) => {
    const t = [{ kind: 'bar', uid: b._uid }]
    const name = blank(b.title) ? `The bar on row ${row(i)}` : `Bar "${b.title}" (row ${row(i)})`
    if (blank(b.title)) add('warning', `bar-noname-${b._uid}`, `${name} has no name.`, t)
    const bad = doc.series.filter(s => s.id && !blank(b[s.id]) && !isFiniteNumber(b[s.id]))
    if (bad.length) add('error', `bar-nan-${b._uid}`, `${name}: ${bad.map(s => `${s.title || s.id} "${b[s.id]}"`).join(', ')} is not a number.`, t)
    const odd = doc.series.filter(s => s.id && unknownPatterns([b], patternKey(s.id)).length)
    if (odd.length) add('warning', `bar-pattern-${b._uid}`, `${name}: ${odd.map(s => `${s.title || s.id} "${b[patternKey(s.id)]}"`).join(', ')} is not a known pattern.`, t)
    const off = doc.series.filter(s => s.id && !blank(b[patternColorKey(s.id)]) && !hexColor(b[patternColorKey(s.id)]))
    if (off.length) add('warning', `bar-patterncolor-${b._uid}`, `${name}: the second colour of ${off.map(s => s.title || s.id).join(', ')} is not a hex code.`, t)
    if (!blank(b.color) && !hexColor(b.color)) add('warning', `bar-color-${b._uid}`, `${name} has a colour that is not a hex code: "${b.color}".`, t)
  })
  if (getSetting(doc, 'mode') === 'share') {
    const negative = doc.bars.filter(b => isVisible(b) && doc.series.some(s => isVisible(s) && isFiniteNumber(b[s.id]) && b[s.id] < 0))
    if (negative.length) add('warning', 'share-negative', `${negative.length} bar${negative.length > 1 ? 's have' : ' has'} negative amounts; stacked to 100% these count by their size.`, negative.map(b => ({ kind: 'bar', uid: b._uid })))
  }

  const listed = list => `${list.slice(0, 4).map(x => `"${x.title || x.id}"`).join(', ')}${list.length > 4 ? ', …' : ''}`
  const empty = doc.bars.length ? doc.series.filter(s => s.id && isVisible(s) && doc.bars.every(b => blank(b[s.id]))) : []
  if (empty.length) add('info', 'series-empty', `${empty.length} series ha${empty.length > 1 ? 've' : 's'} no values: ${listed(empty)}.`, empty.map(s => ({ kind: 'series', uid: s._uid })), { label: 'Remove', action: 'purgeEmptySeries' })
  if (doc.series.length && !doc.series.some(isVisible)) add('warning', 'no-series', 'Every series is hidden. Show one with its eye in the list.', doc.series.map(s => ({ kind: 'series', uid: s._uid })))
  issues.push(...patternIssues(doc.series, 'series', s => `series "${s.title || s.id}"`), ...patternIssues(doc.bars, 'bar', b => `bar "${b.title}"`))
  return issues
}

const ORDER = { error: 0, warning: 1, info: 2 }
export const sortIssues = issues => [...issues].sort((a, b) => ORDER[a.severity] - ORDER[b.severity])
