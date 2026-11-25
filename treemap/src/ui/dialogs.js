// The treemap editor's help, about and start screen. Export and save-as dialogs are
// shared (shared/src/fileDialogs.js).

import { h } from '../../../shared/src/dom.js'
import { openDialog } from '../../../shared/src/feedback.js'
import { MOD, openHelp } from '../../../shared/src/fileDialogs.js'
import { renderStartScreen } from '../../../shared/src/startScreen.js'

// ---- help ----

const SHORTCUTS = [
  ['Select', 'Click a tile, a block’s header or a legend entry'],
  ['Add to the selection', 'Shift + click, or drag a box over tiles from empty canvas'],
  ['Select several rows', `In the Data table: Shift + click selects the rows in between, ${MOD} + click adds one`],
  ['Change a value', 'Double-click the tile: its value opens in the Data table, ready to type'],
  ['Add a value to a block', 'Click the + next to its name'],
  ['Add a block', 'Double-click empty canvas'],
  ['Edit a block name or group name', 'Click it'],
  ['Move a block', 'Drag its header before or after another block, also into another group; or use the arrow keys'],
  ['Rename a carrier', 'Double-click its legend entry'],
  ['Edit or move the diagram title', 'Click it to edit, drag it to move'],
  ['Resize the canvas', 'Drag its right or bottom edge or the corner grip (Shift for 1 px steps), or click the size shown above it'],
  ['Add a text box', 'T, or Text in the top bar. Click it to select, click again to type; drag it to move, its edges to size it'],
  ['Diagram settings', 'Esc to clear the selection, or Settings in the top bar'],
  ['Delete', 'Delete or Backspace'],
  ['Undo / redo', `${MOD} Z / ${MOD} Shift Z`],
  ['Pan', 'Scroll, or hold Space and drag'],
  ['Zoom the view', `${MOD} + scroll, pinch, or + and −`],
  ['Fit diagram to window', 'Shift 1'],
  ['Zoom to 100%', `${MOD} 0`],
  ['Select all tiles', `${MOD} A`],
  ['Find', '/'],
  ['Open / save / save as', `${MOD} O / ${MOD} S / ${MOD} Shift S`],
  ['Make a palette', 'Palette in the top bar: Space for another one, V for a variation, Enter to apply, Esc to cancel'],
  ['Export image', `${MOD} E`],
  ['Help', '?']
]

export function openHelpDialog () {
  openHelp({
    title: 'Using the treemap editor',
    shortcuts: SHORTCUTS,
    sections: [
      { title: 'Reading the diagram', children: h('p', { text: 'Every tile’s area is proportional to its value, on one scale for the whole diagram. Blocks hold tiles; groups hold blocks. Hover a tile for its name, value and share; the same carrier lights up in every block.' }) },
      { title: 'The screen', children: h('p', { text: 'The diagram sits in the middle, drawn on an artboard the size of the exported image. The left panel lists blocks, values and carriers; the eye hides a block. The right panel edits whatever is selected; with nothing selected it holds the diagram settings. The panel at the bottom has the data as a table, the issues found in it, and a log.' }) },
      {
        title: 'Views',
        children: h('ul', {},
          h('li', {}, h('strong', { text: 'Per block' }), ' splits each block by carrier; ', h('strong', { text: 'per carrier' }), ' turns that around: a block per carrier, split by block in shades of its colour.'),
          h('li', {}, h('strong', { text: 'Stacked bars' }), ' draws each block as one bar along its longer side.'),
          h('li', {}, h('strong', { text: 'Order' }), ': as listed keeps everything in place when values change; largest first sorts.'))
      },
      { title: 'Icons', children: h('p', { text: 'Blocks and carriers can have an icon. The picker shows the energy icons first and searches the full Tabler Icons library below them, in English or Dutch. In a spreadsheet, write an icon’s name, or tabler: followed by a name from tabler.io/icons.' }) },
      { title: 'Scale', children: h('p', {}, 'By default the diagram fills the canvas. ', h('strong', { text: 'Fixed area per unit' }), ' draws at a set scale instead, so several diagrams can be compared; ', h('strong', { text: 'Keep this scale' }), ' takes over the current one. Tiles under 0.5% of their block and blocks under 0.5% of everything are too small to draw; totals still include them.') },
      { title: 'Patterns', children: h('p', { text: 'A carrier or a single tile can have a patterned fill, such as stripes in two colours for a mix. Choose it in the right panel; spacing and a drop shadow are under Shadow and patterns in the settings.' }) },
      { title: 'Files', children: h('p', { text: 'The treemap editor opens and saves Excel (.xlsx), JSON and YAML, with the tables values, blocks, carriers and settings. A values table with a column per carrier works too. Opening a sankey diagram file makes a new treemap from it: what flows into each end node, split by carrier; the sankey file stays as it is. Excel files keep any extra sheets. Work is kept in this browser as you go, but the file on disk only changes when you save.' }) },
      { title: 'Issues', children: h('p', { text: 'The data is checked after every change: values without a block, carrier or amount, negative values, duplicate IDs, and blocks or carriers that aren’t used. Click Show to find them.' }) }
    ]
  })
}

// ---- about ----

export function openAboutDialog () {
  openDialog({
    title: 'About the treemap editor',
    width: 520,
    body: h('div', { class: 'stack' },
      h('p', { text: 'The treemap editor shows how totals are made up, such as the energy each sector uses by carrier, with every area on one scale. Keep the data in a spreadsheet, fine-tune the diagram here, export PNG or SVG, and save everything back to Excel, JSON or YAML for versioning and collaboration.' }),
      h('p', { class: 'muted small' }, 'Built with ', h('a', { href: 'https://d3js.org', target: '_blank', rel: 'noopener', text: 'd3' }), ', ', h('a', { href: 'https://sheetjs.com', target: '_blank', rel: 'noopener', text: 'SheetJS' }), ', ', h('a', { href: 'https://github.com/nodeca/js-yaml', target: '_blank', rel: 'noopener', text: 'js-yaml' }), ' and ', h('a', { href: 'https://tabler.io/icons', target: '_blank', rel: 'noopener', text: 'Tabler Icons' }), ' (MIT). Licensed under the MIT License.')
    ),
    actions: [{ label: 'Close', kind: 'primary' }]
  })
}

// ---- start screen ----

export function renderEmptyState (root, app, draft) {
  renderStartScreen(root, {
    title: 'Treemap editor',
    draft,
    onRestore: d => app.restoreDraft(d),
    onDiscard: () => app.discardDraft(),
    cards: [
      { icon: 'open', title: 'Open a file', text: 'Excel, JSON or YAML; a sankey diagram file becomes a treemap. You can also drop a file on this window.', onClick: () => app.open(), primary: true },
      { icon: 'sparkle', title: 'Load the example', text: 'Energy input per sector and carrier, with made-up values.', onClick: () => app.loadExample() },
      { icon: 'plus', title: 'Start from scratch', text: 'A small diagram with four blocks to build on.', onClick: () => app.newFromTemplate() },
      { icon: 'download', title: 'Download the xlsx template', text: 'An Excel file with every sheet and column explained.', onClick: () => app.downloadTemplate() }
    ],
    footer: [
      h('button', { type: 'button', class: 'link-btn', text: 'How the treemap editor works', onclick: openHelpDialog }), ' · ',
      h('button', { type: 'button', class: 'link-btn', text: 'About', onclick: openAboutDialog }), ' · ',
      h('a', { class: 'link-btn', href: '../', text: 'All tools' })
    ]
  })
}
