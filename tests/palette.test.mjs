import './setup.mjs'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { oklch, fromOklch, mixOklab, difference, seenAs, contrastOf, closestPair, isHex, toHex } from '../shared/src/colorMath.js'
import { STANDARD_COLORS, standardColorOf, standardColor, nextStandardColor } from '../shared/src/standardPalette.js'
import { STYLES, DEFAULTS, random, makeColors, assignColors, backgroundSettings, review, parseColors, mainColors, extend, along } from '../shared/src/palette.js'
import { normalizeDocument as chartDoc } from '../barchart/src/model/schema.js'
import { palette as chartPalette } from '../barchart/src/ui/palette.js'
import { normalizeDocument as ternaryDoc } from '../ternary/src/model/schema.js'
import { palette as ternaryPalette } from '../ternary/src/ui/palette.js'
import { normalizeDocument as chordDoc } from '../chord/src/model/schema.js'
import { palette as chordPalette } from '../chord/src/ui/palette.js'
import { normalizeDocument as sankeyDoc } from '../sankey/src/model/schema.js'
import { palette as sankeyPalette } from '../sankey/src/ui/palette.js'
import { normalizeDocument as treemapDoc } from '../treemap/src/model/schema.js'
import * as chordCommands from '../chord/src/model/commands.js'

globalThis.d3 = createRequire(import.meta.url)('../shared/vendor/d3-7.9.0.min.js')
const HEX = /^#[0-9A-F]{6}$/

test('colours go to OKLCH and back; what can’t be shown comes as near as it gets', () => {
  ;['#3B78B0', '#E0A93B', '#000000', '#FFFFFF', '#C8586F'].forEach(c => assert.equal(fromOklch(oklch(c)), c))
  assert.match(fromOklch({ l: 0.7, c: 0.5, h: 140 }), HEX)
  assert.ok(Math.abs(oklch(fromOklch({ l: 0.7, c: 0.5, h: 140 })).h - 140) < 3)
  assert.equal(mixOklab('#000000', '#FFFFFF', 0), '#000000')
  assert.ok(contrastOf('#000', '#fff') > 20)
  assert.ok(difference('#3B78B0', '#3B78B0') === 0 && difference('#000', '#fff') > 90)
  assert.ok(difference(seenAs('#C8586F', 'deutan'), seenAs('#3F9A74', 'deutan')) < difference('#C8586F', '#3F9A74') / 4)
  assert.equal(toHex('abc'), '#AABBCC')
})

test('the standard palette: by meaning in Dutch and English, otherwise in order', () => {
  assert.equal(standardColorOf('elektriciteit'), standardColorOf('Electricity'))
  assert.equal(standardColorOf('waterstof'), '#7862C6')
  assert.equal(standardColorOf('mt_biomassa'), standardColorOf('biomass'))
  assert.equal(standardColorOf('Verlies'), '#B9B2A6')
  assert.equal(standardColorOf('something'), null)
  assert.equal(standardColor(1, 'something'), STANDARD_COLORS[1])
  assert.equal(nextStandardColor(['#E0A93B'], 'elektriciteit'), STANDARD_COLORS[0], 'a colour that is taken isn’t used twice')
  assert.equal(nextStandardColor([], 'warmte'), '#C8586F')
  assert.equal(new Set(STANDARD_COLORS).size, STANDARD_COLORS.length)
  // Neighbours in the order can be told apart, also by colour-blind readers.
  STANDARD_COLORS.slice(0, 8).slice(1).forEach((c, i) => { assert.ok(difference(c, STANDARD_COLORS[i]) > 15); ['protan', 'deutan'].forEach(k => assert.ok(difference(seenAs(c, k), seenAs(STANDARD_COLORS[i], k)) > 8)) })
})

test('rows without a colour get the standard one in every editor', () => {
  assert.equal(chartDoc({ bars: [{ title: 'A', warmte: 1, iets: 2 }] }).doc.series[0].color, '#C8586F')
  assert.equal(chordDoc({ flows: [{ source: 'a', target: 'b', carrier: 'waterstof', value: 1 }] }).doc.carriers[0].color, '#7862C6')
  assert.equal(treemapDoc({ values: [{ block: 'x', carrier: 'methaan', value: 1 }] }).doc.carriers[0].color, '#3B78B0')
  assert.equal(sankeyDoc({ nodes: [], links: [], carriers: [{ id: 'elektriciteit' }] }).doc.carriers[0].color, '#E0A93B')
  assert.equal(chordCommands.addCarrier(chordDoc({ flows: [] }).doc, { title: 'Warmte' }).carriers[0].color, '#C8586F')
})

test('every style makes any number of colours, the same for the same seed', () => {
  STYLES.forEach(s => [1, 2, 3, 7, 12, 19].forEach(n => {
    const o = { style: s.id, seed: 99, own: '#123456 #abcdef', picture: ['#111111', '#eeeeee'] }
    const a = makeColors(n, o)
    assert.equal(a.length, n, `${s.id} ${n}`)
    a.forEach(c => assert.match(c, HEX, `${s.id}: ${c}`))
    assert.deepEqual(makeColors(n, o), a)
  }))
  assert.deepEqual(makeColors(0, { style: 'balanced' }), [])
})

