import './setup.mjs'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { normalizeDocument, getSetting } from '../sankey/src/model/schema.js'
import * as cmd from '../sankey/src/model/commands.js'
import { validateDocument } from '../sankey/src/model/validate.js'
import { flowIcon, carrierIcon, iconPosition, measure } from '../sankey/src/render/flowIcons.js'
import { readDocument, writeDocument } from '../sankey/src/io/formats.js'
import { readDocument as readTreemap } from '../treemap/src/io/formats.js'

globalThis.d3 = createRequire(import.meta.url)('../shared/vendor/d3-7.9.0.min.js')

const make = (settings = []) => normalizeDocument({
  nodes: ['a', 'b', 'c', 'd'].map((id, i) => ({ id, x: i * 100, y: 0 })),
  links: [
    { source: 'a', target: 'b', value: 5, carrier: 'hydrogen' },
    { source: 'a', target: 'c', value: 5, carrier: 'gas', icon: 'none' },
    { source: 'a', target: 'd', value: 5, carrier: 'mine', icon: 'sun', iconposition: 30 },
    { source: 'b', target: 'd', value: 5, carrier: 'gas' }
  ],
  carriers: [{ id: 'hydrogen', color: '#888888' }, { id: 'gas', color: '#777777', icon: 'gas' }, { id: 'mine', color: '#666666' }],
  settings
}).doc
const name = icon => (icon ? icon.name : null)

test('a flow shows its own icon, or its carrier’s; nothing shows until one is chosen', () => {
  const doc = make()
  assert.deepEqual(doc.links.map(l => name(flowIcon(doc, l))), [null, null, 'sun', 'gas'])
  assert.equal(carrierIcon(doc, doc.carriers[0]), null)
})

test('icons for all flows adds those of well-known carrier IDs; none hides everything', () => {
  const all = make([{ setting: 'flowIcons', waarde: 'all' }])
  assert.deepEqual(all.links.map(l => name(flowIcon(all, l))), ['hydrogen', null, 'sun', 'gas'])
  const none = make([{ setting: 'flowIcons', waarde: 'none' }])
  assert.deepEqual(none.links.map(l => flowIcon(none, l)), [null, null, null, null])
})

test('icons go where the flows spread out, unless placed', () => {
  const doc = make()
  // a fans out to three nodes; d is reached by two flows.
  assert.deepEqual(doc.links.map(l => iconPosition(doc, l)), [0.75, 0.75, 0.3, 0.25])
  const start = make([{ setting: 'flowIconPosition', waarde: 'start' }])
  assert.deepEqual(start.links.map(l => iconPosition(start, l)), [0.2, 0.2, 0.3, 0.2])
  assert.equal(getSetting(make([{ setting: 'flowIconPosition', waarde: 'nonsense' }]), 'flowIconPosition'), 'auto')
})

test('a place along a line, and back', () => {
  const m = measure([[0, 0], [10, 0], [10, 30]])
  assert.deepEqual(m.at(0), [0, 0])
  assert.deepEqual(m.at(0.5), [10, 10])
  assert.deepEqual(m.at(1), [10, 30])
  assert.ok(Math.abs(m.nearest([14, 10]) - 0.5) < 1e-9)
})

test('icons and places survive every file format, and a bad place is reported', () => {
  const doc = make([{ setting: 'flowIcons', waarde: 'all' }])
  for (const format of ['xlsx', 'json', 'yaml']) {
    const out = writeDocument(doc, format).data
    const back = readDocument(`x.${format}`, typeof out === 'string' ? new TextEncoder().encode(out) : new Uint8Array(out)).doc
    assert.deepEqual(back.links.map(l => l.icon), [undefined, 'none', 'sun', undefined])
    assert.equal(back.links[2].iconposition, 30)
    assert.equal(back.carriers[1].icon, 'gas')
    assert.equal(getSetting(back, 'flowIcons'), 'all')
  }
  const bad = cmd.updateLink(doc, doc.links[0]._uid, { iconposition: '140' })
  assert.ok(validateDocument(bad).some(i => /not a percentage/.test(i.message)))
  assert.ok(!validateDocument(cmd.updateLink(doc, doc.links[2]._uid, { iconposition: '' })).some(i => /percentage/.test(i.message)))
})

test('a treemap made from the sankey diagram keeps the icons', () => {
  const r = readTreemap('x.json', new TextEncoder().encode(writeDocument(make(), 'json').data)).doc
  assert.equal(r.carriers.find(c => c.id === 'gas').icon, 'gas')
  assert.equal(r.values.find(v => v.carrier === 'mine').icon, 'sun')
})
