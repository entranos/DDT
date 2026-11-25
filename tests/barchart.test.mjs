import './setup.mjs'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { normalizeDocument, emptyDocument, getSetting } from '../barchart/src/model/schema.js'
import * as cmd from '../barchart/src/model/commands.js'
import { buildModel, amountForShare } from '../barchart/src/model/chart.js'
import { validateDocument } from '../barchart/src/model/validate.js'
import { layoutSlots, layoutScale } from '../barchart/src/render/layout.js'
import { readDocument, writeDocument } from '../barchart/src/io/formats.js'
import { templateWorkbook, starterDocument } from '../barchart/src/io/template.js'
import { readDocument as readTernary } from '../ternary/src/io/formats.js'
import { readDocument as readTreemap } from '../treemap/src/io/formats.js'
import { planPaste, parseTable } from '../shared/src/paste.js'

const require = createRequire(import.meta.url)
globalThis.d3 = require('../shared/vendor/d3-7.9.0.min.js')
const XLSX = globalThis.XLSX
const bytes = data => (typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data))

const make = (settings = []) => normalizeDocument({
  bars: [
    { title: 'A', group: 'one', gas: 10, heat: 30, icon: 'industry' },
    { title: 'B', group: 'one', gas: 20, heat: 5 },
    { title: 'C', group: 'two', gas: 1, heat: 2, gas_icon: 'oil', gas_pattern: 'dots' }
  ],
  series: [{ id: 'gas', title: 'Natural gas', color: '#3B78B0', icon: 'gas' }, { id: 'heat', title: 'Heat', color: '#C8586F', pattern: 'diagonal' }],
  settings
}).doc

test('reads names under other headings, and takes every column of numbers as a series', () => {
  const { doc } = normalizeDocument({ bars: [{ Bar: 'x', Gas: '1,5', note: 'hi', year: 2 }, { Bar: 'y', Gas: 3, year: 4 }], series: [] })
  assert.deepEqual(doc.bars.map(b => b.title), ['x', 'y'])
  assert.deepEqual(doc.series.map(s => s.id), ['Gas', 'year'])
  assert.equal(doc.bars[0].Gas, 1.5)
  assert.equal(getSetting(doc, 'orientation'), 'vertical')
  assert.equal(getSetting(doc, 'dropShadow'), false)
})

test('icon and pattern columns of a series are not series themselves', () => {
  const { doc } = normalizeDocument({ bars: [{ title: 'x', gas: 1, gas_icon: 'gas', gas_pattern: 'dots' }] })
  assert.deepEqual(doc.series.map(s => s.id), ['gas'])
  assert.equal(cmd.seriesIdAllowed(doc, null, 'gas_icon'), false)
  assert.equal(cmd.seriesIdAllowed(doc, null, 'Color'), false)
  assert.equal(cmd.seriesIdAllowed(doc, null, 'oil'), true)
})

test('stacked: parts follow each other, negatives go the other way', () => {
  const doc = make()
  const m = buildModel(cmd.setValue(doc, doc.bars[1]._uid, 'heat', -5))
  assert.deepEqual(m.groups.map(g => [g.title, g.bars.length]), [['one', 2], ['two', 1]])
  const [a, b] = m.bars
  assert.deepEqual(a.parts.map(p => [p.from, p.to]), [[0, 10], [10, 40]])
  assert.deepEqual(b.parts.map(p => [p.from, p.to]), [[0, 20], [0, -5]])
  assert.equal(b.total, 15)
  assert.deepEqual([m.min, m.max], [-5, 40])
})

test('side by side: every part starts at zero', () => {
  const m = buildModel(make([{ setting: 'mode', waarde: 'grouped' }]))
  assert.ok(m.bars.every(b => b.parts.every(p => p.from === 0)))
  assert.equal(m.max, 30)
})

test('to 100%: parts are shares, and a dragged share gives the amount back', () => {
  const m = buildModel(make([{ setting: 'mode', waarde: 'share' }]))
  const a = m.bars[0]
  assert.deepEqual(a.parts.map(p => p.to), [0.25, 1])
  assert.equal(Math.round(amountForShare(a, a.parts[0], 0.5)), 30)
})