test('another seed is another palette; a variation is a little different', () => {
  const a = makeColors(6, { style: 'balanced', seed: 1 })
  assert.notDeepEqual(a, makeColors(6, { style: 'balanced', seed: 2 }))
  const v = makeColors(6, { style: 'mono', seed: 1, variation: 3 })
  const m = makeColors(6, { style: 'mono', seed: 1 })
  assert.notDeepEqual(v, m)
  v.forEach((c, i) => assert.ok(difference(c, m[i]) < 12))
})

test('a gradient of one colour goes from light to dark in that hue, or the other way', () => {
  const g = makeColors(7, { style: 'mono', seed: 5, base: '#3B78B0' })
  const l = g.map(c => oklch(c).l)
  l.slice(1).forEach((x, i) => assert.ok(x < l[i], 'darker each step'))
  g.forEach(c => { const d = Math.abs(((oklch(c).h - oklch('#3B78B0').h + 540) % 360) - 180); assert.ok(d < 25, `hue of ${c}`) })
  assert.deepEqual(makeColors(7, { style: 'mono', seed: 5, base: '#3B78B0', reverse: true }), [...g].reverse())
  const duo = makeColors(5, { style: 'duo', base: '#3B78B0', base2: '#E0A93B' })
  assert.deepEqual([duo[0], duo[4]], ['#3B78B0', '#E0A93B'])
  assert.equal(along(['#000000', '#FFFFFF'], 3).length, 3)
  const div = makeColors(5, { style: 'diverging', base: '#3B78B0', base2: '#C8586F' }).map(c => oklch(c).l)
  assert.ok(div[2] > div[1] && div[1] > div[0] && div[2] > div[3] && div[3] > div[4])
})

test('keeping colours apart gives palettes that are easier to read', () => {
  const worst = apart => [1, 2, 3, 4, 5].reduce((t, seed) => t + closestPair(makeColors(7, { style: 'balanced', seed, apart })).difference, 0)
  assert.ok(worst(true) > worst(false))
  assert.equal(review(['#3B78B0', '#3C79B1']).level, 'poor')
  assert.equal(review(['#000000', '#E0A93B', '#FFFFFF'], '#777777').level, 'good')
  assert.equal(review(['#F5F3EF', '#3B78B0'], '#F5F3EF').faint, 1)
})

test('tone: hue, strength, lightness and contrast; none of it leaves the colours as they are', () => {
  const own = { style: 'own', own: '#3B78B0, #E0A93B' }
  assert.deepEqual(makeColors(2, own), ['#3B78B0', '#E0A93B'])
  assert.ok(oklch(makeColors(2, { ...own, chroma: 0 })[0]).c < 0.01)
  assert.ok(oklch(makeColors(2, { ...own, light: 0.15 })[0]).l > oklch('#3B78B0').l + 0.1)
  const turned = oklch(makeColors(2, { ...own, hue: 90 })[0]).h
  assert.ok(Math.abs(((turned - oklch('#3B78B0').h - 90 + 540) % 360) - 180) < 6)
  const flat = makeColors(2, { ...own, contrast: 0.2 }).map(c => oklch(c).l)
  assert.ok(Math.abs(flat[0] - flat[1]) < Math.abs(oklch('#3B78B0').l - oklch('#E0A93B').l) * 0.4)
})

const T = (n, extra = () => ({})) => Array.from({ length: n }, (_, i) => ({ uid: `u${i}`, names: [`n${i}`], weight: i, ...extra(i) }))

test('locked colours stay; by size the largest come first in a gradient', () => {
  const locked = new Map([['u1', '#FF0000']])
  const a = assignColors(T(5), { style: 'balanced', seed: 3 }, locked)
  assert.equal(a.get('u1'), '#FF0000')
  assert.equal(a.size, 5)
  const bySize = assignColors(T(4), { style: 'mono', seed: 3, order: 'size' })
  const l = [0, 1, 2, 3].map(i => oklch(bySize.get(`u${i}`)).l)
  assert.ok(l[3] < l[2] && l[2] < l[1] && l[1] < l[0], 'the largest is the darkest')
  assert.notDeepEqual([...assignColors(T(6), { style: 'mono', seed: 3, order: 'shuffle' })], [...assignColors(T(6), { style: 'mono', seed: 3 })])
})

test('groups get one colour each, with shades inside', () => {
  const targets = T(6, i => ({ group: i < 3 ? 'a' : 'b' }))
  const m = assignColors(targets, { style: 'triad', seed: 8 })
  const h = targets.map(t => oklch(m.get(t.uid)).h)
  const apart = (x, y) => Math.abs(((x - y + 540) % 360) - 180)
  assert.ok(apart(h[0], h[1]) < 30 && apart(h[3], h[5]) < 30 && apart(h[0], h[3]) > 30)
  assert.equal(new Set(m.values()).size, 6)
  const free = assignColors(targets, { style: 'triad', seed: 8, grouped: false })
  assert.notDeepEqual([...free], [...m])
})

