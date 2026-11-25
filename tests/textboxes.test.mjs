import './setup.mjs'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { attachTexts, ensureTexts, addText, updateText, deleteTexts, orderTexts, duplicateTexts, textRowEdits, deleteTextColumn, textIssues, wrapText, layoutText, textDefaults, weightOf, alignOf, readTextsFrom, addTextsTo, DEFAULT_WIDTH } from '../shared/src/textBoxes.js'
import { readDocument as readTreemap, writeDocument as writeTreemap } from '../treemap/src/io/formats.js'
import { readDocument as readSankey, writeDocument as writeSankey } from '../sankey/src/io/formats.js'

globalThis.d3 = createRequire(import.meta.url)('../shared/vendor/d3-7.9.0.min.js')
const XLSX = globalThis.XLSX
const bytes = data => (typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data))
const measure = (s, px) => s.length * px * 0.5 // every letter half as wide as it is high
const base = () => ({ settings: {}, meta: {} })

test('text boxes from a file: aliases, numbers, internal IDs, column order', () => {
  const doc = attachTexts(base(), [{ tekst: 'Hi', x: '10', y: '20,5', width: 100, extra: 'kept' }, { text: 7 }], ['tekst', 'x', 'y', 'width', 'extra'])
  assert.deepEqual(doc.texts.map(t => [t.text, t.x, t.y]), [['Hi', 10, 20.5], ['7', undefined, undefined]])
  assert.ok(doc.texts.every(t => t._uid))
  assert.deepEqual(doc.meta.textColumns, ['text', 'x', 'y', 'width', 'extra'])
  const old = ensureTexts(base())
  assert.deepEqual([old.texts, old.meta.textColumns], [[], []])
  assert.equal(ensureTexts(doc), doc, 'a document that has them stays the same')
})

test('editing text boxes', () => {
  let doc = ensureTexts(base())
  doc = addText(doc, { text: 'A', x: 1, y: 2, width: 100 })
  doc = addText(doc, { text: 'B', x: 5, y: 5 })
  const [a, b] = doc.texts.map(t => t._uid)
  assert.equal(updateText(doc, a, { x: 1 }), doc, 'no change, same document')
  doc = updateText(doc, a, { x: '12.345', visible: 'No' })
  assert.deepEqual([doc.texts[0].x, doc.texts[0].visible, doc.texts[0].text], [12.35, false, 'A'])
  assert.deepEqual(orderTexts(doc, [a], 'front').texts.map(t => t.text), ['B', 'A'])
  assert.equal(orderTexts(doc, [b], 'front'), doc)
  const dup = duplicateTexts(doc, [b])
  assert.deepEqual(dup.doc.texts.map(t => [t.text, t.x]), [['A', 12.35], ['B', 5], ['B', 21]])
  assert.notEqual(dup.uids[0], b)
  assert.deepEqual(deleteTexts(doc, [a]).texts.map(t => t.text), ['B'])
  const pasted = textRowEdits(doc, [{ uid: b, patch: { size: '20' } }], [{ text: 'C' }])
  assert.deepEqual([pasted.texts[1].size, pasted.texts[2].text, pasted.texts[2].width], [20, 'C', DEFAULT_WIDTH])
  const extra = attachTexts(base(), [{ text: 'x', note: 1 }])
  assert.ok(!('note' in deleteTextColumn(extra, 'note').texts[0]))
})

test('wrapping: own line breaks, then words, then letters of a word too long', () => {
  assert.deepEqual(wrapText('one two three', 40, 10, 400, '', measure), ['one two', 'three'])
  assert.deepEqual(wrapText('a\n\nb', 100, 10, 400, '', measure), ['a', '', 'b'])
  assert.deepEqual(wrapText('abcdefghij', 25, 10, 400, '', measure), ['abcde', 'fghij'])
  assert.deepEqual(wrapText('', 100, 10, 400, '', measure), [''])
})