test('icons and patterns: the part’s own, then the bar’s (patterns), then the series’', () => {
  const doc = make()
  const m = buildModel(doc)
  assert.equal(m.bars[0].parts[0].icon.name, 'gas')
  assert.equal(m.bars[2].parts[0].icon.name, 'oil')
  assert.deepEqual(m.bars[2].parts.map(p => p.pattern), ['dots', 'diagonal'])
  const hatched = buildModel(cmd.updateBar(doc, doc.bars[0]._uid, { pattern: 'grid' }))
  assert.deepEqual(hatched.bars[0].parts.map(p => p.pattern), ['grid', 'grid'])
  assert.equal(m.bars[0].icon.name, 'industry')
})

test('one series: bars can have their own colour, and no legend is needed', () => {
  const doc = cmd.deleteItems(make(), { series: [make().series[0]._uid] })
  const one = normalizeDocument({ bars: [{ title: 'A', x: 1, color: '#ff0000' }, { title: 'B', x: 2 }], series: [{ id: 'x', color: '#00ff00' }] }).doc
  const m = buildModel(one)
  assert.deepEqual(m.bars.map(b => b.parts[0].color), ['#ff0000', '#00ff00'])
  assert.equal(m.legend.length, 0)
  assert.equal(buildModel(doc).legend.length, 2, 'unknown uids delete nothing')
})

test('order by size stays within groups, and holds still while dragging', () => {
  const doc = make([{ setting: 'order', waarde: 'smallest' }])
  assert.deepEqual(buildModel(doc).bars.map(b => b.title), ['B', 'A', 'C'])
  const keep = doc.bars.map(b => b._uid)
  assert.deepEqual(buildModel(doc, { keepOrder: keep }).bars.map(b => b.title), ['A', 'B', 'C'])
})

test('hidden bars and series are left out', () => {
  let doc = make()
  doc = cmd.updateSeries(doc, doc.series[0]._uid, { visible: 'No' })
  doc = cmd.updateBar(doc, doc.bars[0]._uid, { visible: false })
  const m = buildModel(doc)
  assert.deepEqual(m.bars.map(b => [b.title, b.parts.length]), [['B', 1], ['C', 1]])
})

test('renaming a series moves its columns of amounts, icons and patterns', () => {
  const doc = make()
  const next = cmd.updateSeries(doc, doc.series[0]._uid, { id: 'methane' })
  assert.deepEqual([next.bars[2].methane, next.bars[2].methane_icon, next.bars[2].methane_pattern], [1, 'oil', 'dots'])
  assert.ok(!('gas' in next.bars[2]) && !next.meta.barColumns.includes('gas') && next.meta.barColumns.includes('methane_icon'))
  const plain = cmd.addSeries(emptyDocument(), { id: 'x', title: 'x' })
  assert.deepEqual(cmd.renameSeries(plain, plain.series[0]._uid, 'Steam').series.map(s => [s.id, s.title]), [['Steam', 'Steam']])
  assert.equal(cmd.renameSeries(doc, doc.series[0]._uid, 'heat'), doc, 'a name that is taken')
})

test('deleting a series deletes all its columns', () => {
  const doc = make()
  const next = cmd.deleteItems(doc, { series: [doc.series[0]._uid] })
  assert.ok(next.bars.every(b => !Object.keys(b).some(k => k.startsWith('gas'))))
  assert.ok(!next.meta.barColumns.some(k => k.startsWith('gas')))
})

test('an icon for one part comes and goes with its column', () => {
  const doc = make()
  const key = 'heat_icon'
  const withIcon = cmd.setPartIcon(doc, doc.bars[0]._uid, 'heat', 'flame')
  assert.equal(withIcon.bars[0][key], 'flame')
  const back = cmd.setPartIcon(withIcon, doc.bars[0]._uid, 'heat', '')
  assert.ok(back.bars.every(b => !(key in b)))
  assert.equal(cmd.setPartPattern(doc, doc.bars[0]._uid, 'heat', 'none').bars[0].heat_pattern, 'none')
})

test('moving a bar takes the group of where it lands', () => {
  const doc = make()
  const next = cmd.moveBar(doc, doc.bars[0]._uid, doc.bars[2]._uid, true)
  assert.deepEqual(next.bars.map(b => [b.title, b.group]), [['B', 'one'], ['C', 'two'], ['A', 'two']])
  assert.deepEqual(cmd.renameGroup(doc, 'one', 'uno').bars.map(b => b.group), ['uno', 'uno', 'two'])
  assert.deepEqual(cmd.stepRow(doc, 'bars', doc.bars[0]._uid, 1, doc.bars.map(b => b._uid)).bars.map(b => b.title), ['B', 'A', 'C'])
})

