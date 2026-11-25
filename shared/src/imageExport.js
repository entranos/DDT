// PNG and SVG export shared by every editor. The app draws its diagram off-screen
// (without editor overlays) into a group; this wraps it in an SVG the size of the
// canvas. Bundled fonts (Roboto, RO Sans, RO Serif) are embedded so the file
// renders the same on machines that don't have them, and so PNG rendering can use them.

const SVG_NS = 'http://www.w3.org/2000/svg'

const font = (family, weight, file, format) => ({ family, weight, url: new URL(`../fonts/${file}`, import.meta.url).href, format })
const ROBOTO = [
  font('Roboto', 300, 'roboto-latin-300-normal.woff2', 'woff2'),
  font('Roboto', 400, 'roboto-latin-400-normal.woff2', 'woff2'),
  font('Roboto', 500, 'roboto-latin-500-normal.woff2', 'woff2'),
  font('Roboto', 700, 'roboto-latin-700-normal.woff2', 'woff2')
]
const BUNDLED_FONTS = {
  '': ROBOTO,
  Roboto: ROBOTO,
  'RO Sans': [font('RO Sans', 400, 'ROsanswebtextregular.woff', 'woff'), font('RO Sans', 700, 'ROsanswebtextbold.woff', 'woff')],
  'RO Serif': [font('RO Serif', 400, 'ROserifwebregular.woff', 'woff'), font('RO Serif', 700, 'ROserifwebbold.woff', 'woff')]
}

const cache = new Map()
async function fontFaceCss (name, weights) {
  const faces = BUNDLED_FONTS[String(name || '').trim()]
  if (!faces) return ''
  const wanted = faces.filter(f => !weights || weights.includes(f.weight))
  const parts = await Promise.all((wanted.length ? wanted : faces).map(async f => {
    if (!cache.has(f.url)) {
      cache.set(f.url, fetch(f.url).then(r => {
        if (!r.ok) throw new Error(`Could not load the font ${f.family}`)
        return r.arrayBuffer()
      }).then(toBase64))
    }
    const b64 = await cache.get(f.url)
    return `@font-face{font-family:"${f.family}";font-weight:${f.weight};font-style:normal;src:url(data:font/${f.format};base64,${b64}) format("${f.format}");}`
  }))
  return parts.join('')
}

function toBase64 (buffer) {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000))
  return btoa(binary)
}

// draw(g): draws the diagram into an SVG <g> that is attached to the page, so text
// can be measured. Returns the SVG markup.
//   width, height: the canvas in px; scale: the output scale (content is drawn at 1/scale)
//   weights: font weights the diagram uses (limits what is embedded)
//   after(g)  draws on top of the diagram, in a group of its own; may return { weights }
export async function renderSvg ({ draw, after = null, width, height, scale = 1, background, transparent = false, fontName = '', weights, embedFonts = true }) {
  await document.fonts.ready
  const vw = width / scale
  const vh = height / scale
  const host = document.createElementNS(SVG_NS, 'svg')
  host.setAttribute('style', 'position:absolute;left:-100000px;top:0;visibility:hidden')
  document.body.appendChild(host)
  try {
    const g = document.createElementNS(SVG_NS, 'g')
    host.appendChild(g)
    draw(g)
    const top = after ? document.createElementNS(SVG_NS, 'g') : null
    let used = []
    if (top) { host.appendChild(top); const r = after(top); used = (r && r.weights) || [] }
    ;[g, top].filter(Boolean).forEach(group => {
      group.querySelectorAll('[style*="display: none"]').forEach(el => el.remove())
      group.querySelectorAll('*').forEach(el => [...el.attributes].forEach(a => { if (a.name.startsWith('data-')) el.removeAttribute(a.name) }))
      group.querySelectorAll('[class]').forEach(el => el.removeAttribute('class'))
    })

    const out = document.createElementNS(SVG_NS, 'svg')
    out.setAttribute('xmlns', SVG_NS)
    out.setAttribute('width', String(width))
    out.setAttribute('height', String(height))
    out.setAttribute('viewBox', `0 0 ${vw} ${vh}`)
    if (embedFonts) {
      const css = await fontFaceCss(fontName, weights ? [...new Set([...weights, ...used])] : weights)
      if (css) {
        const style = document.createElementNS(SVG_NS, 'style')
        style.textContent = css
        out.appendChild(style)
      }
    }
    if (!transparent) {
      const bg = document.createElementNS(SVG_NS, 'rect')
      bg.setAttribute('width', String(vw))
      bg.setAttribute('height', String(vh))
      bg.setAttribute('fill', background)
      out.appendChild(bg)
    }
    out.appendChild(g)
    if (top && top.childNodes.length) out.appendChild(top)
    return new XMLSerializer().serializeToString(out)
  } finally {
    host.remove()
  }
}

// svgText → PNG Blob, at `pixelRatio` times the canvas size.
export async function svgToPng (svgText, width, height, pixelRatio = 2) {
  const url = URL.createObjectURL(new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' }))
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(width * pixelRatio)
    canvas.height = Math.round(height * pixelRatio)
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
    return await new Promise((resolve, reject) => canvas.toBlob(b => (b ? resolve(b) : reject(new Error('PNG encoding failed'))), 'image/png'))
  } finally {
    URL.revokeObjectURL(url)
  }
}
