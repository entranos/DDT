import './setup.mjs'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { normalizeDocument, emptyDocument, getSetting, shownScenario } from '../chord/src/model/schema.js'
import * as cmd from '../chord/src/model/commands.js'
import { buildModel, layoutChords, crossings, untangle } from '../chord/src/model/chords.js'
import { validateDocument } from '../chord/src/model/validate.js'
import { ribbonPath, textArc, fitCircle, spreadLabels } from '../chord/src/render/layout.js'
import { readDocument, writeDocument } from '../chord/src/io/formats.js'
import { templateWorkbook, starterDocument } from '../chord/src/io/template.js'
import { readDocument as readSankey } from '../sankey/src/io/formats.js'
import { readDocument as readTreemap } from '../treemap/src/io/formats.js'

const require = createRequire(import.meta.url)
globalThis.d3 = require('../shared/vendor/d3-7.9.0.min.js')
const XLSX = globalThis.XLSX
const bytes = data => (typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data))
const book = sheets => { const wb = XLSX.utils.book_new(); Object.entries(sheets).forEach(([n, rows]) => XLSX.utils.book_append_sheet(wb, Array.isArray(rows[0]) ? XLSX.utils.aoa_to_sheet(rows) : XLSX.utils.json_to_sheet(rows), n)); return bytes(XLSX.write(wb, { bookType: 'xlsx', type: 'array' })) }
const TAU = Math.PI * 2

const make = (settings = []) => normalizeDocument({
  flows: [
    { source: 'a', target: 'c', carrier: 'gas', 2030: 10, 2050: 4 }, { source: 'a', target: 'd', carrier: 'gas', part: 'x', 2030: 5, 2050: 1 }, { source: 'a', target: 'd', carrier: 'gas', part: 'y', 2030: 3 },
    { source: 'b', target: 'c', carrier: 'heat', 2030: 2, 2050: 8, pattern: 'dots' }
  ],
  nodes: [{ id: 'a', group: 'g1' }, { id: 'b', group: 'g1' }, { id: 'c', group: 'g2', title: 'Cee' }, { id: 'd', group: 'g2' }],
  groups: [{ id: 'g1', title: 'Supply' }, { id: 'g2', title: 'Use', place: 'inside' }],
  carriers: [{ id: 'gas', color: '#3B78B0', pattern: 'diagonal', patterncolor: '#ff0000' }, { id: 'heat', color: '#C8586F' }],
  scenarios: [{ id: '2030' }, { id: '2050' }],
  details: [{ node: 'a', label: 'Of which', 2030: 7, 2050: 0 }],
  settings
}).doc

test('a plain table of flows gives nodes, carriers and one scenario', () => {
  const { doc } = normalizeDocument({ flows: [{ source: 'x', target: 'y', carrier: 'c', value: '1,5' }, { source: 'y', target: 'z', value: 2 }] })
  assert.deepEqual(doc.nodes.map(n => n.id), ['x', 'y', 'z'])
  assert.deepEqual(doc.scenarios.map(s => s.id), ['value'])
  assert.equal(doc.flows[0].value, 1.5)
  assert.deepEqual(doc.carriers.map(c => c.id), ['c'])
  assert.equal(emptyDocument().scenarios.length, 1)
})

test('groups of nodes can come from the flows', () => {
  const { doc } = normalizeDocument({ flows: [{ source: 'x', sourceGroup: 'S', target: 'y', targetGroup: 'T', carrier: 'c', value: 1 }] })
  assert.deepEqual(doc.nodes.map(n => n.group), ['S', 'T'])
  assert.deepEqual(doc.groups.map(g => g.id), ['S', 'T'])
})

test('rows with the same source, target and carrier are one ribbon', () => {
  const m = buildModel(make())
  assert.equal(m.ribbons.length, 3)
  const r = m.ribbons.find(x => x.target === 'd')
  assert.deepEqual([r.value, r.uids.length, r.parts.map(p => p.label)], [8, 2, ['x', 'y']])
  assert.equal(m.total, 20)
  assert.equal(m.largest, 20)
  assert.deepEqual(m.nodes.map(n => [n.id, n.out, n.into]), [['a', 18, 0], ['b', 2, 0], ['c', 0, 12], ['d', 0, 8]])
})

