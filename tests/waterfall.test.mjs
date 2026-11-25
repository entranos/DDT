import './setup.mjs'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { normalizeDocument, getSetting } from '../waterfall/src/model/schema.js'
import * as cmd from '../waterfall/src/model/commands.js'
import { buildModel } from '../waterfall/src/model/steps.js'
import { validateDocument } from '../waterfall/src/model/validate.js'
import { layoutColumns, layoutRows, blockOrder } from '../waterfall/src/render/layout.js'
import { readDocument, writeDocument } from '../waterfall/src/io/formats.js'
import { documentFromTotals, selectionsIn } from '../waterfall/src/io/fromTotals.js'
import { readDocument as readSankey } from '../sankey/src/io/formats.js'
import { readDocument as readTernary } from '../ternary/src/io/formats.js'
import { readDocument as readTreemap, writeDocument as writeTreemap } from '../treemap/src/io/formats.js'
import { starterDocument as treemapStarter } from '../treemap/src/io/template.js'
import { starterDocument, templateWorkbook } from '../waterfall/src/io/template.js'

globalThis.d3 = createRequire(import.meta.url)('../shared/vendor/d3-7.9.0.min.js')

const raw = () => ({
  diagrams: [{ id: 'up', title: 'Up', subtitle: 'sub', visible: 'Yes', owner: 'kept' }, { id: 'down', title: 'Down', visible: 'Yes' }],
  moments: [{ id: '2030', title: '2030' }, { id: '2040', title: '2040' }, { id: '2050', title: '2050' }],
  carriers: [{ id: 'el', title: 'Electricity', color: '#E0C36F' }, { id: 'gas', title: 'Gas', color: '#57a' }, { id: 'h2', title: 'Hydrogen' }],
  values: [
    { diagram: 'up', carrier: 'el', 2030: 100, 2040: 150, 2050: 170, note: 'kept' },
    { diagram: 'up', carrier: 'h2', 2030: 0, 2040: '2,5', 2050: 40 },
    { diagram: 'down', carrier: 'el', 2030: 60, 2040: 20, 2050: 10 },
    { diagram: 'down', carrier: 'gas', 2030: 300, 2040: 200, 2050: 250 }
  ],
  settings: [{ setting: 'title', waarde: 'T' }, { setting: 'showNet', waarde: 'No' }, { setting: 'myOwn', waarde: 'kept' }]
})
const make = (extra = {}) => normalizeDocument({ ...raw(), ...extra }).doc
const plain = doc => JSON.parse(JSON.stringify({ diagrams: doc.diagrams, moments: doc.moments, carriers: doc.carriers, values: doc.values, settings: doc.settings }, (k, v) => (k === '_uid' ? undefined : v)))
const bytes = data => (typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data))
const find = (doc, d, c) => doc.values.find(v => v.diagram === d && v.carrier === c)

// ---- model ----

test('steps lead from one total to the next, carrier by carrier', () => {
  const m = buildModel(make())
  const [up, down] = m.diagrams
  assert.deepEqual(up.totals.map(t => t.total), [100, 152.5, 210])
  assert.deepEqual(down.totals.map(t => t.total), [360, 220, 260])
  assert.deepEqual(down.periods[0].steps.map(s => [s.carrier.id, s.change, s.from, s.to]), [['el', -40, 360, 320], ['gas', -100, 320, 220], ['h2', 0, 220, 220]])
  assert.equal(down.periods[1].change, 40)
  m.diagrams.forEach(d => d.periods.forEach((p, i) => {
    assert.equal(p.start, d.totals[i].total)
    assert.ok(Math.abs(p.steps[p.steps.length - 1].to - d.totals[i + 1].total) < 1e-9)
  }))
  assert.equal(down.max, 360)
})

test('columns are shared by all diagrams; only changing carriers on request', () => {
  const m = buildModel(make())
  assert.deepEqual(m.columns.map(c => c.map(x => x.id)), [['el', 'gas', 'h2'], ['el', 'gas', 'h2']])
  const doc = make({ settings: [{ setting: 'columns', waarde: 'changing' }], values: [{ diagram: 'up', carrier: 'el', 2030: 1, 2040: 1, 2050: 2 }, { diagram: 'down', carrier: 'gas', 2030: 1, 2040: 2, 2050: 2 }, { diagram: 'down', carrier: 'h2', 2030: 0, 2040: 0, 2050: 0 }] })
  const n = buildModel(doc)
  assert.deepEqual(n.columns.map(c => c.map(x => x.id)), [['gas'], ['el']])
  assert.deepEqual(n.legend.map(l => l.label), ['Electricity', 'Gas'])
})

