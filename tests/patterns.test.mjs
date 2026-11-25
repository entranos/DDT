import './setup.mjs'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PATTERN_NAMES, patternName, patternOf, fillOf, unknownPatterns } from '../shared/src/patterns.js'
import { normalizeDocument as sankeyDoc } from '../sankey/src/model/schema.js'
import { validateDocument as validateSankey } from '../sankey/src/model/validate.js'
import { normalizeDocument as treemapDoc, documentToFileData as treemapData } from '../treemap/src/model/schema.js'
import { buildModel as treemapModel } from '../treemap/src/model/tiles.js'
import { validateDocument as validateTreemap } from '../treemap/src/model/validate.js'
import { treemapFromSankey } from '../treemap/src/io/fromSankey.js'
import { normalizeDocument as waterfallDoc } from '../waterfall/src/model/schema.js'
import { buildModel as waterfallModel } from '../waterfall/src/model/steps.js'
import { validateDocument as validateWaterfall } from '../waterfall/src/model/validate.js'
import { normalizeDocument as chartDoc } from '../barchart/src/model/schema.js'
import { buildModel as chartModel } from '../barchart/src/model/chart.js'
import { readDocument as readWaterfall, writeDocument as writeWaterfall } from '../waterfall/src/io/formats.js'

globalThis.d3 = createRequire(import.meta.url)('../shared/vendor/d3-7.9.0.min.js')

test('pattern names, in English and Dutch, with spaces or capitals', () => {
  PATTERN_NAMES.forEach(n => assert.equal(patternName(n), n))
  assert.equal(patternName('Hatched'), 'diagonal')
  assert.equal(patternName('gestreept'), 'stripes')
  assert.equal(patternName('arcering'), 'diagonal')
  assert.equal(patternName('Diagonal down'), 'diagonal-down')
  assert.equal(patternName('stippen'), 'dots')
  assert.equal(patternName(''), '')
  assert.equal(patternName(undefined), '')
  assert.equal(patternName('none'), '')
  assert.equal(patternName('plaid'), null)
})

test('the first pattern that says anything counts; "none" overrides', () => {
  assert.equal(patternOf('', 'dots'), 'dots')
  assert.equal(patternOf('none', 'dots'), '')
  assert.equal(patternOf('waves', 'dots'), 'waves')
  assert.equal(patternOf(undefined, null, ' '), '')
  assert.equal(patternOf('plaid', 'dots'), '', 'an unknown name draws plain')
  assert.deepEqual(unknownPatterns([{ pattern: 'plaid' }, { pattern: 'dots' }, {}]).map(r => r.pattern), ['plaid'])
})

test('a second colour goes with the row that names the pattern', () => {
  assert.deepEqual(fillOf({ pattern: 'stripes', patterncolor: '#0f0' }), { pattern: 'stripes', mark: '#00ff00' })
  assert.deepEqual(fillOf({}, { pattern: 'stripes', patterncolor: '#112233' }), { pattern: 'stripes', mark: '#112233' })
  assert.deepEqual(fillOf({ patterncolor: '#445566' }, { pattern: 'stripes', patterncolor: '#112233' }), { pattern: 'stripes', mark: '#445566' })
  assert.deepEqual(fillOf({ pattern: 'dots' }, { pattern: 'stripes', patterncolor: '#112233' }), { pattern: 'dots', mark: null })
  assert.deepEqual(fillOf({ pattern: 'none', patterncolor: '#112233' }, { pattern: 'dots' }), { pattern: '', mark: null })
  assert.deepEqual(fillOf({ patterncolor: '#112233' }, null), { pattern: '', mark: null })
  assert.deepEqual(fillOf({ pattern: 'dots', patterncolor: 'green' }), { pattern: 'dots', mark: null })
})