test('scenarios: one is shown, the largest sets the scale', () => {
  const doc = cmd.showScenario(make(), '2050')
  assert.equal(shownScenario(doc).id, '2050')
  const m = buildModel(doc)
  assert.deepEqual([m.total, m.largest], [13, 20])
  assert.equal(m.nodes[0].details.length, 0, 'a detail of zero is left out')
  assert.equal(buildModel(make()).nodes[0].details[0].title, 'Of which')
})

test('colours: a node takes its carrier’s when it has only one, or its own', () => {
  const doc = make()
  const m = buildModel(doc)
  assert.deepEqual(m.nodes.map(n => n.color), ['#3B78B0', '#C8586F', getSetting(doc, 'nodeColor'), '#3B78B0'])
  assert.deepEqual(m.ribbons.map(r => [r.pattern, r.mark]), [['diagonal', '#ff0000'], ['diagonal', '#ff0000'], ['dots', null]])
  const own = buildModel(cmd.updateNode(doc, doc.nodes[0]._uid, { color: '#123456' }))
  assert.equal(own.nodes[0].color, '#123456')
  assert.equal(own.nodes[0].pattern, '')
})

test('hidden nodes and carriers leave out their flows', () => {
  let doc = make()
  doc = cmd.updateCarrier(doc, doc.carriers[1]._uid, { visible: 'No' })
  assert.equal(buildModel(doc).total, 18)
  doc = cmd.updateNode(doc, doc.nodes[3]._uid, { visible: false })
  assert.deepEqual(buildModel(doc).ribbons.map(r => r.target), ['c'])
})

test('layout: arcs are in proportion, ends fill their node, everything fits the circle', () => {
  const m = buildModel(make())
  const l = layoutChords(m, { spacing: 'spread', groupGap: 0.1, nodeGap: 0.02, full: m.largest })
  const span = id => { const n = l.nodes.get(id); return n.a1 - n.a0 }
  assert.ok(Math.abs(span('a') / span('b') - 9) < 1e-9)
  const total = [...l.nodes.keys()].reduce((t, id) => t + span(id), 0)
  assert.ok(Math.abs(total - (TAU - 2 * 0.1 - 2 * 0.02)) < 1e-9)
  l.nodes.forEach((n, id) => {
    const ends = l.ribbons.flatMap(r => [...(r.ribbon.source === id ? [[r.s0, r.s1]] : []), ...(r.ribbon.target === id ? [[r.t0, r.t1]] : [])]).sort((x, y) => x[0] - y[0])
    assert.ok(Math.abs(ends[0][0] - n.a0) < 1e-9 && Math.abs(ends[ends.length - 1][1] - n.a1) < 1e-9)
    ends.slice(1).forEach((e, i) => assert.ok(Math.abs(e[0] - ends[i][1]) < 1e-9))
  })
})

test('a smaller total leaves space: between groups, or at the end', () => {
  const m = buildModel(cmd.showScenario(make(), '2050'))
  const opts = { groupGap: 0.1, nodeGap: 0.02, full: m.largest }
  const spread = layoutChords(m, { ...opts, spacing: 'spread' })
  const compact = layoutChords(m, { ...opts, spacing: 'compact' })
  const gap = l => l.groups[1].a0 - l.groups[0].a1
  assert.ok(gap(spread) > 0.5 && Math.abs(gap(compact) - 0.1) < 1e-9)
  assert.ok(Math.abs(spread.perUnit - compact.perUnit) < 1e-12)
  const over = layoutChords(m, { ...opts, full: 5 })
  assert.ok(over.overflow && over.full === 13)
})