test('hidden diagrams and moments are skipped', () => {
  const doc = make()
  const one = buildModel(cmd.showDiagrams(doc, [doc.diagrams[1]._uid]))
  assert.deepEqual(one.diagrams.map(d => d.id), ['down'])
  assert.deepEqual(one.carriers.map(c => c.id), ['el', 'gas'])
  const skip = buildModel(cmd.updateMoment(doc, doc.moments[1]._uid, { visible: false }))
  assert.deepEqual(skip.moments.map(m => m.id), ['2030', '2050'])
  assert.equal(skip.diagrams[1].periods[0].steps[1].change, -50)
})

test('negative amounts stack below zero', () => {
  const doc = cmd.setAmount(make(), 'up', 'h2', '2050', -30)
  const t = buildModel(doc).diagrams[0].totals[2]
  assert.deepEqual([t.total, t.up, t.down], [140, 170, -30])
  assert.equal(buildModel(doc).diagrams[0].min, -30)
})

test('rows for the same diagram and carrier add up; unit conversion applies', () => {
  const doc = make({ values: [...raw().values, { diagram: 'up', carrier: 'el', 2030: 10, 2040: 0, 2050: 0 }], settings: [{ setting: 'multiply', waarde: 2 }] })
  const t = buildModel(doc).diagrams[0].totals[0]
  assert.equal(t.total, 220)
  assert.equal(t.segments[0].uids.length, 2)
})

test('without a moments table every numeric column is a moment, in file order', () => {
  const { doc } = normalizeDocument({ values: [{ name: 'el', 2035: 3, 2030: 1, remark: 'x' }], columns: { values: ['name', '2030', '2035', 'remark'] } })
  assert.deepEqual(doc.moments.map(m => m.id), ['2030', '2035'])
  assert.equal(doc.values[0].carrier, 'el')
  assert.equal(doc.diagrams.length, 1)
  assert.deepEqual(validateDocument(doc), [])
})

// ---- commands ----

test('setting a step moves only the later moment', () => {
  const doc = cmd.setChange(make(), 'down', 'gas', '2030', '2040', -120)
  assert.deepEqual(['2030', '2040', '2050'].map(y => find(doc, 'down', 'gas')[y]), [300, 180, 250])
})

test('setting an amount adds the row when there is none', () => {
  const doc = cmd.setAmount(make(), 'up', 'gas', '2040', 12)
  assert.deepEqual(['2030', '2040', '2050'].map(y => find(doc, 'up', 'gas')[y]), [0, 12, 0])
})

test('renaming a year moves its column; taken or reserved names are refused', () => {
  const doc = make()
  const next = cmd.renameMoment(doc, doc.moments[1]._uid, '2041')
  assert.equal(next.moments[1].id, '2041')
  assert.equal(find(next, 'up', 'el')['2041'], 150)
  assert.ok(!('2040' in find(next, 'up', 'el')))
  for (const bad of ['2030', 'carrier', 'Diagram', 'note', '', '_x']) assert.equal(cmd.updateMoment(doc, doc.moments[1]._uid, { id: bad }), doc)
  const titled = cmd.updateMoment(doc, doc.moments[0]._uid, { title: 'Nu' })
  assert.equal(cmd.renameMoment(titled, doc.moments[0]._uid, 'Straks').moments[0].id, '2030') // a title of its own leaves the column alone
})

test('a new moment continues the years and starts from the last amounts', () => {
  const doc = cmd.addMoment(make())
  assert.equal(doc.moments[3].id, '2060')
  assert.equal(find(doc, 'up', 'el')['2060'], 170)
  assert.ok(buildModel(doc).diagrams.every(d => d.periods[2].change === 0))
})

test('deleting a diagram, carrier or moment takes its values along', () => {
  const doc = make()
  assert.equal(cmd.deleteItems(doc, { diagrams: [doc.diagrams[0]._uid] }).values.length, 2)
  assert.equal(cmd.deleteItems(doc, { carriers: [doc.carriers[0]._uid] }).values.length, 2)
  assert.ok(cmd.deleteItems(doc, { moments: [doc.moments[0]._uid] }).values.every(v => !('2030' in v)))
})

