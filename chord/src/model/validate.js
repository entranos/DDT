// Data checks behind the Issues panel. Runs after every edit.
// Issue: { key, severity: 'error'|'warning'|'info', message, targets: [{kind, uid}], fix? }

import { isFiniteNumber, hexColor, shownScenario, getSetting } from './schema.js'
import { patternIssues } from '../../../shared/src/patterns.js'

const blank = v => v === undefined || v === null || String(v).trim() === ''
const row = i => i + 2 // spreadsheet row: row 1 is the header

export function validateDocument (doc) {
  const issues = []
  const add = (severity, key, message, targets = [], fix) => issues.push({ severity, key, message, targets, fix })

  ;[['nodes', 'node', 'Node'], ['groups', 'group', 'Group'], ['carriers', 'carrier', 'Carrier'], ['scenarios', 'scenario', 'Scenario']].forEach(([kind, target, name]) => {
    const count = new Map()
    doc[kind].forEach(x => count.set(x.id, (count.get(x.id) || 0) + 1))
    doc[kind].forEach((x, i) => {
      const t = [{ kind: target, uid: x._uid }]
      if (blank(x.id)) add('error', `${target}-noid-${x._uid}`, `${name} on row ${row(i)} has no ID.`, t)
      else if (count.get(x.id) > 1) add('error', `${target}-dup-${x._uid}`, `${name} ID "${x.id}" is used ${count.get(x.id)} times (row ${row(i)}).`, t)
    })
  })
  ;[['nodes', 'node'], ['groups', 'group'], ['carriers', 'carrier']].forEach(([kind, target]) => doc[kind].forEach(x => {
    if (!blank(x.color) && !hexColor(x.color)) add('warning', `${target}-color-${x._uid}`, `The colour of ${target} "${x.title || x.id}" is not a hex code: "${x.color}".`, [{ kind: target, uid: x._uid }])
  }))

  const nodeIds = new Set(doc.nodes.map(n => n.id))
  const carrierIds = new Set(doc.carriers.map(c => c.id))
  const usedNodes = new Set()
  const usedCarriers = new Set()
  doc.flows.forEach((f, i) => {
    const t = [{ kind: 'flow', uid: f._uid }]
    const name = `Flow on row ${row(i)} (${f.source || '?'} → ${f.target || '?'})`
    const missing = ['source', 'target'].filter(k => blank(f[k]))
    if (missing.length) add('error', `flow-missing-${f._uid}`, `${name} has no ${missing.join(' and ')}.`, t)
    const unknown = ['source', 'target'].filter(k => !blank(f[k]) && !nodeIds.has(f[k]))
    if (unknown.length) add('error', `flow-node-${f._uid}`, `${name}: ${unknown.map(k => `"${f[k]}"`).join(' and ')} ${unknown.length > 1 ? 'are' : 'is'} not in the nodes table.`, t, { label: 'Add to nodes', action: 'addMissing' })
    if (blank(f.carrier)) add('warning', `flow-nocarrier-${f._uid}`, `${name} has no carrier.`, t)
    else if (!carrierIds.has(f.carrier)) add('warning', `flow-carrier-${f._uid}`, `${name}: carrier "${f.carrier}" is not in the carriers table.`, t, { label: 'Add to carriers', action: 'addMissing' })
    const bad = doc.scenarios.filter(s => s.id && !blank(f[s.id]) && !isFiniteNumber(f[s.id]))
    if (bad.length) add('error', `flow-nan-${f._uid}`, `${name}: ${bad.map(s => `${s.title || s.id} "${f[s.id]}"`).join(', ')} is not a number.`, t)
    const negative = doc.scenarios.filter(s => s.id && isFiniteNumber(f[s.id]) && f[s.id] < 0)
    if (negative.length) add('warning', `flow-negative-${f._uid}`, `${name} is negative in ${negative.map(s => s.title || s.id).join(', ')} and not drawn there. Swap its source and target instead.`, t)
    usedNodes.add(f.source)
    usedNodes.add(f.target)
    usedCarriers.add(f.carrier)
  })
  doc.details.forEach((d, i) => {
    const t = [{ kind: 'detail', uid: d._uid }]
    if (blank(d.node) || !nodeIds.has(d.node)) add('warning', `detail-node-${d._uid}`, `Detail "${d.title || ''}" (row ${row(i)}): ${blank(d.node) ? 'it has no node' : `node "${d.node}" is not in the nodes table`}.`, t)
    const bad = doc.scenarios.filter(s => s.id && !blank(d[s.id]) && !isFiniteNumber(d[s.id]))
    if (bad.length) add('error', `detail-nan-${d._uid}`, `Detail "${d.title || ''}" (row ${row(i)}): ${bad.map(s => `${s.title || s.id} "${d[s.id]}"`).join(', ')} is not a number.`, t)
  })

  if (doc.settings.scenario && shownScenario(doc) && shownScenario(doc).id !== String(doc.settings.scenario)) add('info', 'scenario-unknown', `Scenario "${doc.settings.scenario}" doesn’t exist; showing ${shownScenario(doc).title || shownScenario(doc).id}.`)
  if (getSetting(doc, 'scaleMode') === 'fixed') {
    const sum = s => doc.flows.reduce((t, f) => t + (isFiniteNumber(f[s.id]) && f[s.id] > 0 ? f[s.id] : 0), 0) * (getSetting(doc, 'multiply') || 1)
    const s = shownScenario(doc)
    if (s && sum(s) > getSetting(doc, 'fullCircle') * 1.000001) add('warning', 'circle-full', 'The flows add up to more than the fixed amount of a full circle, so they are drawn at a smaller scale.', [], { label: 'Use the total instead', action: 'fitCircle' })
  }

  const listed = list => `${list.slice(0, 4).map(x => `"${x.title || x.id}"`).join(', ')}${list.length > 4 ? ', …' : ''}`
  const lonely = doc.nodes.filter(n => !blank(n.id) && !usedNodes.has(n.id))
  if (lonely.length && doc.flows.length) add('info', 'nodes-unused', `${lonely.length} node${lonely.length > 1 ? 's have' : ' has'} no flows and ${lonely.length > 1 ? 'are' : 'is'} left out of exports: ${listed(lonely)}.`, lonely.map(n => ({ kind: 'node', uid: n._uid })), { label: 'Remove', action: 'purgeNodes' })
  const unused = doc.carriers.filter(c => !blank(c.id) && !usedCarriers.has(c.id))
  if (unused.length) add('info', 'carriers-unused', `${unused.length} carrier${unused.length > 1 ? 's are' : ' is'} not used: ${listed(unused)}.`, unused.map(c => ({ kind: 'carrier', uid: c._uid })), { label: 'Remove', action: 'purgeCarriers' })
  const usedGroups = new Set(doc.nodes.map(n => n.group))
  const empty = doc.groups.filter(g => !blank(g.id) && !usedGroups.has(g.id))
  if (empty.length) add('info', 'groups-unused', `${empty.length} group${empty.length > 1 ? 's have' : ' has'} no nodes: ${listed(empty)}.`, empty.map(g => ({ kind: 'group', uid: g._uid })), { label: 'Remove', action: 'purgeGroups' })
  issues.push(...patternIssues(doc.carriers, 'carrier', c => `carrier "${c.title || c.id}"`), ...patternIssues(doc.flows, 'flow', f => `the flow from "${f.source}" to "${f.target}"`))
  return issues
}

const ORDER = { error: 0, warning: 1, info: 2 }
export const sortIssues = issues => [...issues].sort((a, b) => ORDER[a.severity] - ORDER[b.severity])