test('ribbons of a node are ordered by where they go', () => {
  const { doc } = normalizeDocument({ flows: ['b', 'c', 'd'].map((t, i) => ({ source: 'a', target: t, carrier: 'x', value: i + 1 })), nodes: ['a', 'b', 'c', 'd'].map(id => ({ id })) })
  const m = buildModel(doc)
  const order = o => { const l = layoutChords(m, { order: o }); return [...l.ribbons].sort((x, y) => x.s0 - y.s0).map(r => r.ribbon.target).join('') }
  assert.equal(order('untangled'), 'dcb', 'the partner furthest clockwise comes first')
  assert.equal(order('size'), 'dcb')
})

test('two ribbons between the same nodes do not cross', () => {
  const { doc } = normalizeDocument({ flows: [{ source: 'a', target: 'b', carrier: 'x', value: 1 }, { source: 'a', target: 'b', carrier: 'y', value: 1 }, { source: 'b', target: 'a', carrier: 'x', value: 1 }], nodes: [{ id: 'a' }, { id: 'b' }] })
  const l = layoutChords(buildModel(doc), {})
  const at = id => l.ribbons.flatMap((r, i) => [...(r.ribbon.source === id ? [[r.s0, i]] : []), ...(r.ribbon.target === id ? [[r.t0, i]] : [])]).sort((x, y) => x[0] - y[0]).map(x => x[1])
  assert.deepEqual(at('a'), [...at('b')].reverse())
})

test('untangling lowers the cost of crossings', () => {
  const links = [['a', 'x'], ['b', 'y'], ['c', 'z']].map(([source, target]) => ({ source, target, value: 1 }))
  const start = [['a', 'b', 'c'], ['x', 'y', 'z']]
  assert.ok(crossings(start.flat(), links) > 0)
  const nodes = untangle(start, links)
  assert.equal(crossings(nodes.flat(), links), 0)
  assert.deepEqual(nodes.map(g => [...g].sort()), start)
  const four = [['a'], ['b'], ['x'], ['y']]
  const l2 = [{ source: 'a', target: 'x', value: 1 }, { source: 'b', target: 'y', value: 1 }]
  assert.ok(crossings(four.flat(), l2) > 0)
  assert.equal(crossings(untangle(four, l2, { withGroups: true }).flat(), l2), 0)
})

test('renaming and moving nodes, groups and carriers keeps what refers to them', () => {
  let doc = make()
  doc = cmd.updateNode(doc, doc.nodes[0]._uid, { id: 'aa' })
  assert.deepEqual(doc.flows.slice(0, 3).map(f => f.source), ['aa', 'aa', 'aa'])
  assert.equal(doc.details[0].node, 'aa')
  doc = cmd.updateGroup(doc, doc.groups[0]._uid, { id: 'S' })
  assert.equal(doc.nodes[0].group, 'S')
  doc = cmd.updateCarrier(doc, doc.carriers[0]._uid, { id: 'g' })
  assert.equal(doc.flows[0].carrier, 'g')
  const moved = cmd.moveNode(doc, doc.nodes[0]._uid, doc.nodes[3]._uid, true)
  assert.deepEqual(moved.nodes.map(n => [n.id, n.group]).at(-1), ['aa', 'g2'])
  assert.equal(cmd.updateNode(doc, doc.nodes[0]._uid, { id: 'b' }), doc, 'an ID that is taken')
  const grouped = cmd.updateNode(doc, doc.nodes[0]._uid, { group: 'new' })
  assert.ok(grouped.groups.some(g => g.id === 'new'))
})

