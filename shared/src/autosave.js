// Keeps the open document in the browser (IndexedDB) so a closed tab or a crash
// doesn't lose work. Each app has its own database and keeps one draft, which is
// offered for restore on the next visit.

const STORE = 'drafts'
const KEY = 'current'

export function createAutosave (dbName) {
  function openDb () {
    return new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') { reject(new Error('IndexedDB unavailable')); return }
      const req = indexedDB.open(dbName, 1)
      req.onupgradeneeded = () => req.result.createObjectStore(STORE)
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  }

  async function run (mode, fn) {
    const db = await openDb()
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, mode)
        const req = fn(tx.objectStore(STORE))
        tx.oncomplete = () => resolve(req && req.result)
        tx.onerror = () => reject(tx.error)
        tx.onabort = () => reject(tx.error)
      })
    } finally {
      db.close()
    }
  }

  // record: { doc, file: { name, format, handle?, workbook?, sheetNames? }, savedAt, dirty }
  async function saveDraft (record) {
    try {
      await run('readwrite', s => s.put(record, KEY))
    } catch (e) {
      // A file handle or workbook that can't be stored shouldn't stop autosave.
      const { handle, workbook, ...file } = record.file || {}
      await run('readwrite', s => s.put({ ...record, file }, KEY))
    }
  }

  async function loadDraft () {
    try {
      return (await run('readonly', s => s.get(KEY))) || null
    } catch (e) {
      return null
    }
  }

  async function clearDraft () {
    try { await run('readwrite', s => s.delete(KEY)) } catch (e) { /* nothing to clear */ }
  }

  return { saveDraft, loadDraft, clearDraft }
}
