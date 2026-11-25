// Opening and saving files in the browser. Where the File System Access API is
// available (Chrome, Edge), Save writes back to the file you opened; elsewhere
// it downloads a copy with the same name.

import { ACCEPT, FORMATS } from './formats.js'

export const hasFileSystemAccess = typeof window !== 'undefined' && 'showOpenFilePicker' in window && 'showSaveFilePicker' in window

const PICKER_TYPES = [{
  description: 'Diagram files (xlsx, json, yaml)',
  accept: {
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx', '.xlsm', '.xls'],
    'application/json': ['.json'],
    'text/yaml': ['.yaml', '.yml']
  }
}]

// Resolves to { name, bytes: Uint8Array, handle } or null when cancelled.
export async function pickFile () {
  if (hasFileSystemAccess) {
    try {
      const [handle] = await window.showOpenFilePicker({ types: PICKER_TYPES, multiple: false })
      const file = await handle.getFile()
      return { name: file.name, bytes: new Uint8Array(await file.arrayBuffer()), handle }
    } catch (e) {
      if (e && e.name === 'AbortError') return null
      throw e
    }
  }
  return new Promise(resolve => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = ACCEPT
    input.addEventListener('change', async () => {
      const file = input.files && input.files[0]
      resolve(file ? { name: file.name, bytes: new Uint8Array(await file.arrayBuffer()), handle: null } : null)
    })
    input.addEventListener('cancel', () => resolve(null))
    input.click()
  })
}

export async function readDroppedFile (file) {
  return { name: file.name, bytes: new Uint8Array(await file.arrayBuffer()), handle: null }
}

async function ensureWritePermission (handle) {
  if (!handle.queryPermission) return true
  if ((await handle.queryPermission({ mode: 'readwrite' })) === 'granted') return true
  return (await handle.requestPermission({ mode: 'readwrite' })) === 'granted'
}

export async function writeToHandle (handle, data) {
  if (!(await ensureWritePermission(handle))) throw new Error('No permission to write to this file.')
  const writable = await handle.createWritable()
  await writable.write(data)
  await writable.close()
}

// Ask where to save. Resolves to a handle, or null when cancelled. Only with File System Access.
export async function pickSaveHandle (suggestedName, format) {
  const f = FORMATS[format]
  try {
    return await window.showSaveFilePicker({
      suggestedName,
      types: [{ description: f.label, accept: { [f.mime]: f.extensions.map(e => `.${e}`) } }]
    })
  } catch (e) {
    if (e && e.name === 'AbortError') return null
    throw e
  }
}

export function download (data, name, mime) {
  const blob = data instanceof Blob ? data : new Blob([data], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}
