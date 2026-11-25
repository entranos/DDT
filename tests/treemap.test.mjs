import './setup.mjs'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { normalizeDocument, getSetting, carrierColor, iconRows } from '../treemap/src/model/schema.js'
import * as cmd from '../treemap/src/model/commands.js'
import { buildModel, shadeOf } from '../treemap/src/model/tiles.js'
import { inkOn, softColor, readableColor, contrast } from '../shared/src/color.js'
import { iconOf, ICONS, needsLibrary, unknownIcons, libraryIconsIn } from '../shared/src/icons.js'
import { setIconData, findIcons, iconCategories, libraryPath } from '../shared/src/iconLibrary.js'
import { validateDocument } from '../treemap/src/model/validate.js'
import { layoutTreemap } from '../treemap/src/render/layout.js'
import { readDocument, writeDocument } from '../treemap/src/io/formats.js'
import { readDocument as readSankey, writeDocument as writeSankey } from '../sankey/src/io/formats.js'
import { readDocument as readTernary } from '../ternary/src/io/formats.js'
import { normalizeDocument as normalizeSankey } from '../sankey/src/model/schema.js'
import { starterDocument, templateWorkbook } from '../treemap/src/io/template.js'

globalThis.d3 = createRequire(import.meta.url)('../shared/vendor/d3-7.9.0.min.js')

const raw = () => ({
  blocks: [
    { id: 'ind', title: 'Industry', group: 'Use', icon: 'industry', visible: 'Yes', owner: 'kept' },
    { id: 'res', title: 'Buildings', group: 'Use', visible: 'Yes' },
    { id: 'pow', title: 'Power', group: 'Conversion', visible: 'No' }
  ],
  values: [
    { block: 'ind', carrier: 'gas', part: 'Steel', value: 30, note: 'kept' },
    { block: 'ind', carrier: 'gas', part: 'Chemicals', value: 70 },
    { block: 'ind', carrier: 'el', value: 50 },
    { block: 'res', carrier: 'el', value: '80,5' },
    { block: 'pow', carrier: 'gas', value: 200 }
  ],
  carriers: [
    { id: 'el', title: 'Electricity', color: '#D6BC7C' },
    { id: 'gas', title: 'Gas', color: '#57a' }
  ],
  settings: [{ setting: 'title', waarde: 'T' }, { setting: 'tileNames', waarde: 'Yes' }, { setting: 'myOwn', waarde: 'kept' }]
})
const make = (extra = {}) => normalizeDocument({ ...raw(), ...extra }).doc
const plain = doc => JSON.parse(JSON.stringify({ blocks: doc.blocks, values: doc.values, carriers: doc.carriers, settings: doc.settings }, (k, v) => (k === '_uid' ? undefined : v)))
const bytes = data => (typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data))

// ---- model ----

test('rows for one block and carrier become one tile with parts; hidden blocks are left out', () => {
  const m = buildModel(make())
  assert.deepEqual(m.blocks.map(b => b.title), ['Industry', 'Buildings'])
  const gas = m.blocks[0].tiles.find(t => t.label === 'Gas')
  assert.equal(gas.value, 100)
  assert.deepEqual(gas.parts.map(p => [p.label, p.value]), [['Chemicals', 70], ['Steel', 30]])
  assert.equal(gas.uids.length, 2)
  assert.equal(m.total, 230.5)
  assert.deepEqual(m.blocks[0].tiles.map(t => t.label), ['Electricity', 'Gas']) // the carriers table's order
  assert.deepEqual(m.legend.map(l => l.label), ['Electricity', 'Gas'])
})