test('layout: the box is at least as high as its text; defaults come from the diagram', () => {
  const ctx = { size: 10, color: '#222222', font: 'x', measure }
  const l = layoutText({ text: 'one two three four', x: 3, y: 4, width: 50 }, ctx)
  assert.deepEqual([l.x, l.y, l.width, l.px, l.pad, l.lines.length], [3, 4, 50, 10, 5, 3])
  assert.equal(l.height, l.needed)
  assert.equal(layoutText({ text: 'a', width: 50, height: 300 }, ctx).height, 300)
  assert.equal(layoutText({ text: 'a', width: 50, height: 2 }, ctx).height, layoutText({ text: 'a', width: 50 }, ctx).needed)
  assert.equal(layoutText({ text: 'a', width: 1 }, ctx).width, 30, 'never narrower than two letters')
  assert.equal(layoutText({ text: 'a' }, ctx).width, DEFAULT_WIDTH)
  assert.equal(layoutText({ text: 'a', size: 20 }, ctx).px, 20)
  assert.equal(layoutText({ text: 'a', background: '#111111' }, ctx).color, '#FFFFFF', 'readable on a dark background')
  assert.equal(layoutText({ text: 'a', background: '#111111', color: '#ff0000' }, ctx).color, '#ff0000')
  assert.deepEqual(textDefaults(k => ({ labelFontSize: 11, labelTextColor: '#000000', font: '' })[k]), { size: 11, color: '#000000', font: textDefaults(() => '').font })
  assert.deepEqual([weightOf('bold'), weightOf(500), weightOf(''), alignOf('Centre'), alignOf('x')], [700, 500, 400, 'center', 'left'])
})

test('colours that aren’t hex codes are issues', () => {
  const doc = attachTexts(base(), [{ text: 'a', color: 'red', background: '#fff' }, { text: 'b' }])
  assert.deepEqual(textIssues(doc).map(i => i.targets[0].uid), [doc.texts[0]._uid])
})

const withTexts = doc => attachTexts(doc, [{ text: 'Note\nsecond line', x: 40, y: 50, width: 180, visible: true, size: 16 }, { text: 'Hidden', visible: false }])

test('files: a texts sheet in Excel, a texts list in JSON and YAML; other editors’ tables unchanged', () => {
  const file = readFileSync(new URL('../treemap/data/treemap_example_file.xlsx', import.meta.url))
  const doc = withTexts(readTreemap('x.xlsx', file).doc)
  for (const format of ['xlsx', 'json', 'yaml']) {
    const data = addTextsTo(format, writeTreemap(doc, format).data, doc)
    const again = readTreemap(`x.${format}`, bytes(data))
    assert.equal(again.doc.values.length, doc.values.length, format)
    const found = readTextsFrom(format, bytes(data))
    const back = attachTexts(again.doc, found.rows, found.header)
    assert.deepEqual(back.texts.map(t => [t.text, t.x, t.y, t.width, t.size]), [['Note\nsecond line', 40, 50, 180, 16], ['Hidden', undefined, undefined, undefined, undefined]], format)
    assert.equal(String(back.texts[1].visible).toLowerCase() === 'no' || back.texts[1].visible === false, true)
  }
  const xlsx = XLSX.read(bytes(addTextsTo('xlsx', writeTreemap(doc, 'xlsx').data, doc)), { type: 'array' })
  assert.deepEqual(xlsx.SheetNames, ['values', 'blocks', 'carriers', 'settings', 'texts'])
  assert.equal(xlsx.Custprops.TreemapEditorSchemaVersion, '1', 'the editor’s own file properties stay')
})

test('a texts sheet of the file that was opened is replaced, or removed when there are none left', () => {
  const doc = withTexts(readSankey('x.xlsx', readFileSync(new URL('../sankey/data/fluxdata_example_file.xlsx', import.meta.url))).doc)
  const first = addTextsTo('xlsx', writeSankey(doc, 'xlsx').data, doc)
  const opened = readSankey('x.xlsx', bytes(first))
  const changed = { ...doc, texts: doc.texts.slice(0, 1).map(t => ({ ...t, text: 'Changed' })) }
  const second = XLSX.read(bytes(addTextsTo('xlsx', writeSankey(changed, 'xlsx', opened).data, changed)), { type: 'array' })
  assert.equal(second.SheetNames.filter(n => n === 'texts').length, 1)
  assert.deepEqual(XLSX.utils.sheet_to_json(second.Sheets.texts).map(r => r.text), ['Changed'])
  const none = { ...doc, texts: [] }
  const third = XLSX.read(bytes(addTextsTo('xlsx', writeSankey(none, 'xlsx', opened).data, none)), { type: 'array' })
  assert.ok(!third.SheetNames.includes('texts'))
  const plain = writeSankey(none, 'json').data
  assert.equal(addTextsTo('json', plain, none), plain, 'without text boxes a file is left as the editor wrote it')
  assert.equal(readTextsFrom('json', bytes(plain)), null)
})