test('pasting a table adds its unknown columns of numbers as series', () => {
  const doc = make()
  const columns = [{ key: 'title', label: 'Name' }, { key: 'group', label: 'Group' }, { key: 'gas', label: 'Natural gas' }, { key: 'heat', label: 'Heat' }]
  const plan = planPaste({ rows: parseTable('Name\tNatural gas\tSolar\tRemark\nD\t5\t6\tok\nE\t7\t8\t'), columns, newColumns: true })
  assert.equal(plan.header, true)
  const next = cmd.applyRowEdits(doc, 'bars', [], plan.newRows)
  assert.deepEqual(next.series.map(s => s.id), ['gas', 'heat', 'Solar'])
  assert.deepEqual(next.bars.slice(3).map(b => [b.title, b.gas, b.Solar, b.Remark]), [['D', 5, 6, 'ok'], ['E', 7, 8, '']])
  const other = planPaste({ rows: parseTable('Name\tNatural gas\tSolar\nD\t5\t6'), columns })
  assert.ok(!other.newRows.some(r => 'Solar' in r), 'other tables paste as before')
})

test('unchanged edits return the same document', () => {
  const doc = make()
  assert.equal(cmd.setValue(doc, doc.bars[0]._uid, 'gas', 10), doc)
  assert.equal(cmd.updateSeries(doc, doc.series[0]._uid, { title: 'Natural gas' }), doc)
  assert.equal(cmd.moveBar(doc, doc.bars[0]._uid, doc.bars[0]._uid, true), doc)
})

test('checks: numbers, duplicate and reserved columns, colours, patterns, empty series', () => {
  const { doc } = normalizeDocument({
    bars: [{ title: '', a: 'lots', pattern: 'plaid' }, { title: 'B', a: 1, color: 'red', a_pattern: 'zz' }],
    series: [{ id: 'a' }, { id: 'a' }, { id: 'note' }, { id: '' }, { id: 'empty', color: 'blue' }]
  })
  const keys = validateDocument(doc).map(i => i.key.replace(/-[a-z]_[a-z0-9]+$/, ''))
  for (const k of ['bar-noname', 'bar-nan', 'series-dup', 'series-reserved', 'series-noid', 'series-color', 'bar-color', 'bar-pattern', 'pattern', 'series-empty']) assert.ok(keys.includes(k), `${k} in ${keys}`)
  assert.deepEqual(validateDocument(make()), [])
  assert.deepEqual(validateDocument(starterDocument()), [])
  const share = make([{ setting: 'mode', waarde: 'share' }])
  assert.deepEqual(validateDocument(cmd.setValue(share, share.bars[0]._uid, 'gas', -1)).map(i => i.key), ['share-negative'])
})

test('layout: slots, gaps and headings; a scale that leaves room for labels', () => {
  const groups = [{ bars: [1, 2] }, { bars: [1] }]
  const l = layoutSlots(groups, { u0: 10, u1: 110, groupGap: 10, head: () => 15 })
  assert.equal(l.slot, 20)
  assert.deepEqual(l.groups.map(g => [g.u0, g.u1]), [[10, 65], [75, 110]])
  const s = layoutScale({ length: 100, min: 0, max: 10, ends: [{ up: 10, down: 0, roomUp: 20, roomDown: 0 }] })
  assert.ok(Math.abs(s.per - 8) < 1e-6 && s.fits)
  const both = layoutScale({ length: 100, min: -5, max: 10, ends: [{ up: 10, down: 0, roomUp: 10, roomDown: 0 }, { up: 0, down: -5, roomUp: 0, roomDown: 15 }] })
  assert.ok(Math.abs(both.per - 5) < 1e-6 && Math.abs(both.down - 40) < 1e-6)
  assert.equal(layoutScale({ length: 100, min: 0, max: 10, ends: [], pxPerUnit: 11 }).fits, false)
})

test('round trips: xlsx, json and yaml keep rows, extra columns and settings', () => {
  const doc = normalizeDocument({ bars: [{ title: 'A', gas: 1.5, gas_icon: 'oil', extra: 'x', visible: 'No' }], series: [{ id: 'gas', title: 'Gas', color: '#111111', pattern: 'dots', more: 1 }], settings: [{ setting: 'mode', waarde: 'share' }, { setting: 'showValues', waarde: 'Yes' }, { setting: 'own', waarde: 'kept' }] }).doc
  for (const format of ['xlsx', 'json', 'yaml']) {
    const { data } = writeDocument(doc, format)
    const again = readDocument(`x.${format}`, bytes(data))
    assert.ok(!again.asNew)
    const b = again.doc.bars[0]
    assert.deepEqual([b.title, b.gas, b.gas_icon, b.extra, cmd.setValue(again.doc, b._uid, 'gas', 1.5) === again.doc], ['A', 1.5, 'oil', 'x', true], format)
    assert.deepEqual([again.doc.series[0].pattern, again.doc.series[0].more], ['dots', 1])
    assert.deepEqual([getSetting(again.doc, 'mode'), getSetting(again.doc, 'showValues'), again.doc.settings.own], ['share', true, 'kept'])
    assert.equal(buildModel(again.doc).bars.length, 0, 'hidden stays hidden')
  }
})