test('scenario columns: add, insert, rename, delete', () => {
  let doc = make()
  doc = cmd.addScenario(doc)
  assert.deepEqual(doc.scenarios.map(s => s.id), ['2030', '2050', '2070'])
  assert.equal(doc.flows[0]['2070'], 4, 'starts as the one before')
  doc = cmd.addScenario(doc, { near: doc.scenarios[0]._uid, after: true, title: 'Mid' })
  assert.deepEqual(doc.scenarios.map(s => s.id), ['2030', 'Mid', '2050', '2070'])
  doc = cmd.renameScenario(cmd.showScenario(doc, '2030'), doc.scenarios[0]._uid, 'Now')
  assert.ok(doc.flows[0].Now === 10 && !('2030' in doc.flows[0]) && doc.details[0].Now === 7 && doc.settings.scenario === 'Now')
  doc = cmd.deleteItems(doc, { scenarios: [doc.scenarios[0]._uid] })
  assert.ok(!('Now' in doc.flows[0]) && doc.settings.scenario === 'Mid')
  const one = normalizeDocument({ flows: [{ source: 'x', target: 'y', value: 1 }] }).doc
  assert.equal(cmd.deleteItems(one, { scenarios: [one.scenarios[0]._uid] }), one, 'the last one stays')
})

test('amounts of a ribbon change in proportion', () => {
  const doc = make()
  const uids = doc.flows.slice(1, 3).map(f => f._uid)
  assert.deepEqual(cmd.setAmount(doc, uids, '2030', 16).flows.slice(1, 3).map(f => f['2030']), [10, 6])
  assert.deepEqual(cmd.setAmount(doc, [uids[0]], '2030', 9).flows[1]['2030'], 9)
})

test('deleting a node deletes its flows and details; a group leaves its nodes', () => {
  const doc = make()
  const next = cmd.deleteItems(doc, { nodes: [doc.nodes[0]._uid] })
  assert.deepEqual([next.flows.length, next.details.length], [1, 0])
  const less = cmd.deleteItems(doc, { groups: [doc.groups[0]._uid] })
  assert.deepEqual(less.nodes.map(n => n.group), ['', '', 'g2', 'g2'])
})

test('pasted flows bring their nodes, carriers and scenarios', () => {
  const next = cmd.applyRowEdits(make(), 'flows', [], [{ source: 'a', target: 'new', carrier: 'solar', 2030: '4', 2040: '5' }])
  assert.ok(next.nodes.some(n => n.id === 'new') && next.carriers.some(c => c.id === 'solar'))
  assert.deepEqual(next.scenarios.map(s => s.id), ['2030', '2050', '2040'])
  assert.equal(next.flows.at(-1)['2040'], 5)
})

test('checks', () => {
  const { doc } = normalizeDocument({
    flows: [{ source: '', target: 'b', carrier: 'c', value: 1 }, { source: 'a', target: 'b', value: 'lots' }, { source: 'a', target: 'b', carrier: 'c', value: -3, pattern: 'plaid' }],
    nodes: [{ id: 'a' }, { id: 'a' }, { id: '' }, { id: 'lonely', color: 'red' }], groups: [{ id: 'empty' }], carriers: [{ id: 'c' }, { id: 'unused' }], details: [{ node: 'zz', title: 'x' }], settings: [{ setting: 'scenario', waarde: 'zz' }, { setting: 'scaleMode', waarde: 'fixed' }, { setting: 'fullCircle', waarde: 0.5 }]
  })
  const keys = validateDocument(doc).map(i => i.key.replace(/-[a-z]_[a-z0-9]+$/, ''))
  for (const k of ['node-dup', 'node-noid', 'flow-missing', 'flow-nan', 'flow-nocarrier', 'flow-negative', 'node-color', 'detail-node', 'scenario-unknown', 'circle-full', 'nodes-unused', 'carriers-unused', 'groups-unused', 'pattern']) assert.ok(keys.includes(k), `${k} in ${keys}`)
  assert.deepEqual(validateDocument(make()), [])
  assert.deepEqual(validateDocument(starterDocument()), [])
})

