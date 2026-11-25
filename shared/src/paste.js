// Parsing and placing tables pasted from a spreadsheet (tab-separated text).

// Splits clipboard text into rows of cells. Handles quoted cells ("a\tb", "say ""hi""").
export function parseTable (text) {
  const rows = []
  let row = []
  let cell = ''
  let quoted = false
  const s = String(text || '').replace(/\r\n?/g, '\n')
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (quoted) {
      if (ch === '"' && s[i + 1] === '"') { cell += '"'; i++ } else if (ch === '"') quoted = false
      else cell += ch
    } else if (ch === '"' && cell === '') quoted = true
    else if (ch === '\t') { row.push(cell); cell = '' } else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = '' } else cell += ch
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row) }
  return rows.filter(r => r.some(c => c.trim() !== ''))
}

const alias = name => {
  const n = String(name).trim().toLowerCase()
  return n === 'source.id' ? 'source' : n === 'target.id' ? 'target' : n === 'colour' ? 'color' : n
}

// columns: [{ key, label, readOnly }]. Returns { header, edits: [{ index, patch }], newRows: [patch] }
// where index is a row index in the visible order.
// newColumns: header names the table doesn't have are kept, as keys of the new rows; names
// may then match a column's label too, and one known name in front makes it a header.
export function planPaste ({ rows, columns, startRow = 0, startCol = 0, rowCount = 0, newColumns = false }) {
  if (!rows.length) return { header: false, edits: [], newRows: [] }
  const keys = columns.map(c => c.key.toLowerCase())
  const labels = columns.map(c => String(c.label ?? '').trim().toLowerCase())
  const find = name => {
    const i = keys.indexOf(alias(name))
    return i < 0 && newColumns ? labels.indexOf(alias(name)) : i
  }
  const headerHits = rows[0].filter(c => find(c) >= 0).length
  if (rows.length > 1 && (headerHits >= Math.min(2, rows[0].length) || (newColumns && find(rows[0][0]) >= 0))) {
    const mapping = rows[0].map(c => {
      const i = find(c)
      if (i < 0) return newColumns && c.trim() ? c.trim() : null
      return columns[i].readOnly ? null : columns[i].key
    })
    const newRows = rows.slice(1).map(r => {
      const patch = {}
      r.forEach((v, j) => { if (mapping[j]) patch[mapping[j]] = v })
      return patch
    })
    return { header: true, edits: [], newRows }
  }
  const edits = []
  const newRows = []
  rows.forEach((r, i) => {
    const patch = {}
    r.forEach((v, j) => {
      const col = columns[startCol + j]
      if (col && !col.readOnly) patch[col.key] = v
    })
    if (!Object.keys(patch).length) return
    const index = startRow + i
    if (index < rowCount) edits.push({ index, patch })
    else newRows.push(patch)
  })
  return { header: false, edits, newRows }
}