test('renaming a diagram or carrier keeps values attached; reordering', () => {
  const doc = make()
  assert.equal(cmd.updateDiagram(doc, doc.diagrams[0]._uid, { id: 'growth' }).values[0].diagram, 'growth')
  assert.equal(cmd.updateCarrier(doc, doc.carriers[0]._uid, { id: 'power' }).values[2].carrier, 'power')
  assert.deepEqual(cmd.moveCarrier(doc, doc.carriers[2]._uid, doc.carriers[0]._uid, false).carriers.map(c => c.id), ['h2', 'el', 'gas'])
  assert.deepEqual(cmd.stepRow(doc, 'diagrams', doc.diagrams[1]._uid, -1, doc.diagrams.map(d => d._uid)).diagrams.map(d => d.id), ['down', 'up'])
})

test('inserting a column: a year in between, starting from the one before', () => {
  const doc = make()
  const [a, b] = doc.moments.map(m => m._uid)
  const mid = cmd.insertMoment(doc, a, true)
  assert.deepEqual(mid.moments.map(m => m.id), ['2030', '2035', '2040', '2050'])
  assert.equal(find(mid, 'down', 'gas')['2035'], 300)
  assert.deepEqual(cmd.insertMoment(doc, b, false).moments.map(m => m.id), ['2030', '2035', '2040', '2050'])
  assert.deepEqual(cmd.insertMoment(doc, a, false).moments.map(m => m.id), ['2020', '2030', '2040', '2050'])
  assert.equal(find(cmd.insertMoment(doc, a, false), 'down', 'gas')['2020'], 300)
  assert.deepEqual(cmd.insertMoment(doc, doc.moments[2]._uid, true).moments.map(m => m.id), ['2030', '2040', '2050', '2060'])
  const named = cmd.renameMoment(cmd.renameMoment(doc, a, 'Nu'), b, 'Straks')
  assert.equal(cmd.insertMoment(named, named.moments[0]._uid, true).moments[1].id, 'moment')
})

test('renaming or deleting a column leaves no trace of it in the table or file', () => {
  const doc = make({ columns: { values: ['diagram', 'carrier', '2030', '2040', '2050', 'bron', 'note'] } })
  const renamed = cmd.renameMoment(doc, doc.moments[1]._uid, '2041')
  assert.ok(!renamed.meta.valueColumns.includes('2040') && renamed.meta.valueColumns.includes('2041'))
  const gone = cmd.deleteItems(doc, { moments: [doc.moments[1]._uid] })
  assert.ok(!gone.meta.valueColumns.includes('2040'))
  const header = d => globalThis.XLSX.utils.sheet_to_json(globalThis.XLSX.read(writeDocument(d, 'xlsx').data, { type: 'array' }).Sheets.values, { header: 1 })[0]
  assert.deepEqual(header(gone), ['diagram', 'carrier', '2030', '2050', 'note', 'bron']) // an empty column of one's own is kept
  assert.deepEqual(header(cmd.deleteColumn(gone, 'values', 'bron')), ['diagram', 'carrier', '2030', '2050', 'note'])
  assert.equal(cmd.renameMoment(doc, doc.moments[1]._uid, '2030'), doc) // taken
})

// ---- layout ----

test('columns fill the width, in order, without overlap', () => {
  const m = buildModel(make())
  const l = layoutColumns(m.moments, m.columns, { x0: 100, x1: 1000, totalWidth: 50, periodGap: 20, stepGap: 4, netWidth: 30, maxStep: 400 })
  const xs = [l.totals[0], ...l.periods[0].steps, l.periods[0].net, l.totals[1], ...l.periods[1].steps, l.periods[1].net, l.totals[2]]
  xs.forEach((c, i) => { if (i) assert.ok(c.x0 >= xs[i - 1].x1 - 1e-9) })
  assert.ok(Math.abs(l.x1 - 1000) < 1e-6)
  assert.equal(l.overflow, false)
  assert.equal(layoutColumns(m.moments, m.columns, { x0: 0, x1: 120, totalWidth: 50, periodGap: 20, stepGap: 4, netWidth: 30 }).overflow, true)
})

const rowsFor = (extents, options = {}) => layoutRows(extents, { top: 100, bottom: 800, sync: 'same', gap: 20, place: 'auto', axisHeight: 30, heads: extents.map(() => 25), foot: 3, ...options })