test('shapes: ribbons, curved texts, the circle and its labels', () => {
  assert.match(ribbonPath({ s0: 0, s1: 0.5, t0: 2, t1: 2.5 }, { sr: 100, tr: 100, head: 10, bend: 1 }), /^M0,-100A100,100 0 0 1 .*Q0,0 .*L.*L.*Q0,0 0,-100Z$/)
  assert.match(ribbonPath({ s0: 0, s1: 0.5, t0: 2, t1: 2.5 }, { sr: 100, tr: 100 }), /A100,100 0 0 1 .*A100,100/)
  assert.match(textArc(-0.5, 0.5, 100), /0 0 1/)
  assert.match(textArc(Math.PI - 0.5, Math.PI + 0.5, 100), /0 0 0/)
  const c = fitCircle({ x0: 0, y0: 0, x1: 400, y1: 300 }, [{ a: Math.PI / 2, ring: 20, w: 60, h: 20 }], 10)
  assert.ok(c.fits && c.r > 100 && c.r < 140 && c.cx < 200, 'off centre to make room for the label')
  const l = spreadLabels([{ y: 0, h: 20 }, { y: 4, h: 20 }, { y: 8, h: 20 }], { top: -200, bottom: 200, gap: 2 })
  l.slice(1).forEach((x, i) => assert.ok(x.at - l[i].at >= 21.9))
})

test('round trips: xlsx, json and yaml keep rows, extra columns and settings', () => {
  const doc = normalizeDocument({
    flows: [{ source: 'a', target: 'b', carrier: 'c', part: 'p', 2030: 1.5, 2040: 2, extra: 'x' }], nodes: [{ id: 'a', label: 'No', labelx: 12, more: 1 }, { id: 'b', visible: 'No' }], groups: [{ id: 'g', place: 'inside' }],
    carriers: [{ id: 'c', pattern: 'dots', patterncolor: '#111111' }], scenarios: [{ id: '2030' }, { id: '2040' }], details: [{ node: 'a', title: 't', 2030: 4 }], settings: [{ setting: 'spacing', waarde: 'compact' }, { setting: 'arrows', waarde: 'No' }, { setting: 'own', waarde: 'kept' }]
  }).doc
  for (const format of ['xlsx', 'json', 'yaml']) {
    const again = readDocument(`x.${format}`, bytes(writeDocument(doc, format).data))
    assert.ok(!again.asNew)
    const d = again.doc
    assert.deepEqual([d.flows[0].part, d.flows[0]['2030'], d.flows[0]['2040'], d.flows[0].extra], ['p', 1.5, 2, 'x'], format)
    assert.deepEqual([d.nodes[0].labelx, d.nodes[0].more, buildModel(d).nodes.length, d.groups[0].place], [12, 1, 1, 'inside'])
    assert.deepEqual([d.carriers[0].patterncolor, d.details[0]['2030'], d.scenarios.map(s => s.id).join()], ['#111111', 4, '2030,2040'])
    assert.deepEqual([getSetting(d, 'spacing'), getSetting(d, 'arrows'), d.settings.own], ['compact', false, 'kept'])
  }
})

