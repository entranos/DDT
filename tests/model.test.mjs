import './setup.mjs'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeDocument } from '../sankey/src/model/schema.js'
import * as cmd from '../sankey/src/model/commands.js'
import { createStore } from '../shared/src/store.js'
import { validateDocument } from '../sankey/src/model/validate.js'

const make = () => normalizeDocument({
  nodes: [
    { id: 'a', title: 'A', x: 0, y: 0 },
    { id: 'b', title: 'B', x: 100, y: 0 },
    { id: 'c', title: 'C', x: 200, y: 0 },
    { id: 'lonely', title: 'Lonely', x: 300, y: 0 }
  ],
  links: [
    { source: 'a', target: 'b', value: 10, carrier: 'gas', legend: 'gas' },
    { source: 'b', target: 'c', value: 7, carrier: 'gas', legend: 'gas' }
  ],
  carriers: [{ id: 'gas', color: '#f00' }, { id: 'heat', color: '#0f0' }],
  settings: []
}).doc

test('renaming a node keeps its flows attached', () => {
  const doc = make()
  const b = doc.nodes[1]
  const next = cmd.updateNode(doc, b._uid, { id: 'bee' })
  assert.deepEqual(next.links.map(l => [l.source, l.target]), [['a', 'bee'], ['bee', 'c']])
})

test('deleting a node deletes its flows', () => {
  const doc = make()
  const next = cmd.deleteItems(doc, { nodes: [doc.nodes[1]._uid] })
  assert.equal(next.nodes.length, 3)
  assert.equal(next.links.length, 0)
})

test('renaming a carrier updates carrier and legend on flows', () => {
  const doc = make()
  const next = cmd.updateCarrier(doc, doc.carriers[0]._uid, { id: 'natural_gas' })
  assert.ok(next.links.every(l => l.carrier === 'natural_gas' && l.legend === 'natural_gas'))
})

test('changing a flow carrier keeps the legend column in step', () => {
  const doc = make()
  const next = cmd.updateLink(doc, doc.links[0]._uid, { carrier: 'heat' })
  assert.equal(next.links[0].legend, 'heat')
})

test('unchanged edits return the same document', () => {
  const doc = make()
  assert.equal(cmd.updateNode(doc, doc.nodes[0]._uid, { title: 'A' }), doc)
  assert.equal(cmd.moveNodes(doc, [{ uid: doc.nodes[0]._uid, x: 0, y: 0 }]), doc)
})

test('align and distribute', () => {
  const doc = make()
  const uids = doc.nodes.slice(0, 3).map(n => n._uid)
  const moved = cmd.moveNodes(doc, [{ uid: uids[1], x: 100, y: 50 }, { uid: uids[2], x: 200, y: 120 }])
  const aligned = cmd.alignNodes(moved, uids, 'top')
  assert.deepEqual(aligned.nodes.slice(0, 3).map(n => n.y), [0, 0, 0])
  const spread = cmd.distributeNodes(cmd.moveNodes(doc, [{ uid: uids[1], x: 30, y: 0 }]), uids, 'x')
  assert.deepEqual(spread.nodes.slice(0, 3).map(n => n.x), [0, 100, 200])
})

test('store: undo, redo, coalescing and dirty state', () => {
  const store = createStore(make())
  assert.equal(store.isDirty(), false)
  const uid = store.doc.nodes[0]._uid
  store.apply('Move', d => cmd.moveNodes(d, [{ uid, x: 5, y: 0 }]))
  store.apply('Title', d => cmd.updateNode(d, uid, { title: 'A1' }), { coalesce: 'title' })
  store.apply('Title', d => cmd.updateNode(d, uid, { title: 'A12' }), { coalesce: 'title' })
  assert.equal(store.isDirty(), true)
  assert.equal(store.undo(), 'Title')
  assert.equal(store.doc.nodes[0].title, 'A')
  assert.equal(store.doc.nodes[0].x, 5)
  store.undo()
  assert.equal(store.doc.nodes[0].x, 0)
  assert.equal(store.isDirty(), false)
  store.redo()
  store.redo()
  assert.equal(store.doc.nodes[0].title, 'A12')
  store.markSaved()
  assert.equal(store.isDirty(), false)
  assert.equal(store.apply('Noop', d => d), false)
})

test('validation finds the problems the old error popup reported, and more', () => {
  const doc = normalizeDocument({
    nodes: [{ id: 'a', x: 0, y: 0 }, { id: 'a', x: 1.5, y: 0 }, { id: 'b', x: 'x', y: 0 }, { id: 'c', x: 0, y: 0 }],
    links: [
      { source: 'a', target: 'zzz', value: 1, carrier: 'gas' },
      { source: 'a', target: 'b', value: 1 },
      { source: 'a', target: 'b', value: 2, carrier: 'gas', type: 'x' },
      { source: 'a', target: 'b', value: 3, carrier: 'gas', type: 'x' },
      { source: 'b', target: 'c', value: 'lots', carrier: 'oil' }
    ],
    carriers: [{ id: 'gas', color: '#f00' }, { id: 'unused', color: '#0f0' }]
  }).doc
  const keys = validateDocument(doc).map(i => i.key.replace(/-[a-z]_[a-z0-9]+$/, ''))
  for (const k of ['node-dup', 'node-pos', 'node-nonint', 'link-unknown', 'link-missing', 'link-dup', 'link-value', 'link-carrier', 'unused-carriers']) {
    assert.ok(keys.includes(k), `expected ${k} in ${keys.join(', ')}`)
  }
})

test('validation flags unbalanced nodes but not sources and sinks', () => {
  const doc = normalizeDocument({
    nodes: [{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 1, y: 0 }, { id: 'c', x: 2, y: 0 }],
    links: [{ source: 'a', target: 'b', value: 10, carrier: 'g' }, { source: 'b', target: 'c', value: 4, carrier: 'g' }],
    carriers: [{ id: 'g', color: '#000' }]
  }).doc
  const balance = validateDocument(doc).filter(i => i.key.startsWith('balance'))
  assert.equal(balance.length, 1)
  assert.match(balance[0].message, /out of balance by -6/)
})