test('the standard style keeps meaning, and fills in the rest without repeats', () => {
  const m = assignColors([{ uid: 1, names: ['warmte'] }, { uid: 2, names: ['x'] }, { uid: 3, names: ['waterstof'] }, { uid: 4, names: ['y'] }], { style: 'standard' })
  assert.equal(m.get(1), '#C8586F')
  assert.equal(m.get(3), '#7862C6')
  assert.equal(new Set(m.values()).size, 4)
})

test('own colours are read from any text, and extended when there are too few', () => {
  assert.deepEqual(parseColors('rgb: #3b78b0, E0A93B; "#abc" and word'), ['#3B78B0', '#E0A93B', '#AABBCC'])
  assert.equal(parseColors('no colours here').length, 0)
  const e = extend(['#3B78B0', '#E0A93B'], 5)
  assert.equal(new Set(e).size, 5)
  assert.ok(e.every(isHex))
})

test('the main colours of a picture', () => {
  const px = []
  for (let i = 0; i < 400; i++) px.push(...(i < 250 ? [200, 60, 80] : i < 350 ? [40, 110, 180] : [240, 240, 235]), 255)
  const found = mainColors(new Uint8ClampedArray(px), 6)
  assert.equal(found.length, 3)
  assert.ok(found.some(c => difference(c, '#C83C50') < 3) && found.some(c => difference(c, '#286EB4') < 3))
  assert.deepEqual(mainColors(new Uint8ClampedArray([1, 2, 3, 0])), [])
})

test('backgrounds: texts go with them', () => {
  assert.deepEqual(backgroundSettings('keep', []), {})
  const dark = backgroundSettings('dark', ['#3B78B0'])
  assert.ok(contrastOf(dark.textColor, dark.backgroundColor) > 9 && contrastOf(dark.mutedTextColor, dark.backgroundColor) > 4)
  const tint = backgroundSettings('tint', ['#3B78B0'])
  assert.ok(contrastOf(tint.textColor, tint.backgroundColor) > 10)
})

test('Rijkshuisstijl: its own colours, exactly', () => {
  const all = ['#007BC7', '#FFB612', '#275937', '#CA005D', '#8FCAE7', '#E17000', '#42145F', '#76D2B6', '#D52B1E', '#777C00', '#F092CD', '#154273', '#94710A', '#39870C', '#A90061', '#01689B', '#F9E11E', '#673327']
  const made = makeColors(18, { style: 'rijk', seed: 5 })
  assert.deepEqual([...made].sort(), [...all].sort())
  ;['rijkCool', 'rijkWarm'].forEach(id => makeColors(6, { style: id, seed: 5 }).forEach(c => assert.ok(all.includes(c), `${id} ${c}`)))
  assert.equal(makeColors(5, { style: 'rijkBlue' })[0], '#154273')
  const tints = makeColors(4, { style: 'rijkTints', seed: 11 })
  assert.ok(all.includes(tints[0]))
  tints.slice(1).forEach((c, i) => assert.ok(oklch(c).l > oklch(tints[i]).l))
})

test('what is coloured in an editor, and how it is applied', () => {
  const many = chartDoc({ bars: [{ title: 'A', group: 'g', x: 1, y: 2 }], series: [{ id: 'x' }, { id: 'y' }] }).doc
  assert.deepEqual([chartPalette.targets(many).map(t => t.label).join(), chartPalette.nounFor(many)], ['x,y', 'series'])
  const one = chartDoc({ bars: [{ title: 'A', x: 1 }, { title: 'B', x: 5 }], series: [{ id: 'x' }] }).doc
  const targets = chartPalette.targets(one)
  assert.deepEqual([targets.map(t => t.weight).join(), chartPalette.nounFor(one)], ['1,5', 'bars'])
  assert.deepEqual(chartPalette.apply(one, new Map([[targets[1].uid, { color: '#112233' }]])).bars.map(b => b.color), [undefined, '#112233'])
  const t = ternaryDoc({ series: [{ id: 'a', group: 'g' }, { id: 'b', group: 'g' }], points: [{ series: 'a', year: 2030, x: 1, y: 1, z: 1 }] }).doc
  assert.deepEqual(ternaryPalette.targets(t).map(x => x.group), ['g', 'g'])
  assert.equal(ternaryPalette.apply(t, new Map([[t.series[0]._uid, { color: '#445566' }]])).series[0].color, '#445566')
  const c = chordDoc({ flows: [{ source: 'a', target: 'b', carrier: 'g', 2030: 3, 2040: 4 }] }).doc
  assert.equal(chordPalette.targets(c)[0].weight, 7)
  const s = sankeyDoc({ nodes: [{ id: 'a' }, { id: 'b' }], links: [{ source: 'a', target: 'b', value: 5, carrier: 'g' }], carriers: [{ id: 'g', color: 'grey' }] }).doc
  assert.deepEqual([sankeyPalette.targets(s)[0].color, sankeyPalette.targets(s)[0].weight], ['#808080', 5])
  assert.equal(random(1)(), random(1)())
  assert.equal(DEFAULTS.style, 'standard')
})