test('rows: the same axis, the same scale, or each its own', () => {
  const e = [{ min: 0, max: 200 }, { min: 0, max: 400 }]
  const same = rowsFor(e)
  assert.deepEqual(same.rows.map(r => r.max), [400, 400])
  assert.ok(Math.abs(same.bottom - 800) < 1e-6)
  const fitted = rowsFor(e, { sync: 'fitted' })
  assert.deepEqual(fitted.rows.map(r => r.max), [200, 400])
  assert.equal(fitted.rows[0].perUnit, fitted.rows[1].perUnit)
  assert.ok(fitted.perUnit > same.perUnit)
  const own = rowsFor(e, { sync: 'own' })
  assert.ok(Math.abs(own.rows[0].perUnit - 2 * own.rows[1].perUnit) < 1e-9)
  for (const l of [same, fitted, own]) l.rows.forEach(r => { assert.ok(Math.abs(r.v(r.y(50)) - 50) < 1e-9); assert.ok(r.y(0) <= r.y1) })
})

test('headings: between two diagrams, below one, above, below all, or everywhere', () => {
  const e = [{ min: 0, max: 100 }, { min: 0, max: 100 }]
  const order = (n, p) => blockOrder(n, p).map(b => (b.axis ? 'axis' : b.diagram)).join()
  assert.equal(order(2, 'auto'), '0,axis,1')
  assert.equal(order(1, 'auto'), '0,axis')
  assert.equal(order(2, 'top'), 'axis,0,1')
  assert.equal(order(2, 'bottom'), '0,1,axis')
  assert.equal(order(2, 'each'), '0,axis,1,axis')
  for (const place of ['auto', 'top', 'bottom', 'each']) {
    const l = rowsFor(e, { place })
    const blocks = [...l.rows.map(r => [r.y0, r.y1]), ...l.axes.map(a => [a.y0, a.y1])].sort((a, b) => a[0] - b[0])
    blocks.forEach((b, i) => { if (i) assert.ok(b[0] >= blocks[i - 1][1] - 1e-6, place) })
    assert.ok(Math.abs(l.bottom - 800) < 1e-6, place)
  }
})

test('fixed pixels per unit, and whether it fits', () => {
  const e = [{ min: 0, max: 100 }, { min: -20, max: 100 }]
  const l = rowsFor(e, { pxPerUnit: 1.5 })
  assert.ok(l.rows.every(r => r.perUnit === 1.5 && r.min === -20))
  assert.equal(l.overflow, false)
  assert.equal(rowsFor(e, { pxPerUnit: 9 }).overflow, true)
})

// ---- files ----

for (const format of ['xlsx', 'json', 'yaml']) {
  test(`${format}: reading back what was written gives the same document`, () => {
    const doc = make()
    const back = readDocument(`x.${format}`, bytes(writeDocument(doc, format).data))
    const norm = d => { const p = plain(d); p.diagrams.forEach(x => { x.visible = x.visible === true || x.visible === 'Yes' }); return p }
    assert.deepEqual(norm(back.doc), norm(doc))
    assert.deepEqual(back.doc.moments.map(m => m.id), ['2030', '2040', '2050'])
    assert.equal(back.doc.diagrams[0].owner, 'kept')
    assert.equal(back.doc.values[0].note, 'kept')
    assert.equal(back.doc.settings.myOwn, 'kept')
    assert.equal(getSetting(back.doc, 'showNet'), false)
    assert.equal(find(back.doc, 'up', 'h2')['2040'], 2.5)
  })
}

test('xlsx: the columns of the values sheet are in order', () => {
  const XLSX = globalThis.XLSX
  const wb = XLSX.read(writeDocument(make(), 'xlsx').data, { type: 'array' })
  assert.deepEqual(wb.SheetNames, ['values', 'diagrams', 'moments', 'carriers', 'settings'])
  assert.deepEqual(XLSX.utils.sheet_to_json(wb.Sheets.values, { header: 1 })[0], ['diagram', 'carrier', '2030', '2040', '2050', 'note'])
})

