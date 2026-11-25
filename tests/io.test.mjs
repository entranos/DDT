import './setup.mjs'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { readDocument, writeDocument } from '../sankey/src/io/formats.js'
import { normalizeDocument, getSetting } from '../sankey/src/model/schema.js'
import { templateWorkbook, starterDocument } from '../sankey/src/io/template.js'

const example = name => new Uint8Array(readFileSync(new URL(`../sankey/data/${name}`, import.meta.url)))

// Comparable form of a document: rows without internal keys, settings as parsed values.
function canonical (doc) {
  const strip = rows => rows.map(r => Object.fromEntries(Object.entries(r).filter(([k]) => !k.startsWith('_'))))
  const settings = Object.fromEntries(Object.keys(doc.settings).map(k => [k, getSetting(doc, k)]))
  return { nodes: strip(doc.nodes), links: strip(doc.links), carriers: strip(doc.carriers), settings }
}

function roundTrip (doc, format, context) {
  const { data } = writeDocument(doc, format, context)
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data)
  return readDocument(`roundtrip.${format === 'yaml' ? 'yaml' : format}`, bytes)
}

for (const file of ['fluxdata_example_file.xlsx', 'fluxdata_example_file.yaml']) {
  test(`reads ${file}`, () => {
    const { doc } = readDocument(file, example(file))
    assert.equal(doc.nodes.length, 41)
    assert.equal(doc.links.length, 39)
    assert.equal(doc.carriers.length, 5)
    assert.equal(getSetting(doc, 'unit'), 'miljard euro')
    assert.equal(getSetting(doc, 'showValueLabels'), true)
    assert.ok(doc.links.every(l => typeof l.value === 'number'))
  })

  for (const format of ['xlsx', 'json', 'yaml']) {
    test(`${file} survives a round trip through ${format}`, () => {
      const opened = readDocument(file, example(file))
      const back = roundTrip(opened.doc, format, { workbook: opened.workbook, sheetNames: opened.sheetNames })
      assert.deepEqual(canonical(back.doc), canonical(opened.doc))
    })
  }
}

test('xlsx and yaml examples hold the same diagram', () => {
  const a = canonical(readDocument('x.xlsx', example('fluxdata_example_file.xlsx')).doc)
  const b = canonical(readDocument('x.yaml', example('fluxdata_example_file.yaml')).doc)
  assert.deepEqual(a.nodes.map(n => [n.id, n.x, n.y]), b.nodes.map(n => [n.id, n.x, n.y]))
  assert.deepEqual(a.links.map(l => [l.source, l.target, l.value, l.carrier]), b.links.map(l => [l.source, l.target, l.value, l.carrier]))
})

test('legacy source.id / target.id columns are migrated', () => {
  const { doc, notes } = normalizeDocument({
    nodes: [{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 100, y: 0 }],
    links: [{ 'source.id': 'a', 'target.id': 'b', value: '5', legend: 'gas' }],
    carriers: [{ id: 'gas', color: '#000' }],
    settings: [{ setting: 'showValueLabels', waarde: 'No' }]
  })
  assert.equal(doc.links[0].source, 'a')
  assert.equal(doc.links[0].target, 'b')
  assert.equal(doc.links[0].value, 5)
  assert.equal(doc.links[0].carrier, 'gas')
  assert.ok(!('source.id' in doc.links[0]))
  assert.equal(notes.length, 2)
  assert.equal(getSetting(doc, 'showValueLabels'), false)
  const back = roundTrip(doc, 'xlsx', {})
  assert.deepEqual(Object.keys(back.doc.links[0]).filter(k => !k.startsWith('_')).slice(0, 4), ['source', 'target', 'value', 'carrier'])
})

test('yes/no settings stay yes/no in xlsx', () => {
  const { doc } = normalizeDocument({ nodes: [], links: [], settings: [{ setting: 'showValueLabels', waarde: 'No' }] })
  const { data } = writeDocument(doc, 'xlsx', {})
  const XLSX = globalThis.XLSX
  const wb = XLSX.read(new Uint8Array(data), { type: 'array' })
  assert.deepEqual(XLSX.utils.sheet_to_json(wb.Sheets.settings), [{ setting: 'showValueLabels', waarde: 'No' }])
})

test('other sheets in a workbook are kept, in place', () => {
  const XLSX = globalThis.XLSX
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['note'], ['keep me']]), 'Notes')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([{ source: 'a', target: 'b', value: 1, carrier: 'c' }]), 'Links')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 10, y: 0 }]), 'Nodes')
  const bytes = new Uint8Array(XLSX.write(wb, { bookType: 'xlsx', type: 'array' }))
  const opened = readDocument('in.xlsx', bytes)
  const { data } = writeDocument(opened.doc, 'xlsx', { workbook: opened.workbook, sheetNames: opened.sheetNames })
  const out = XLSX.read(new Uint8Array(data), { type: 'array' })
  assert.deepEqual(out.SheetNames.slice(0, 3), ['Notes', 'Links', 'Nodes'])
  assert.deepEqual(XLSX.utils.sheet_to_json(out.Sheets.Notes), [{ note: 'keep me' }])
  assert.equal(out.Custprops.SankeyEditorSchemaVersion, '2')
})

test('legacy snky_ sheet names are read', () => {
  const XLSX = globalThis.XLSX
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([{ 'source.id': 'a', 'target.id': 'b', value: 1, carrier: 'c' }]), 'snky__links')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 10, y: 0 }]), 'snky__nodes')
  const opened = readDocument('legacy.xlsx', new Uint8Array(XLSX.write(wb, { bookType: 'xlsx', type: 'array' })))
  assert.equal(opened.doc.links[0].source, 'a')
  assert.equal(opened.doc.nodes.length, 2)
})

test('unknown files give a readable error', () => {
  assert.throws(() => readDocument('x.json', new TextEncoder().encode('[1,2,3]')), /does not contain a diagram/)
  const XLSX = globalThis.XLSX
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['a']]), 'Sheet1')
  assert.throws(() => readDocument('x.xlsx', new Uint8Array(XLSX.write(wb, { bookType: 'xlsx', type: 'array' }))), /no "links" or "nodes" sheet/)
})

test('the template opens as a valid diagram', () => {
  const opened = readDocument('template.xlsx', new Uint8Array(templateWorkbook()))
  assert.deepEqual(canonical(opened.doc).links, canonical(starterDocument()).links)
  assert.equal(getSetting(opened.doc, 'showValueLabels'), true)
})
