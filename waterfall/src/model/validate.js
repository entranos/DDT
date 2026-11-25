// Data checks behind the Issues panel. Runs after every edit.
// Issue: { key, severity: 'error'|'warning'|'info', message, targets: [{kind, uid}], fix? }

import { isFiniteNumber, isVisible } from './schema.js'
import { patternIssues } from '../../../shared/src/patterns.js'

const blank = v => v === undefined || v === null || String(v).trim() === ''
const row = i => i + 2 // spreadsheet row: row 1 is the header

export function validateDocument (doc) {
  const issues = []
  const add = (severity, key, message, targets = [], fix) => issues.push({ severity, key, message, targets, fix })

  ;[['diagrams', 'diagram', 'Diagram'], ['moments', 'moment', 'Moment'], ['carriers', 'carrier', 'Carrier']].forEach(([kind, target, name]) => {
    const count = new Map()
    doc[kind].forEach(x => count.set(x.id, (count.get(x.id) || 0) + 1))
    doc[kind].forEach((x, i) => {
      const t = [{ kind: target, uid: x._uid }]
      if (blank(x.id)) add('error', `${target}-noid-${x._uid}`, `${name} on row ${row(i)} has no ID.`, t)
      else if (count.get(x.id) > 1) add('error', `${target}-dup-${x._uid}`, `${name} ID "${x.id}" is used ${count.get(x.id)} times (row ${row(i)}).`, t)
    })
  })
  doc.carriers.forEach((c, i) => {
    if (!blank(c.color) && !/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(c.color)) add('warning', `carrier-color-${c._uid}`, `Carrier "${c.title || c.id}" (row ${row(i)}) has a colour that is not a hex code: "${c.color}".`, [{ kind: 'carrier', uid: c._uid }])
  })
  if (doc.moments.filter(isVisible).length === 1) add('info', 'one-moment', 'With one moment there are no steps to show. Add another one, for example a later year.', [])
  if (doc.diagrams.length && !doc.diagrams.some(isVisible)) add('warning', 'no-diagram', 'Every diagram is hidden. Show one with its eye in the list.', doc.diagrams.map(d => ({ kind: 'diagram', uid: d._uid })))

  const diagramIds = new Set(doc.diagrams.map(d => d.id))
  const carrierIds = new Set(doc.carriers.map(c => c.id))
  const usedDiagrams = new Set()
  const usedCarriers = new Set()
  const seen = new Map()
  doc.values.forEach((v, i) => {
    const t = [{ kind: 'value', uid: v._uid }]
    const name = `Values on row ${row(i)}${blank(v.diagram) && blank(v.carrier) ? '' : ` (${[v.diagram, v.carrier].filter(x => !blank(x)).join(', ')})`}`
    if (blank(v.diagram)) add('error', `value-nodiagram-${v._uid}`, `${name} have no diagram.`, t)
    else if (!diagramIds.has(v.diagram)) add('error', `value-diagram-${v._uid}`, `${name} belong to diagram "${v.diagram}", which does not exist.`, t, { label: 'Add what is missing', action: 'addMissing' })
    if (blank(v.carrier)) add('error', `value-nocarrier-${v._uid}`, `${name} have no carrier.`, t)
    else if (!carrierIds.has(v.carrier)) add('error', `value-carrier-${v._uid}`, `${name} use carrier "${v.carrier}", which does not exist.`, t, { label: 'Add what is missing', action: 'addMissing' })
    const bad = doc.moments.filter(m => !blank(v[m.id]) && !isFiniteNumber(v[m.id]))
    if (bad.length) add('error', `value-nan-${v._uid}`, `${name}: ${bad.map(m => `${m.title || m.id} "${v[m.id]}"`).join(', ')} is not a number.`, t)
    usedDiagrams.add(v.diagram)
    usedCarriers.add(v.carrier)
    if (!blank(v.diagram) && !blank(v.carrier)) {
      const key = `${v.diagram}\u0000${v.carrier}`
      if (!seen.has(key)) seen.set(key, [])
      seen.get(key).push({ v, i })
    }
  })
  seen.forEach(list => {
    if (list.length < 2) return
    const { diagram, carrier } = list[0].v
    add('info', `value-dup-${list[0].v._uid}`, `${diagram}, ${carrier} appears ${list.length} times (rows ${list.map(x => row(x.i)).join(', ')}); the amounts are added up.`, list.map(x => ({ kind: 'value', uid: x.v._uid })))
  })

  const listed = list => `${list.slice(0, 4).map(x => `"${x.title || x.id}"`).join(', ')}${list.length > 4 ? ', …' : ''}`
  const empty = doc.values.length ? doc.diagrams.filter(d => !blank(d.id) && isVisible(d) && !usedDiagrams.has(d.id)) : []
  if (empty.length) add('info', 'diagrams-empty', `${empty.length} diagram${empty.length > 1 ? 's have' : ' has'} no values: ${listed(empty)}.`, empty.map(d => ({ kind: 'diagram', uid: d._uid })), { label: 'Remove them', action: 'purgeEmptyDiagrams' })
  const unused = doc.carriers.filter(c => !blank(c.id) && !usedCarriers.has(c.id))
  if (unused.length) add('info', 'carriers-unused', `${unused.length} carrier${unused.length > 1 ? 's are' : ' is'} not used: ${listed(unused)}.`, unused.map(c => ({ kind: 'carrier', uid: c._uid })), { label: 'Remove them', action: 'purgeUnusedCarriers' })
  issues.push(...patternIssues(doc.carriers, 'carrier', c => `carrier "${c.title || c.id}"`), ...patternIssues(doc.values, 'value', v => `values "${v.diagram}, ${v.carrier}"`))
  return issues
}

const ORDER = { error: 0, warning: 1, info: 2 }
export const sortIssues = issues => [...issues].sort((a, b) => ORDER[a.severity] - ORDER[b.severity])
