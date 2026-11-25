// Data checks behind the Issues panel. Runs after every edit.
// Issue: { key, severity: 'error'|'warning'|'info', message, targets: [{kind, uid}], fix? }

import { isFiniteNumber, blockIsVisible } from './schema.js'
import { patternIssues } from '../../../shared/src/patterns.js'

const blank = v => v === undefined || v === null || String(v).trim() === ''
const row = i => i + 2 // spreadsheet row: row 1 is the header

export function validateDocument (doc) {
  const issues = []
  const add = (severity, key, message, targets = [], fix) => issues.push({ severity, key, message, targets, fix })

  ;[['blocks', 'block', 'Block'], ['carriers', 'carrier', 'Carrier']].forEach(([kind, target, name]) => {
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

  const blockIds = new Set(doc.blocks.map(b => b.id))
  const carrierIds = new Set(doc.carriers.map(c => c.id))
  const usedBlocks = new Set()
  const usedCarriers = new Set()
  const seen = new Map()
  doc.values.forEach((v, i) => {
    const t = [{ kind: 'value', uid: v._uid }]
    const name = `Value on row ${row(i)}${blank(v.block) && blank(v.carrier) ? '' : ` (${[v.block, v.carrier].filter(x => !blank(x)).join(', ')})`}`
    const missing = [blank(v.block) && 'block', blank(v.carrier) && 'carrier'].filter(Boolean)
    if (missing.length) add('error', `value-missing-${v._uid}`, `${name} has no ${missing.join(' and no ')}.`, t)
    if (!blank(v.block) && !blockIds.has(v.block)) add('error', `value-block-${v._uid}`, `${name} belongs to block "${v.block}", which does not exist.`, t, { label: 'Add what is missing', action: 'addMissing' })
    if (!blank(v.carrier) && !carrierIds.has(v.carrier)) add('error', `value-carrier-${v._uid}`, `${name} uses carrier "${v.carrier}", which does not exist.`, t, { label: 'Add what is missing', action: 'addMissing' })
    if (blank(v.value)) add('error', `value-none-${v._uid}`, `${name} has no amount.`, t)
    else if (!isFiniteNumber(v.value)) add('error', `value-nan-${v._uid}`, `${name}: "${v.value}" is not a number.`, t)
    else if (v.value < 0) add('error', `value-negative-${v._uid}`, `${name} is negative; a treemap can’t show that.`, t)
    usedBlocks.add(v.block)
    usedCarriers.add(v.carrier)
    if (!blank(v.block) && !blank(v.carrier)) {
      const key = `${v.block}\u0000${v.carrier}\u0000${blank(v.part) ? '' : v.part}`
      if (!seen.has(key)) seen.set(key, [])
      seen.get(key).push({ v, i })
    }
  })
  seen.forEach(list => {
    if (list.length < 2) return
    const { block, carrier, part } = list[0].v
    add('info', `value-dup-${list[0].v._uid}`, `${block}, ${carrier}${blank(part) ? '' : `, ${part}`} appears ${list.length} times (rows ${list.map(x => row(x.i)).join(', ')}); the amounts are added up.`, list.map(x => ({ kind: 'value', uid: x.v._uid })))
  })

  const listed = list => `${list.slice(0, 4).map(x => `"${x.title || x.id}"`).join(', ')}${list.length > 4 ? ', …' : ''}`
  const emptyBlocks = doc.blocks.filter(b => !blank(b.id) && blockIsVisible(b) && !usedBlocks.has(b.id))
  if (emptyBlocks.length) add('info', 'blocks-empty', `${emptyBlocks.length} block${emptyBlocks.length > 1 ? 's have' : ' has'} no values: ${listed(emptyBlocks)}.`, emptyBlocks.map(b => ({ kind: 'block', uid: b._uid })), { label: 'Remove them', action: 'purgeEmptyBlocks' })
  const unused = doc.carriers.filter(c => !blank(c.id) && !usedCarriers.has(c.id))
  if (unused.length) add('info', 'carriers-unused', `${unused.length} carrier${unused.length > 1 ? 's are' : ' is'} not used: ${listed(unused)}.`, unused.map(c => ({ kind: 'carrier', uid: c._uid })), { label: 'Remove them', action: 'purgeUnusedCarriers' })
  issues.push(...patternIssues(doc.carriers, 'carrier', c => `carrier "${c.title || c.id}"`), ...patternIssues(doc.values, 'value', v => `value "${v.block}, ${v.carrier}"`))
  return issues
}

const ORDER = { error: 0, warning: 1, info: 2 }
export const sortIssues = issues => [...issues].sort((a, b) => ORDER[a.severity] - ORDER[b.severity])
