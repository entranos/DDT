import './setup.mjs'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { normalizeDocument, getSetting, seriesIsVisible } from '../ternary/src/model/schema.js'
import * as cmd from '../ternary/src/model/commands.js'
import { buildModel } from '../ternary/src/model/mix.js'
import { validateDocument } from '../ternary/src/model/validate.js'
import { computeDomain, domainPolygon, makeGeometry, clampShares, gridStep, tickValues, clipSegment } from '../ternary/src/render/geometry.js'
import { readDocument, writeDocument } from '../ternary/src/io/formats.js'
import { readDocument as readSankey, writeDocument as writeSankey } from '../sankey/src/io/formats.js'
import { normalizeDocument as normalizeSankey } from '../sankey/src/model/schema.js'
import { starterDocument, templateWorkbook } from '../ternary/src/io/template.js'
import { createStore } from '../shared/src/store.js'

const raw = () => ({
  axes: [
    { id: 'bio', label: 'Bio', corner: 'left', low: 'little bio', high: 'much bio', note: 'kept' },
    { id: 'el', label: 'Electrons', corner: 'right' },
    { id: 'fos', label: 'Fossil', corner: 'bottom' }
  ],
  series: [
    { id: 'a', title: 'A', group: 'G', color: '', style: 'solid', highlight: 'Yes', visible: 'Yes', source: 'kept' },
    { id: 'b', title: 'B', group: 'G', style: 'dashed', highlight: 'No', visible: 'No' }
  ],
  points: [
    { series: 'a', year: 2040, bio: 20, el: 60, fos: 20, remark: 'kept' },
    { series: 'a', year: 2030, bio: 10, el: 30, fos: 60 },
    { series: 'b', year: 2030, bio: 100, el: 300, fos: 600 }
  ],
  settings: [{ setting: 'title', waarde: 'Mix' }, { setting: 'showLegend', waarde: 'No' }, { setting: 'myOwn', waarde: 'kept' }]
})
const make = () => normalizeDocument(raw()).doc
const plain = doc => JSON.parse(JSON.stringify({ axes: doc.axes, series: doc.series, points: doc.points, settings: doc.settings }, (k, v) => (k === '_uid' ? undefined : v)))
const bytes = data => (typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data))
const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`)

// ---- model ----

test('points are normalised to shares and sorted by year', () => {
  const m = buildModel(make())
  const a = m.series[0]
  assert.deepEqual(a.points.map(p => p.year), [2030, 2040])
  assert.deepEqual(a.points[0].shares, { left: 0.1, right: 0.3, bottom: 0.6 })
  assert.deepEqual(m.series[1].points[0].shares, { left: 0.1, right: 0.3, bottom: 0.6 })
  assert.equal(m.series[1].points[0].total, 1000)
  assert.equal(m.series[0].highlight, true)
  assert.equal(m.series[1].visible, false)
  assert.equal(m.series[1].dashed, true)
})

test('points that cannot be placed are kept out of the drawing, not out of the document', () => {
  const r = raw()
  r.points.push({ series: 'a', year: 2050, bio: 0, el: 0, fos: 0 }, { series: 'a', year: 2060, bio: 'x', el: 1, fos: 1 }, { series: 'a', year: 2070, bio: -1, el: 1, fos: 1 })
  const doc = normalizeDocument(r).doc
  assert.equal(doc.points.length, 6)
  const m = buildModel(doc)
  assert.equal(m.series[0].points.length, 2)
  assert.deepEqual(m.unplaced.map(u => u.reason), ['zero', 'values', 'values'])
})

test('without an axes table the first three numeric columns become the corners', () => {
  const { doc, notes } = normalizeDocument({ points: [{ scenario: 's1', jaar: '2030', x: '1,5', y: 2, z: 3, note: 'n' }] })
  assert.deepEqual(doc.axes.map(a => a.id), ['x', 'y', 'z'])
  assert.deepEqual(doc.axes.map(a => a.corner), ['left', 'right', 'bottom'])
  assert.equal(doc.points[0].series, 's1')
  assert.equal(doc.points[0].year, 2030)
  assert.equal(doc.points[0].x, 1.5)
  assert.equal(doc.series[0].id, 's1')
  assert.equal(notes.length, 1)
})

// ---- files ----

for (const format of ['xlsx', 'json', 'yaml']) {
  test(`${format}: reading back what was written gives the same document`, () => {
    const doc = make()
    const out = writeDocument(doc, format)
    const back = readDocument(`x.${format}`, bytes(out.data))
    const norm = d => { const p = plain(d); p.series.forEach(s => { ['highlight', 'visible'].forEach(k => { s[k] = s[k] === true || s[k] === 'Yes' }) }); return p }
    assert.deepEqual(norm(back.doc), norm(doc))
    assert.equal(back.doc.points[0].remark, 'kept')
    assert.equal(back.doc.series[0].source, 'kept')
    assert.equal(back.doc.settings.myOwn, 'kept')
    assert.equal(getSetting(back.doc, 'showLegend'), false)
    assert.ok(!JSON.stringify(out.data.length ? String(out.data) : '').includes('_uid'))
  })
}

test('xlsx: other sheets and their order survive, with upper-case sheet names', () => {
  const XLSX = globalThis.XLSX
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['hello']]), 'Notes')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(raw().points), 'POINTS')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['x']]), 'Sources')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(raw().axes), 'Axes')
  const opened = readDocument('x.xlsx', new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' })))
  const out = XLSX.read(writeDocument(opened.doc, 'xlsx', opened).data, { type: 'array' })
  assert.deepEqual(out.SheetNames, ['Notes', 'POINTS', 'Sources', 'Axes', 'series', 'settings'])
  assert.equal(XLSX.utils.sheet_to_json(out.Sheets.POINTS).length, 3)
})

test('a file of the other editor is recognised', () => {
  const sankey = normalizeSankey({ nodes: [{ id: 'a', x: 0, y: 0 }], links: [], carriers: [], settings: [] }).doc
  for (const format of ['xlsx', 'json', 'yaml']) {
    assert.throws(() => readDocument(`s.${format}`, bytes(writeSankey(sankey, format).data)), /sankey/i)
    assert.throws(() => readSankey(`t.${format}`, bytes(writeDocument(make(), format).data)), /ternary editor/)
  }
})

test('the shipped example, starter and template have no issues', () => {
  const dir = new URL('../ternary/data/', import.meta.url)
  const x = readDocument('e.xlsx', new Uint8Array(readFileSync(new URL('ternary_example_file.xlsx', dir))))
  const y = readDocument('e.yaml', new Uint8Array(readFileSync(new URL('ternary_example_file.yaml', dir))))
  assert.deepEqual(validateDocument(x.doc), [])
  assert.deepEqual(plain(x.doc).points, plain(y.doc).points)
  assert.deepEqual(validateDocument(starterDocument()), [])
  assert.deepEqual(validateDocument(readDocument('t.xlsx', new Uint8Array(templateWorkbook())).doc), [])
})

// ---- commands ----

test('renaming a series keeps its points attached; deleting it deletes them', () => {
  const doc = make()
  const next = cmd.updateSeries(doc, doc.series[0]._uid, { id: 'aa' })
  assert.deepEqual(next.points.map(p => p.series), ['aa', 'aa', 'b'])
  assert.deepEqual(cmd.deleteItems(doc, { series: [doc.series[0]._uid] }).points.map(p => p.series), ['b'])
})

test('moving a point keeps its total', () => {
  const doc = make()
  const uid = doc.points[2]._uid
  const p = cmd.setPointShares(doc, uid, { bio: 1 / 3, el: 1 / 3, fos: 1 / 3 }, 1000).points[2]
  assert.equal(p.bio + p.el + p.fos, 1000)
  assert.ok([p.bio, p.el, p.fos].every(v => Math.abs(v - 333) <= 1))
  const odd = cmd.setPointShares(doc, uid, { bio: 0.2, el: 0.3, fos: 0.5 }, 1879.5).points[2]
  near(odd.bio + odd.el + odd.fos, 1879.5)
  const small = cmd.setPointShares(doc, uid, { bio: 0.123, el: 0.4, fos: 0.477 }, 1).points[2]
  near(small.bio, 0.123, 0.0006)
})

test('renaming a corner’s column moves the values; a taken or reserved name is refused', () => {
  const doc = make()
  const el = doc.axes[1]
  const next = cmd.updateAxis(doc, el._uid, { id: 'power' })
  assert.ok(next.points.every(p => p.power > 0 && !('el' in p)))
  for (const bad of ['fos', 'series', 'Year', '', '_x']) assert.equal(cmd.updateAxis(doc, el._uid, { id: bad }), doc)
})

test('giving a corner another position swaps it with the one there', () => {
  const doc = make()
  const next = cmd.updateAxis(doc, doc.axes[0]._uid, { corner: 'bottom' })
  assert.deepEqual(next.axes.map(a => a.corner), ['bottom', 'right', 'left'])
  assert.equal(cmd.updateAxis(doc, doc.axes[0]._uid, { corner: 'middle' }), doc)
})

test('the next point continues the series’ rhythm', () => {
  const doc = make()
  assert.equal(cmd.nextYear(doc, 'a'), 2050)
  assert.equal(cmd.nextYear(doc, 'b'), 2035)
  assert.equal(cmd.nextYear(doc, 'none'), 2030)
})

test('row edits from the grid: booleans, numbers and new rows', () => {
  const doc = make()
  let next = cmd.applyRowEdits(doc, 'series', [{ uid: doc.series[0]._uid, patch: { visible: 'No' } }])
  assert.equal(seriesIsVisible(next.series[0]), false)
  next = cmd.applyRowEdits(next, 'points', [], [{ series: 'a', year: '2050', bio: '1,5', el: 2, fos: 3 }])
  assert.equal(next.points[3].bio, 1.5)
  assert.equal(next.points[3].year, 2050)
})

test('undo restores a moved point', () => {
  const store = createStore(make())
  const uid = store.doc.points[0]._uid
  store.apply('Move point', d => cmd.setPointShares(d, uid, { bio: 0.5, el: 0.25, fos: 0.25 }, 100))
  assert.equal(store.doc.points[0].bio, 50)
  store.undo()
  assert.equal(store.doc.points[0].bio, 20)
})

// ---- validation ----

test('validation finds missing series, bad values, duplicates and empty series', () => {
  const r = raw()
  r.series.push({ id: 'empty', title: 'Empty' })
  r.points.push({ series: 'a', year: 2040, bio: 1, el: 1, fos: 1 }, { series: 'a', year: 2060, bio: -1, el: 1, fos: 1 }, { series: 'a', year: '', bio: 1, el: 1, fos: 1 }, { series: '', year: 2030, bio: 1, el: 1, fos: 1 }, { series: 'a', year: 2070, el: 1, fos: 1 })
  const doc = normalizeDocument(r).doc
  const text = validateDocument(doc).map(i => `${i.severity} ${i.message}`).join('\n')
  for (const re of [/warning a has 2 points for 2040 \(rows 2, 5\)/, /negative value for Bio/, /has no year/, /has no series/, /no value for Bio/, /"Empty"/]) assert.match(text, re)
})

// ---- geometry ----

test('zoomed bounds lie just below the data and never zoom in on almost nothing', () => {
  const pts = [{ left: 0.2, right: 0.3, bottom: 0.5 }, { left: 0.3, right: 0.5, bottom: 0.2 }]
  assert.deepEqual(computeDomain(pts, true).lo, { left: 0.15, right: 0.25, bottom: 0.15 })
  assert.deepEqual(computeDomain(pts, false).lo, { left: 0, right: 0, bottom: 0 })
  const one = computeDomain([{ left: 0.3, right: 0.3, bottom: 0.4 }], true).lo
  assert.ok(1 - one.left - one.right - one.bottom >= 0.25 - 1e-9)
})

test('screen and shares map both ways, in full, zoomed and stretched plots', () => {
  const box = { x: 100, y: 50, w: 700, h: 400 }
  for (const domain of [computeDomain([], false), computeDomain([{ left: 0.2, right: 0.3, bottom: 0.5 }, { left: 0.3, right: 0.5, bottom: 0.2 }], true)]) {
    for (const stretch of [1, 2]) {
      const g = makeGeometry(domain, box, { stretch })
      const s = { left: 0.25, right: 0.4, bottom: 0.35 }
      const [x, y] = g.at(s)
      const back = g.sharesAt(x, y)
      near(back.left, 0.25); near(back.right, 0.4); near(back.bottom, 0.35)
      assert.ok(g.bbox.x0 >= box.x - 1e-6 && g.bbox.x1 <= box.x + box.w + 1e-6 && g.bbox.y1 <= box.y + box.h + 1e-6)
    }
  }
})

test('corners sit top left, top right and bottom', () => {
  const g = makeGeometry(computeDomain([], false), { x: 0, y: 0, w: 1000, h: 800 })
  const [l, r, b] = [g.at({ left: 1, right: 0, bottom: 0 }), g.at({ left: 0, right: 1, bottom: 0 }), g.at({ left: 0, right: 0, bottom: 1 })]
  assert.ok(l[0] < b[0] && b[0] < r[0] && l[1] === r[1] && b[1] > l[1])
  near(Math.hypot(r[0] - l[0], r[1] - l[1]), Math.hypot(r[0] - b[0], r[1] - b[1]), 1e-6) // equilateral when not stretched
})

test('mixes outside the triangle are pulled to its edge', () => {
  const c = clampShares({ left: -0.2, right: 0.9, bottom: 0.3 })
  near(c.left + c.right + c.bottom, 1)
  assert.equal(c.left, 0)
  assert.ok(Object.values(clampShares({ left: NaN, right: NaN, bottom: NaN })).every(Number.isFinite))
})

test('grid lines stay inside the visible region', () => {
  const domain = computeDomain([{ left: 0.2, right: 0.3, bottom: 0.5 }, { left: 0.3, right: 0.5, bottom: 0.2 }], true)
  const step = gridStep(domain, 'auto')
  assert.ok([0.05, 0.1, 0.2].includes(step))
  assert.equal(gridStep(domain, '0.25'), 0.25)
  assert.ok(tickValues(domain, 'right', step).every(v => v >= domain.lo.right - 1e-9))
  assert.ok(domainPolygon(domain).length >= 3)
  assert.equal(clipSegment(domain, [0, 0], [0, 1]), null)
})