test('a workbook with a sheet of flows per scenario becomes one diagram', () => {
  const r = readDocument('s.xlsx', book({
    config: [['carrier_colors'], ['electricity', '#f0c929'], ['carbon_fossil', '#4e4e4e'], ['carbon_bio_and_syn', '#61D4A4'], ['carrier_labels'], ['electricity', 'Electricity'], ['group_colors'], ['E', '#FFF'], ['chart_config'], ['width', 900], ['height', 800]],
    scenarios: [{ sheet_id: 's1', title: 'A | 2030' }, { sheet_id: 's2', title: 'A | 2050' }],
    s1: [
      { sourceGroup: 'E', targetGroup: 'Finaal verbruik', source: 'Elektriciteit', target: 'Finaal verbruik', carrier: 'electricity', sector: 'homes', value: 10 },
      { sourceGroup: 'E', targetGroup: 'Finaal verbruik', source: 'Elektriciteit', target: 'Finaal verbruik', carrier: 'electricity', sector: 'industry', value: 5 },
      { sourceGroup: 'C', targetGroup: 'E', source: 'mix_c', target: '_E', carrier: 'carbon_fossil_and_bio_and_syn', value: 3 },
      { datatype: 'metadata', metadata_id: 'zon_pv', value: 4 }
    ],
    s2: [{ sourceGroup: 'E', targetGroup: 'Finaal verbruik', source: 'Elektriciteit', target: 'Finaal verbruik', carrier: 'electricity', sector: 'homes', value: 30 }],
    ignore_me: [{ source: 'x', target: 'y', value: 99 }]
  }))
  const d = r.doc
  assert.ok(r.asNew && /2 scenarios/.test(r.message))
  assert.deepEqual(d.scenarios.map(s => s.title), ['A | 2030', 'A | 2050'])
  assert.equal(d.flows.length, 3)
  assert.deepEqual(d.groups.map(g => [g.id, g.place]), [['Finaal verbruik', 'outside'], ['C', 'inside'], ['E', 'inside']])
  assert.equal(d.groups[2].color, '#FFFFFF')
  const mix = d.carriers.find(c => c.id.startsWith('carbon_fossil_and'))
  assert.deepEqual([mix.color, mix.pattern, mix.patterncolor], ['#4e4e4e', 'stripes', '#61D4A4'])
  assert.equal(buildModel(d).nodeById.get('_E').labelled, false)
  assert.deepEqual([d.details[0].node, d.details[0].title, d.details[0].s1], ['Elektriciteit', 'Zon PV', 4])
  assert.deepEqual([getSetting(d, 'canvasWidth'), getSetting(d, 'unit'), buildModel(d).largest], [900, 'PJ', 30])
  assert.deepEqual(validateDocument(d).filter(i => i.severity !== 'info'), [])
})

test('sankey files, lists and matrices open as a new diagram', () => {
  const file = readFileSync(new URL('../sankey/data/fluxdata_example_file.xlsx', import.meta.url))
  const sankey = readSankey('s.xlsx', file).doc
  const s = readDocument('s.xlsx', file)
  assert.ok(s.asNew)
  assert.deepEqual(s.doc.groups.map(g => g.id).filter(g => !['Supply', 'Conversion', 'Use'].includes(g)), [])
  assert.equal(Math.round(buildModel(s.doc).total), Math.round(sankey.links.reduce((t, l) => t + (l.value > 0 ? l.value : 0), 0) * getSetting(s.doc, 'multiply')))
  const list = readDocument('l.xlsx', book({ Blad1: [['Van', 'Naar', '2020', '2030'], ['A', 'B', 4, 5], ['B', 'C', 2, 1]] }))
  assert.deepEqual([list.doc.nodes.length, list.doc.scenarios.map(x => x.id).join(), list.doc.flows[0].carrier], [3, '2020,2030', 'A'])
  const matrix = readDocument('m.xlsx', book({ M: [['', 'A', 'B', 'C'], ['A', 0, 3, 1], ['B', 2, 0, 4], ['C', 0, 5, 0]] }))
  assert.equal(matrix.doc.flows.length, 5)
  assert.ok(matrix.asNew)
  const json = readDocument('j.json', bytes(JSON.stringify([{ from: 'A', to: 'B', value: 1 }, { from: 'B', to: 'A', value: 2 }])))
  assert.equal(json.doc.flows.length, 2)
  assert.throws(() => readDocument('n.xlsx', book({ X: [['name', 'n'], ['p', 1]] })), /no "flows" sheet/)
})

test('the template and the example open; other editors say where they belong', () => {
  const t = readDocument('t.xlsx', bytes(templateWorkbook()))
  assert.deepEqual([t.doc.nodes.length, t.doc.scenarios.length, buildModel(t.doc).total], [8, 2, 670])
  const e = readDocument('e.xlsx', readFileSync(new URL('../chord/data/chord_example_file.xlsx', import.meta.url)))
  assert.deepEqual(validateDocument(e.doc), [])
  assert.throws(() => readTreemap('x.xlsx', bytes(templateWorkbook())), /chord diagram file .*Open it in the chord editor/)
  assert.throws(() => readSankey('x.xlsx', bytes(templateWorkbook())), /chord editor|links/)
})
