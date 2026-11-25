// The LLM prompts in prompts/: their example opens cleanly in its editor, and their
// settings table lists exactly the settings the editor has.
import './setup.mjs'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { readTextsFrom } from '../shared/src/textBoxes.js'

const TOOLS = ['sankey', 'ternary', 'treemap', 'waterfall', 'barchart', 'chord']

const promptOf = tool => readFileSync(new URL(`../prompts/${tool}.md`, import.meta.url), 'utf8')

// The YAML block under "## Complete example".
function exampleOf (md) {
  const section = md.split('\n## Complete example')[1]
  const match = section && section.match(/```yaml\n([\s\S]*?)```/)
  assert.ok(match, 'has an example')
  return match[1]
}

// The keys in the first column of the table under "## Settings".
function settingKeysOf (md) {
  const section = md.split('\n## Settings\n')[1].split('\n## ')[0]
  return [...section.matchAll(/^\| `([^`]+)` \|/gm)].map(m => m[1])
}

for (const tool of TOOLS) {
  test(`${tool} prompt: the example opens without errors or warnings`, async () => {
    const { readDocument } = await import(`../${tool}/src/io/formats.js`)
    const { validateDocument } = await import(`../${tool}/src/model/validate.js`)
    const yaml = exampleOf(promptOf(tool))
    const bytes = new TextEncoder().encode(yaml)
    const result = readDocument(`example.yaml`, bytes)
    assert.ok(!result.choose, 'opens directly')
    const issues = validateDocument(result.doc).filter(i => i.severity !== 'info')
    assert.deepEqual(issues.map(i => i.message), [])
    assert.ok(Object.keys(result.doc.settings).includes('title'), 'sets a title')
    const texts = readTextsFrom('yaml', bytes)
    if (/^texts:/m.test(yaml)) assert.ok(texts.rows.length > 0 && texts.rows.every(r => typeof r.text === 'string'), 'text boxes read')
  })

  test(`${tool} prompt: the settings table matches the editor's settings`, async () => {
    const { SETTINGS } = await import(`../${tool}/src/model/schema.js`)
    assert.deepEqual(settingKeysOf(promptOf(tool)), SETTINGS.map(s => s.key))
  })

  test(`${tool} prompt: the example only uses known settings`, async () => {
    const { SETTINGS } = await import(`../${tool}/src/model/schema.js`)
    const keys = new Set(SETTINGS.map(s => s.key))
    const used = [...exampleOf(promptOf(tool)).matchAll(/^ {2}- setting: (\S+)/gm)].map(m => m[1])
    assert.ok(used.length > 0)
    assert.deepEqual(used.filter(k => !keys.has(k)), [])
  })
}