test('per carrier turns it around, in shades of the carrier’s colour', () => {
  const doc = make({ settings: [{ setting: 'view', waarde: 'carrier' }] })
  const m = buildModel(doc)
  assert.deepEqual(m.blocks.map(b => b.title), ['Electricity', 'Gas'])
  const el = m.blocks[0]
  assert.deepEqual(el.tiles.map(t => t.label), ['Industry', 'Buildings'])
  assert.notEqual(el.tiles[0].color, el.tiles[1].color)
  assert.equal(m.blocks[1].tiles[0].color, carrierColor(doc, doc.carriers[1])) // a single tile keeps the colour itself
  assert.deepEqual(m.legend.map(l => [l.label, l.color]), [['Industry', null], ['Buildings', null]])
})

test('multiply, order by size, and values that can’t be drawn', () => {
  const doc = make({ settings: [{ setting: 'multiply', waarde: 0.5 }, { setting: 'order', waarde: 'size' }], values: [...raw().values, { block: 'ind', carrier: 'el', value: 'x' }, { block: 'ind', carrier: 'el', value: -3 }] })
  const m = buildModel(doc)
  assert.equal(m.blocks[0].total, 75)
  assert.deepEqual(m.blocks[0].tiles.map(t => t.value), [50, 25])
  assert.equal(m.unplaced.length, 2)
})