test('a workbook with boven/onder totals offers its selections', () => {
  const XLSX = globalThis.XLSX
  const wb = XLSX.utils.book_new()
  const add = (name, rows) => XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), name)
  add('alle_boven_alle_tot', [{ name: 'mt_elektriciteit', 2030: 10, 2050: 30 }, { name: 'mt_biomassa', 2030: 5, 2050: 5 }])
  add('alle_midden_alle_tot', [{ name: 'mt_elektriciteit', 2030: 0, 2050: 0 }])
  add('alle_onder_alle_tot', [{ name: 'mt_fossiel', 2030: 90, 2050: 40 }])
  add('alle_boven_alle', [{ name: 'Totaal start periode', '2030naar2050': 15 }])
  add('warmte_boven_ind_ch_tot', [{ name: 'mt_warmte', 2030: 1, 2050: 2 }])
  const file = readDocument('w.xlsx', new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' })))
  assert.deepEqual(file.choose.options.map(o => o.label), ['Alle toepassingen | Alle sectoren', 'Warmte | Chemie'])
  const r = file.choose.make(file.choose.options[0].value)
  assert.equal(r.asNew, true)
  assert.deepEqual(r.doc.diagrams.map(d => d.id), ['boven', 'onder'])
  assert.deepEqual(r.doc.moments.map(m => m.id), ['2030', '2050'])
  assert.deepEqual(r.doc.carriers.map(c => c.title), ['Elektriciteit', 'Biomassa', 'Olie, kolen, foss. methanol'])
  assert.deepEqual(buildModel(r.doc).diagrams.map(d => d.totals.map(t => t.total)), [[15, 35], [90, 40]])
  assert.deepEqual(validateDocument(r.doc), [])
  assert.equal(selectionsIn(wb).length, 2)
  assert.deepEqual(documentFromTotals(wb, file.choose.options[1].value).diagrams.map(d => d.title), ['Opbouw'])
})

test('every editor says where a file of another one belongs', () => {
  for (const format of ['xlsx', 'json', 'yaml']) {
    const own = bytes(writeDocument(make(), format).data)
    assert.throws(() => readSankey(`w.${format}`, own), /waterfall editor/)
    assert.throws(() => readTernary(`w.${format}`, own), /waterfall editor/)
    assert.throws(() => readTreemap(`w.${format}`, own), /waterfall editor/)
    assert.throws(() => readDocument(`t.${format}`, bytes(writeTreemap(treemapStarter(), format).data)), /treemap editor/)
  }
})

test('the shipped example, starter and template have no issues', () => {
  const dir = new URL('../waterfall/data/', import.meta.url)
  const x = readDocument('e.xlsx', new Uint8Array(readFileSync(new URL('waterfall_example_file.xlsx', dir)))).doc
  const y = readDocument('e.yaml', new Uint8Array(readFileSync(new URL('waterfall_example_file.yaml', dir)))).doc
  assert.deepEqual(validateDocument(x), [])
  assert.deepEqual(plain(x).values.map(v => [v.diagram, v.carrier, v['2040']]), plain(y).values.map(v => [v.diagram, v.carrier, v['2040']]))
  assert.deepEqual(validateDocument(starterDocument()), [])
  const t = readDocument('t.xlsx', new Uint8Array(templateWorkbook())).doc
  assert.deepEqual(validateDocument(t), [])
  assert.deepEqual(t.moments.map(m => m.id), ['2030', '2040', '2050'])
})

// ---- validation ----

test('validation finds missing and bad values, duplicates and unused items', () => {
  const doc = make({
    diagrams: [...raw().diagrams, { id: 'empty', title: 'Empty' }],
    carriers: [...raw().carriers, { id: 'spare', title: 'Spare', color: 'red' }, { id: 'gas', title: 'Twice' }],
    values: [...raw().values, { diagram: 'up', carrier: 'el', 2030: 1 }, { diagram: 'up', carrier: '', 2030: 1 }, { diagram: 'up', carrier: 'gas', 2030: 'lots' }]
  })
  const broken = cmd.addValue(doc, { diagram: 'gone', carrier: 'coal', 2030: 1 })
  const text = validateDocument(broken).map(i => `${i.severity} ${i.message}`).join('\n')
  for (const re of [/info up, el appears 2 times/, /have no carrier/, /2030 "lots" is not a number/, /not a hex code: "red"/, /error Carrier ID "gas" is used 2 times/, /no values: "Empty"/, /not used: "Spare"/, /diagram "gone", which does not exist/, /carrier "coal", which does not exist/]) assert.match(text, re)
  assert.ok(!validateDocument(cmd.addMissing(broken)).some(i => /does not exist/.test(i.message)))
  const hidden = cmd.showDiagrams(make(), [])
  assert.ok(validateDocument(hidden).some(i => /Every diagram is hidden/.test(i.message)))
})
