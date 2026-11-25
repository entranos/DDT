// Single source of truth for the open document, with undo/redo.
//
// Every change goes through `apply(label, fn)`, where `fn(doc)` returns the next
// document. Edits that share a `coalesce` key within a short window (typing in a
// number field, dragging a colour picker) collapse into one undo step.

const HISTORY_LIMIT = 200
const COALESCE_MS = 1200

export function createStore (initialDoc) {
  let doc = initialDoc
  let past = []
  let future = []
  let revision = 0
  let savedRevision = 0
  let lastEntry = null
  const listeners = new Set()

  function notify (change) {
    listeners.forEach(fn => fn(doc, change))
  }

  function apply (label, fn, { coalesce } = {}) {
    const next = fn(doc)
    if (!next || next === doc) return false
    const now = Date.now()
    const canMerge = coalesce && lastEntry && lastEntry.coalesce === coalesce && now - lastEntry.time < COALESCE_MS && future.length === 0
    if (canMerge) {
      lastEntry.time = now
    } else {
      past.push({ doc, label, revision })
      if (past.length > HISTORY_LIMIT) past.shift()
      lastEntry = { coalesce, time: now }
    }
    future = []
    doc = next
    revision += 1
    notify({ kind: 'apply', label })
    return true
  }

  function undo () {
    const entry = past.pop()
    if (!entry) return null
    future.push({ doc, label: entry.label, revision })
    doc = entry.doc
    revision = entry.revision
    lastEntry = null
    notify({ kind: 'undo', label: entry.label })
    return entry.label
  }

  function redo () {
    const entry = future.pop()
    if (!entry) return null
    past.push({ doc, label: entry.label, revision })
    doc = entry.doc
    revision = entry.revision
    lastEntry = null
    notify({ kind: 'redo', label: entry.label })
    return entry.label
  }

  // Replace the document (open a file, restore autosave). Clears history.
  function load (nextDoc, { dirty = false } = {}) {
    doc = nextDoc
    past = []
    future = []
    lastEntry = null
    revision += 1
    savedRevision = dirty ? -1 : revision
    notify({ kind: 'load' })
  }

  return {
    get doc () { return doc },
    apply,
    undo,
    redo,
    load,
    canUndo: () => past.length > 0,
    canRedo: () => future.length > 0,
    undoLabel: () => (past.length ? past[past.length - 1].label : null),
    redoLabel: () => (future.length ? future[future.length - 1].label : null),
    isDirty: () => revision !== savedRevision,
    markSaved: () => { savedRevision = revision; notify({ kind: 'saved' }) },
    // Ends any coalescing run so the next edit starts a new undo step.
    breakCoalescing: () => { lastEntry = null },
    subscribe (fn) { listeners.add(fn); return () => listeners.delete(fn) }
  }
}
