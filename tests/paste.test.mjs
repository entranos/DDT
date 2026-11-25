import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseTable, planPaste } from '../shared/src/paste.js'

const columns = ['source', 'target', 'value', 'carrier', 'type'].map(key => ({ key }))

test('parses tab-separated text from a spreadsheet, including quoted cells', () => {
  assert.deepEqual(parseTable('a\tb\r\nc\t"d\te"\n"say ""hi"""\t\n\n'), [['a', 'b'], ['c', 'd\te'], ['say "hi"', '']])
})

test('rows with a header line are added as new rows, matched by column name', () => {
  const plan = planPaste({ rows: parseTable('Carrier\tsource.id\tTarget\tvalue\ngas\ta\tb\t3,5'), columns, rowCount: 10 })
  assert.equal(plan.header, true)
  assert.deepEqual(plan.newRows, [{ carrier: 'gas', source: 'a', target: 'b', value: '3,5' }])
})

test('rows without a header fill cells from the selected cell and add rows past the end', () => {
  const plan = planPaste({ rows: parseTable('5\tgas\n6\theat\n7\toil'), columns, startRow: 1, startCol: 2, rowCount: 3 })
  assert.equal(plan.header, false)
  assert.deepEqual(plan.edits, [{ index: 1, patch: { value: '5', carrier: 'gas' } }, { index: 2, patch: { value: '6', carrier: 'heat' } }])
  assert.deepEqual(plan.newRows, [{ value: '7', carrier: 'oil' }])
})

test('read-only columns are never written', () => {
  const plan = planPaste({ rows: [['1', '2']], columns: [{ key: 'x' }, { key: '_in', readOnly: true }], rowCount: 1 })
  assert.deepEqual(plan.edits, [{ index: 0, patch: { x: '1' } }])
})