test('colours: three-digit hex, fallback, shades and ink', () => {
  const doc = make()
  assert.equal(carrierColor(doc, doc.carriers[1]), '#5577aa')
  assert.match(carrierColor(doc, { id: 'x' }), /^#[0-9a-f]{6}$/i)
  assert.equal(shadeOf('#5577aa', 0, 1), '#5577aa')
  assert.equal(inkOn('#222222'), '#FFFFFF')
  assert.equal(inkOn('#F5F3EF'), '#2B2B2B')
  assert.equal(inkOn('#86AF8C', { text: true }), '#2B2B2B')
  assert.match(softColor('#ff0000'), /^#[0-9a-f]{6}$/)
  assert.ok(contrast(readableColor('#F8D377'), '#FFFFFF') >= 4.2)
  assert.equal(readableColor('#222222'), '#222222')
})

test('icons: by name, by a known ID, own drawing, none', () => {
  assert.equal(iconOf({ id: 'q', icon: 'industry' }).path, ICONS.industry)
  assert.equal(iconOf({ id: 'elektriciteitsproductie' }).name, 'power-plant')
  assert.equal(iconOf({ id: 'solar_pv' }).name, 'solar')
  assert.equal(iconOf({ id: 'q', icon: 'M3 3h4' }).path, 'M3 3h4')
  assert.equal(iconOf({ id: 'electricity', icon: 'none' }), null)
  assert.equal(iconOf({ id: 'something else' }), null)
})

test('icons from the full library: needed, found, unknown, searched', () => {
  const doc = make({ blocks: [{ id: 'ind', title: 'I', icon: 'tabler:train' }, { id: 'res', icon: 'Building wind turbine' }, { id: 'pow', icon: 'no-such-icon' }] })
  assert.equal(needsLibrary(iconRows(make())), false) // known names and IDs don't need it
  assert.equal(needsLibrary(iconRows(doc)), true)
  assert.equal(iconOf(doc.blocks[0]), null)
  assert.deepEqual(unknownIcons(iconRows(doc)), [])
  const data = JSON.parse(readFileSync(new URL('../shared/icons/tabler-outline-3.52.0.json', import.meta.url)))
  setIconData(data)
  assert.ok(Object.keys(data.icons).length > 5000)
  assert.equal(needsLibrary(iconRows(doc)), false)
  assert.equal(iconOf(doc.blocks[0]).name, 'tabler:train')
  assert.equal(iconOf(doc.blocks[1]).path, libraryPath('building-wind-turbine'))
  assert.equal(iconOf({ id: 'x', icon: 'car' }).path, ICONS.car) // the energy icons come first
  assert.notEqual(iconOf({ id: 'x', icon: 'tabler:car' }).path, ICONS.car)
  assert.deepEqual(unknownIcons(iconRows(doc)).map(b => b.id), ['pow'])
  assert.deepEqual(libraryIconsIn(iconRows(doc)), ['tabler:train'])
  assert.equal(findIcons({ query: 'train' })[0].name, 'train')
  assert.equal(findIcons({ query: 'trein' })[0].name, 'train')
  assert.ok(findIcons({ query: 'wind turbine' }).some(i => i.name === 'building-wind-turbine'))
  assert.equal(findIcons({ query: 'qqqq' }).length, 0)
  assert.ok(iconCategories().includes('Vehicles'))
  assert.ok(findIcons({ category: 'Vehicles' }).every(i => i.category === 'Vehicles'))
  for (const [path] of Object.values(data.icons)) assert.match(path, /^M[\d.\s,a-zA-Z+-]+$/)
})

test('a value can have its own icon, in both views', () => {
  const doc = make({ values: [{ block: 'ind', carrier: 'gas', value: 1, icon: 'nuclear' }, { block: 'res', carrier: 'gas', value: 1 }, { block: 'ind', carrier: 'el', value: 1, icon: 'none' }], carriers: [{ id: 'gas' }, { id: 'el', icon: 'electricity' }] })
  const tile = (d, b, c) => buildModel(d).tiles.find(t => t.key === `${b}\u0000${c}`)
  assert.equal(tile(doc, 'ind', 'gas').icon.path, ICONS.nuclear)
  assert.equal(tile(doc, 'res', 'gas').icon.path, ICONS.gas)
  assert.equal(tile(doc, 'ind', 'el').icon, null)
  const perCarrier = { ...doc, settings: { view: 'carrier' } }
  assert.equal(tile(perCarrier, 'ind', 'gas').icon.path, ICONS.nuclear)
  assert.equal(readDocument('x.json', bytes(writeDocument(doc, 'json').data)).doc.values[0].icon, 'nuclear')
})

// ---- layout ----

const pad = { groupGap: 40, groupLabel: 30, blockGap: 18, blockHead: 30, tileGap: 0 }
const perUnit = b => b.tiles.reduce((s, t) => s + (t.x1 - t.x0) * (t.y1 - t.y0), 0) / b.block.total
const example = () => readDocument('e.xlsx', new Uint8Array(readFileSync(new URL('../treemap/data/treemap_example_file.xlsx', import.meta.url)))).doc

for (const chart of ['treemap', 'bars']) {
  test(`${chart}: every block is on one scale and inside the box`, () => {
    const l = layoutTreemap(buildModel(example()), { width: 1080, height: 640, chart, pad })
    const scales = l.blocks.map(perUnit)
    assert.ok(Math.max(...scales) / Math.min(...scales) < 1.01, `${Math.min(...scales)}–${Math.max(...scales)}`)
    assert.ok(l.blocks.every(b => b.x0 >= -0.01 && b.y0 >= -0.01 && b.x1 <= 1080.01 && b.y1 <= 640.01))
    assert.equal(l.blocks.reduce((n, b) => n + b.tiles.length, 0), 34)
    assert.equal(l.skipped.length, 0)
  })
}

test('a fixed area per unit draws at that scale, smaller or larger than the box', () => {
  const model = buildModel(example())
  const fit = layoutTreemap(model, { width: 1080, height: 640, chart: 'treemap', pad }).perUnit
  for (const f of [0.3, 0.8, 1.5]) {
    const l = layoutTreemap(model, { width: 1080, height: 640, chart: 'treemap', pad, areaPerUnit: fit * f })
    assert.ok(Math.abs(l.perUnit / (fit * f) - 1) < 0.01, `${l.perUnit} vs ${fit * f}`)
    assert.equal(l.width < 1080, f < 1)
  }
})

test('layout is the same every time', () => {
  const doc = example()
  const run = () => JSON.stringify(layoutTreemap(buildModel(doc), { width: 1080, height: 640, chart: 'treemap', pad }).blocks.map(b => [b.x0, b.y0, b.x1, b.y1]))
  assert.equal(run(), run())
})

test('slivers are left out and reported; nothing to draw gives null', () => {
  const doc = make({ values: [...raw().values, { block: 'res', carrier: 'gas', value: 0.1 }] })
  const l = layoutTreemap(buildModel(doc), { width: 800, height: 500, chart: 'treemap', pad })
  assert.deepEqual(l.skipped.map(t => t.value), [0.1])
  assert.equal(layoutTreemap(buildModel(make({ values: [] })), { width: 800, height: 500, chart: 'treemap', pad }), null)
})

// ---- files ----

for (const format of ['xlsx', 'json', 'yaml']) {
  test(`${format}: reading back what was written gives the same document`, () => {
    const doc = make()
    const out = writeDocument(doc, format)
    const back = readDocument(`x.${format}`, bytes(out.data))
    const norm = d => { const p = plain(d); p.blocks.forEach(b => { b.visible = b.visible === true || b.visible === 'Yes' }); return p }
    assert.deepEqual(norm(back.doc), norm(doc))
    assert.equal(back.doc.blocks[0].owner, 'kept')
    assert.equal(back.doc.values[0].note, 'kept')
    assert.equal(back.doc.settings.myOwn, 'kept')
    assert.equal(getSetting(back.doc, 'tileNames'), true)
    assert.equal(back.doc.values[3].value, 80.5)
  })
}

test('a values table with a column per carrier is read too', () => {
  const { doc, notes } = normalizeDocument({ values: [{ sector: 'ind', gas: 10, el: '2,5' }, { sector: 'res', gas: 4, el: 0 }], carriers: [{ id: 'gas', color: '#555555' }] })
  assert.deepEqual(doc.values.map(v => [v.block, v.carrier, v.value]), [['ind', 'gas', 10], ['ind', 'el', 2.5], ['res', 'gas', 4]])
  assert.deepEqual(doc.blocks.map(b => b.id), ['ind', 'res'])
  assert.deepEqual(doc.carriers.map(c => c.id), ['gas', 'el'])
  assert.ok(notes.length)
})

test('a sankey file opens as a new treemap; its end nodes are drawn', () => {
  const sankey = normalizeSankey({
    nodes: [{ id: 'src', title: 'Source', x: 0, y: 0 }, { id: 'mid', title: '.Middle', x: 1, y: 0 }, { id: 'end', title: '_End', x: 2, y: 0 }],
    links: [{ source: 'src', target: 'mid', value: 10, carrier: 'gas' }, { source: 'mid', target: 'end', value: 6, carrier: 'el' }, { source: 'src', target: 'end', value: 3, carrier: 'gas', annotate: 'direct' }],
    carriers: [{ id: 'gas', color: '#57a' }, { id: 'el', color: '#db7' }],
    settings: [{ setting: 'unit', waarde: 'PJ' }]
  }).doc
  for (const format of ['xlsx', 'json', 'yaml']) {
    const r = readDocument(`s.${format}`, bytes(writeSankey(sankey, format).data))
    assert.equal(r.asNew, true)
    assert.equal(r.format, 'xlsx')
    assert.deepEqual(r.doc.blocks.map(b => [b.id, b.title, b.visible]), [['end', 'End', true], ['mid', 'Middle', false]])
    const m = buildModel(r.doc)
    assert.equal(m.total, 9)
    assert.equal(getSetting(r.doc, 'unit'), 'PJ')
    assert.deepEqual(validateDocument(r.doc), [])
  }
})

test('the other editors say where a treemap file belongs', () => {
  for (const format of ['xlsx', 'json', 'yaml']) {
    const data = bytes(writeDocument(make(), format).data)
    assert.throws(() => readSankey(`t.${format}`, data), /treemap editor/)
    assert.throws(() => readTernary(`t.${format}`, data), /treemap editor/)
  }
})

test('the shipped example, starter and template have no issues', () => {
  const y = readDocument('e.yaml', new Uint8Array(readFileSync(new URL('../treemap/data/treemap_example_file.yaml', import.meta.url))))
  assert.deepEqual(validateDocument(example()), [])
  assert.deepEqual(plain(example()).values.map(v => [v.block, v.carrier, v.value]), plain(y.doc).values.map(v => [v.block, v.carrier, v.value]))
  assert.deepEqual(validateDocument(starterDocument()), [])
  assert.deepEqual(validateDocument(readDocument('t.xlsx', new Uint8Array(templateWorkbook())).doc), [])
})

// ---- commands ----

test('renaming a block or carrier keeps its values attached; deleting deletes them', () => {
  const doc = make()
  assert.deepEqual(cmd.updateBlock(doc, doc.blocks[0]._uid, { id: 'industry' }).values.map(v => v.block), ['industry', 'industry', 'industry', 'res', 'pow'])
  assert.deepEqual(cmd.updateCarrier(doc, doc.carriers[1]._uid, { id: 'methane' }).values.filter(v => v.carrier === 'methane').length, 3)
  assert.equal(cmd.deleteItems(doc, { blocks: [doc.blocks[0]._uid] }).values.length, 2)
  assert.equal(cmd.deleteItems(doc, { carriers: [doc.carriers[1]._uid] }).values.length, 2)
})

test('moving a block reorders it and takes it into the other group', () => {
  const doc = make()
  const [ind, res, pow] = doc.blocks.map(b => b._uid)
  const next = cmd.moveBlock(doc, ind, pow, false)
  assert.deepEqual(next.blocks.map(b => b.id), ['res', 'ind', 'pow'])
  assert.equal(next.blocks[1].group, 'Conversion')
  assert.equal(cmd.moveBlock(doc, ind, res, false), doc)
  assert.deepEqual(cmd.stepRow(doc, 'blocks', res, -1, [ind, res]).blocks.map(b => b.id), ['res', 'ind', 'pow'])
  assert.equal(cmd.stepRow(doc, 'blocks', ind, -1, [ind, res]), doc)
})

test('renaming a group, adding carriers with a free colour, adding what is missing', () => {
  const doc = make()
  assert.deepEqual(cmd.renameGroup(doc, 'Use', 'Final use').blocks.map(b => b.group), ['Final use', 'Final use', 'Conversion'])
  const c = cmd.addCarrier(doc, { id: 'h2', title: 'Hydrogen' }).carriers[2]
  assert.match(c.color, /^#/)
  const broken = cmd.addValue(doc, { block: 'new', carrier: 'coal', value: 1 })
  assert.equal(validateDocument(broken).filter(i => i.fix && i.fix.action === 'addMissing').length, 2)
  const fixed = cmd.addMissing(broken)
  assert.deepEqual(validateDocument(fixed).filter(i => i.severity === 'error'), [])
})

// ---- validation ----

test('validation finds bad amounts, duplicates, unused and empty items', () => {
  const doc = make({
    values: [...raw().values, { block: 'ind', carrier: 'el', value: 1 }, { block: 'ind', carrier: '', value: 1 }, { block: 'res', carrier: 'gas', value: '' }, { block: 'res', carrier: 'gas', value: -1 }, { block: 'res', carrier: 'gas', value: 'lots' }],
    carriers: [...raw().carriers, { id: 'spare', title: 'Spare', color: 'red' }, { id: 'gas', title: 'Twice' }],
    blocks: [...raw().blocks, { id: 'nothing', title: 'Nothing' }]
  })
  const text = validateDocument(doc).map(i => `${i.severity} ${i.message}`).join('\n')
  for (const re of [/info ind, el appears 2 times/, /has no carrier/, /has no amount/, /is negative/, /"lots" is not a number/, /not a hex code: "red"/, /error Carrier ID "gas" is used 2 times/, /no values: "Nothing"/, /not used: "Spare"/]) assert.match(text, re)
})
