// The file formats every editor in the suite reads and writes, and how to tell
// them apart. Each app's own io/formats.js turns file content into its document.

export const FORMATS = {
  xlsx: { label: 'Excel workbook', extensions: ['xlsx', 'xlsm', 'xls'], mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
  json: { label: 'JSON', extensions: ['json'], mime: 'application/json' },
  yaml: { label: 'YAML', extensions: ['yaml', 'yml'], mime: 'text/yaml' }
}

export const ACCEPT = Object.values(FORMATS).flatMap(f => f.extensions.map(e => `.${e}`)).join(',')

export function extensionOf (name) {
  const m = /\.([a-z0-9]+)$/i.exec(name || '')
  return m ? m[1].toLowerCase() : ''
}

export function detectFormat (name, bytes) {
  const ext = extensionOf(name)
  const byExt = Object.entries(FORMATS).find(([, f]) => f.extensions.includes(ext))
  if (byExt) return byExt[0]
  if (bytes && bytes[0] === 0x50 && bytes[1] === 0x4b) return 'xlsx' // zip container
  const head = new TextDecoder().decode(bytes ? bytes.slice(0, 64) : new Uint8Array()).trimStart()
  return head.startsWith('{') ? 'json' : 'yaml'
}

// A workbook's sheets by lower-case name (with the original name), for format checks.
export function sheetIndex (workbook) {
  const out = {}
  workbook.SheetNames.forEach(name => { out[name.trim().toLowerCase()] = name })
  return out
}