test('extra sheets of a workbook are kept', () => {
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['keep', 'me']]), 'Notes')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([{ title: 'A', x: 1 }]), 'Bars')
  const r = readDocument('a.xlsx', bytes(XLSX.write(wb, { bookType: 'xlsx', type: 'array' })))
  assert.deepEqual(r.doc.series.map(s => s.id), ['x'])
  const out = XLSX.read(bytes(writeDocument(r.doc, 'xlsx', r).data), { type: 'array' })
  assert.deepEqual(out.SheetNames, ['Notes', 'Bars', 'series', 'settings'])
})

test('a plain Excel table becomes a new chart', () => {
  const book = sheets => { const wb = XLSX.utils.book_new(); Object.entries(sheets).forEach(([n, rows]) => XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), n)); return bytes(XLSX.write(wb, { bookType: 'xlsx', type: 'array' })) }
  const one = readDocument('t.xlsx', book({ Blad1: [['Energy use'], [], ['Sector', 'Gas', 'Heat'], ['Industry', 5, 6], ['Homes', 7, '']] }))
  assert.ok(one.asNew && /sheet “Blad1”/.test(one.message))
  assert.deepEqual(one.doc.bars.map(b => [b.title, b.Gas, b.Heat]), [['Industry', 5, 6], ['Homes', 7, undefined]])
  const years = readDocument('t.xlsx', book({ Data: [['Jaar', 'Gas'], [2030, 5], [2040, 4]] }))
  assert.deepEqual(years.doc.bars.map(b => b.title), ['2030', '2040'])
  const many = readDocument('t.xlsx', book({ X: [['a', 'b'], ['p', 1]], Y: [['a', 'b'], ['q', 2]], Z: [['only text']] }))
  assert.equal(many.choose.options.length, 2)
  assert.equal(many.choose.make('1').doc.bars[0].title, 'q')
  assert.throws(() => readDocument('t.xlsx', book({ X: [['just', 'words'], ['no', 'numbers']] })), /no "bars" sheet/)
  const json = readDocument('t.json', bytes(JSON.stringify([{ name: 'A', x: 1 }, { name: 'B', x: 2 }])))
  assert.ok(json.asNew && json.doc.bars.length === 2)
})

test('treemap, waterfall and sankey files open as a new chart', () => {
  const read = (tool, file) => readDocument(file, readFileSync(new URL(`../${tool}/data/${file}`, import.meta.url)))
  const t = read('treemap', 'treemap_example_file.xlsx')
  const treemap = readTreemap('x.xlsx', readFileSync(new URL('../treemap/data/treemap_example_file.xlsx', import.meta.url))).doc
  assert.ok(t.asNew && t.doc.bars.length === treemap.blocks.length)
  const sum = d => d.bars.reduce((s, b) => s + d.series.reduce((x, y) => x + (b[y.id] || 0), 0), 0)
  assert.equal(Math.round(sum(t.doc)), Math.round(treemap.values.reduce((s, v) => s + v.value, 0)))
  const w = read('waterfall', 'waterfall_example_file.yaml')
  assert.deepEqual([w.doc.bars.length, w.doc.bars[0].title, w.doc.bars[0].group], [10, '2030', 'Opbouw'])
  const s = read('sankey', 'fluxdata_example_file.xlsx')
  assert.ok(s.asNew && s.doc.bars.length > 5 && validateDocument(s.doc).every(i => i.severity === 'info'))
})

test('the template opens, and other editors say where the file belongs', () => {
  const data = bytes(templateWorkbook())
  const r = readDocument('template.xlsx', data)
  assert.equal(r.doc.bars.length, 4)
  assert.equal(getSetting(r.doc, 'mode'), 'stacked')
  assert.throws(() => readTreemap('x.xlsx', data), /This is a bar chart file .*Open it in the bar chart editor/)
  assert.throws(() => readTernary('x.xlsx', data), /bar chart editor/)
})