test('two-colour fills in every model; a bad second colour is an issue', () => {
  const two = { pattern: 'stripes', patterncolor: '#112233' }
  const t = treemapModel(treemapDoc({ blocks: [{ id: 'x' }], carriers: [{ id: 'g', ...two }], values: [{ block: 'x', carrier: 'g', value: 1 }] }).doc)
  assert.deepEqual([t.tiles[0].pattern, t.tiles[0].mark, t.legend[0].mark], ['stripes', '#112233', '#112233'])
  const w = waterfallModel(waterfallDoc({ carriers: [{ id: 'g' }], values: [{ diagram: 'a', carrier: 'g', 2030: 1, 2040: 2, ...two }] }).doc)
  assert.deepEqual([w.diagrams[0].totals[0].segments[0].mark, w.diagrams[0].periods[0].steps[0].mark], ['#112233', '#112233'])
  const b = chartModel(chartDoc({ bars: [{ title: 'A', x: 1 }, { title: 'B', x: 2, ...two }, { title: 'C', x: 1, x_pattern: 'stripes', x_patterncolor: '#445566' }], series: [{ id: 'x' }] }).doc)
  assert.deepEqual(b.bars.map(v => v.parts[0].mark), [null, '#112233', '#445566'])
  const bad = sankeyDoc({ nodes: [{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 1, y: 0 }], links: [{ source: 'a', target: 'b', value: 1, carrier: 'g' }], carriers: [{ id: 'g', color: '#000', pattern: 'stripes', patterncolor: 'green' }] }).doc
  assert.ok(validateSankey(bad).some(i => i.key.startsWith('patterncolor')))
})

test('sankey: unknown patterns are issues', () => {
  const { doc } = sankeyDoc({ nodes: [{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 1, y: 0 }], links: [{ source: 'a', target: 'b', value: 1, carrier: 'g', pattern: 'plaid' }], carriers: [{ id: 'g', color: '#000', pattern: 'dots' }] })
  const found = validateSankey(doc).filter(i => i.key.startsWith('pattern'))
  assert.equal(found.length, 1)
  assert.match(found[0].message, /"plaid" of the flow from "a" to "b"/)
})

test('treemap: a tile takes its own pattern, or its carrier’s; files keep both', () => {
  const { doc } = treemapDoc({
    blocks: [{ id: 'x' }], carriers: [{ id: 'g', pattern: 'dots' }, { id: 'h' }],
    values: [{ block: 'x', carrier: 'g', value: 1 }, { block: 'x', carrier: 'h', value: 2, pattern: 'waves' }]
  })
  const model = treemapModel(doc)
  assert.deepEqual(model.tiles.map(t => t.pattern), ['dots', 'waves'])
  assert.deepEqual(model.legend.map(l => l.pattern), ['dots', ''])
  assert.deepEqual(treemapData(doc, 'json').values.map(v => v.pattern), [undefined, 'waves'])
  assert.equal(validateTreemap(treemapDoc({ blocks: [{ id: 'x' }], carriers: [{ id: 'g', pattern: 'zz' }], values: [{ block: 'x', carrier: 'g', value: 1 }] }).doc).filter(i => i.key.startsWith('pattern')).length, 1)
})

test('a treemap made from a sankey keeps its patterns', () => {
  const { doc } = sankeyDoc({ nodes: [{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 1, y: 0 }], links: [{ source: 'a', target: 'b', value: 1, carrier: 'g', pattern: 'grid' }], carriers: [{ id: 'g', color: '#000', pattern: 'dots' }] })
  const made = treemapFromSankey(doc).doc
  assert.equal(made.carriers[0].pattern, 'dots')
  assert.equal(made.values[0].pattern, 'grid')
})

test('waterfall: pattern is not a moment; values can have their own', () => {
  const { doc } = waterfallDoc({
    diagrams: [{ id: 'a' }, { id: 'b' }], carriers: [{ id: 'g', pattern: 'dots' }],
    values: [{ diagram: 'a', carrier: 'g', 2030: 1, 2040: 2 }, { diagram: 'b', carrier: 'g', 2030: 1, 2040: 3, pattern: 'none' }]
  })
  assert.deepEqual(doc.moments.map(m => m.id), ['2030', '2040'])
  const model = waterfallModel(doc)
  assert.deepEqual(model.diagrams.map(d => d.totals[0].segments[0].pattern), ['dots', ''])
  assert.deepEqual(model.diagrams.map(d => d.periods[0].steps[0].pattern), ['dots', ''])
  const again = readWaterfall('x.yaml', new TextEncoder().encode(writeWaterfall(doc, 'yaml').data)).doc
  assert.equal(again.values[1].pattern, 'none')
  assert.equal(validateWaterfall(waterfallDoc({ carriers: [{ id: 'g', pattern: 'zz' }], values: [{ diagram: 'a', carrier: 'g', 2030: 1 }] }).doc).filter(i => i.key.startsWith('pattern')).length, 1)
})
