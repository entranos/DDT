// PNG and SVG export of the chord diagram, drawn by the same code as the canvas.

import { renderSvg, svgToPng } from '../../../shared/src/imageExport.js'
import { drawTextBoxes } from '../../../shared/src/textBoxes.js'
import { needsLibrary } from '../../../shared/src/icons.js'
import { loadIcons } from '../../../shared/src/iconLibrary.js'
import { getSetting, iconRows } from '../model/schema.js'
import { buildModel } from '../model/chords.js'
import { drawChord } from '../render/chord.js'

const size = doc => ({ width: getSetting(doc, 'canvasWidth'), height: getSetting(doc, 'canvasHeight') })

export async function buildSvg (doc, { transparent, embedFonts = true } = {}) {
  if (needsLibrary(iconRows(doc))) await loadIcons()
  return renderSvg({
    ...size(doc),
    scale: getSetting(doc, 'scaleCanvas'),
    background: getSetting(doc, 'backgroundColor'),
    transparent: transparent === undefined ? getSetting(doc, 'transparentBackground') : transparent,
    fontName: getSetting(doc, 'font'),
    weights: [400, 500],
    embedFonts,
    draw: g => drawChord(g, doc, buildModel(doc)),
    after: g => drawTextBoxes(g, doc, key => getSetting(doc, key))
  })
}

export async function buildPng (doc, { scale = 2, transparent } = {}) {
  const { width, height } = size(doc)
  return svgToPng(await buildSvg(doc, { transparent }), width, height, scale)
}
