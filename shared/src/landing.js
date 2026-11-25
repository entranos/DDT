// The landing page: copy buttons for the prompts, and how the prompt buttons are laid out.
// Showing and downloading a prompt are plain links and work without this script.
//
// The prompts are fetched ahead, so a click can copy straight away: some browsers only
// allow writing to the clipboard right after the click, not after waiting for a fetch.

const buttons = [...document.querySelectorAll('[data-copy]')]
const status = document.getElementById('prompt-status')
const texts = new Map() // url → Promise<string>

const load = url => {
  if (!texts.has(url)) {
    texts.set(url, fetch(url).then(r => {
      if (!r.ok) throw new Error(`${r.status} ${r.statusText}`)
      return r.text()
    }))
    texts.get(url).catch(() => texts.delete(url)) // try again on the next click
  }
  return texts.get(url)
}
const ready = new Map() // url → string, once loaded

function preload () {
  buttons.forEach(b => load(b.dataset.copy).then(t => ready.set(b.dataset.copy, t), () => {}))
}

// Writes text to the clipboard; the old way where the Clipboard API is missing (pages
// served over plain http, other than localhost).
function writeClipboard (text) {
  if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text)
  return new Promise((resolve, reject) => {
    const area = document.createElement('textarea')
    area.value = text
    area.setAttribute('readonly', '')
    area.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0'
    document.body.append(area)
    area.select()
    let ok = false
    try { ok = document.execCommand('copy') } catch { ok = false }
    area.remove()
    if (ok) resolve()
    else reject(new Error('The browser did not allow copying.'))
  })
}

function feedback (button, ok) {
  const use = button.querySelector('use')
  const name = button.dataset.name
  clearTimeout(button._reset)
  button.classList.toggle('done', ok)
  button.classList.toggle('failed', !ok)
  if (ok) use.setAttribute('href', '#i-check')
  const message = ok ? `${name} prompt copied to the clipboard` : `Could not copy the ${name} prompt; use show or download instead`
  button.title = message
  status.textContent = ''
  status.textContent = message
  button._reset = setTimeout(() => {
    use.setAttribute('href', '#i-copy')
    button.classList.remove('done', 'failed')
    button.title = `Copy the ${name} prompt`
  }, ok ? 1600 : 3200)
}

async function copy (button) {
  const url = button.dataset.copy
  try {
    const text = ready.has(url) ? ready.get(url) : await load(url)
    await writeClipboard(text)
    feedback(button, true)
  } catch {
    feedback(button, false)
  }
}

// The prompt buttons, in order of preference: on one row as "Sankey prompt"; on one row as
// "Sankey"; or, where they must wrap, in an even grid of equal cells, with the word
// "prompt" unless that takes an extra row.
const list = document.querySelector('.prompt-links')

function plan (words, avail, gap) {
  list.classList.remove('grid')
  list.classList.toggle('short', !words)
  const widths = [...list.children].map(li => li.getBoundingClientRect().width)
  const n = widths.length
  if (widths.reduce((a, b) => a + b, 0) + gap * (n - 1) <= avail + 0.5) return { words, rows: 1 }
  const cell = Math.ceil(Math.max(...widths))
  const fitting = Math.max(1, Math.floor((avail + gap) / (cell + gap)))
  const rows = Math.ceil(n / fitting)
  return { words, rows, cols: Math.ceil(n / rows), cell }
}

function fit () {
  if (!list || !list.children.length) return
  const avail = list.clientWidth
  const gap = parseFloat(getComputedStyle(list).columnGap) || 0
  const withWord = plan(true, avail, gap)
  const without = withWord.rows > 1 ? plan(false, avail, gap) : null
  const choice = without && without.rows < withWord.rows ? without : withWord
  list.classList.toggle('short', !choice.words)
  list.classList.toggle('grid', choice.rows > 1)
  if (choice.rows > 1) {
    list.style.setProperty('--cols', choice.cols)
    list.style.setProperty('--cell', `${Math.min(choice.cell, avail)}px`)
  }
}

buttons.forEach(button => {
  button.hidden = false
  button.addEventListener('click', () => copy(button))
})
fit() // with the copy buttons shown
document.fonts.ready.then(fit)
window.addEventListener('resize', fit)
if (buttons.length) {
  if ('requestIdleCallback' in window) requestIdleCallback(preload, { timeout: 2000 })
  else setTimeout(preload, 300)
}
