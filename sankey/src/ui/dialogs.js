// The sankey editor's help, about and start screen. Export and save-as dialogs are
// shared (shared/src/fileDialogs.js).

import { h } from '../../../shared/src/dom.js'
import { openDialog } from '../../../shared/src/feedback.js'
import { MOD, openHelp } from '../../../shared/src/fileDialogs.js'
import { renderStartScreen } from '../../../shared/src/startScreen.js'

// ---- help ----

const SHORTCUTS = [
  ['Select', 'Click a node, flow or label'],
  ['Add to the selection', 'Shift + click, or drag a box on empty canvas'],
  ['Select several rows', `In the Data table: Shift + click selects the rows in between, ${MOD} + click adds one`],
  ['Move nodes', 'Drag them, or use the arrow keys (Shift for 10 px)'],
  ['Add a flow', 'Drag the round handle next to a node onto another node'],
  ['Add a flow to a new node', 'Hold Shift while dragging the handle and release on empty canvas'],
  ['Change a flow’s value', 'Double-click the flow: its value opens in the Data table, ready to type'],
  ['Add a node', 'Double-click empty canvas'],
  ['Move an icon', 'Drag it along its flow; double-click it to choose another'],
  ['Edit or move the diagram title', 'Click it to edit, drag it to move'],
  ['Edit a label', 'Click a node’s title or value label (dragging a label moves the node)'],
  ['Resize the canvas', 'Drag its right or bottom edge or the corner grip (Shift for 1 px steps), or click the size shown above it'],
  ['Flow details', 'Double-click a node'],
  ['Add a text box', 'T, or Text in the top bar. Click it to select, click again to type; drag it to move, its edges to size it'],
  ['Diagram settings', 'Esc to clear the selection, or Settings in the top bar'],
  ['Delete', 'Delete or Backspace'],
  ['Undo / redo', `${MOD} Z / ${MOD} Shift Z`],
  ['Pan', 'Scroll, or hold Space and drag'],
  ['Zoom', `${MOD} + scroll, pinch, or + and −`],
  ['Fit diagram to window', 'Shift 1'],
  ['Zoom to 100%', `${MOD} 0`],
  ['Select all nodes', `${MOD} A`],
  ['Find', '/'],
  ['Open / save / save as', `${MOD} O / ${MOD} S / ${MOD} Shift S`],
  ['Make a palette', 'Palette in the top bar: Space for another one, V for a variation, Enter to apply, Esc to cancel'],
  ['Export image', `${MOD} E`],
  ['Help', '?']
]

export function openHelpDialog () {
  openHelp({
    title: 'Using the sankey editor',
    shortcuts: SHORTCUTS,
    sections: [
      { title: 'The screen', children: h('p', { text: 'The diagram sits in the middle, drawn on an artboard the size of the exported image. The left panel lists every node, flow and carrier. The right panel edits whatever is selected; with nothing selected it holds the diagram settings. The panel at the bottom has the data as a table, the issues found in it, and a log.' }) },
      {
        title: 'Editing',
        children: h('ul', {},
          h('li', { text: 'Click to select, then edit in the right panel. Changes show immediately and can always be undone.' }),
          h('li', { text: 'Drag nodes to move them. Snap to grid is on by default; switch it off under Editor in the diagram settings.' }),
          h('li', { text: 'To add a flow, drag the round handle next to a node onto another node, then type the value. Hold Shift and release on empty canvas to add a new node there instead.' }),
          h('li', { text: 'In the Data tab you can edit cells, sort columns and paste rows copied from Excel. Paste rows with a header line to add them; paste without headers to fill cells from the selected cell down.' }))
      },
      {
        title: 'Label conventions',
        children: h('ul', {},
          h('li', {}, 'A title starting with ', h('code', { text: '.' }), ' hides the node’s labels.'),
          h('li', {}, 'A title starting with ', h('code', { text: '_' }), ' shows only the value.'),
          h('li', { text: 'Nodes without flows are shown dashed in the editor and left out of exports.' }))
      },
      { title: 'Icons on flows', children: h('p', { text: 'Choose an icon for a carrier (it shows on all its flows) or for a single flow, in the right panel. The picker shows the energy icons first and searches the full Tabler Icons library below them, in English or Dutch. Drag an icon along its flow to place it. Size, place and what happens on thin flows are in the diagram settings under Icons on flows.' }) },
      { title: 'Scaling', children: h('p', {}, h('strong', { text: 'Multiply values by' }), ' changes the numbers that are drawn and labelled (for unit conversion). ', h('strong', { text: 'Pixels per unit' }), ' sets flow thickness; keep it equal across diagrams so they can be compared. ', h('strong', { text: 'Output scale' }), ' shrinks or grows the whole drawing inside the exported image. Zooming the view changes none of these.') },
      { title: 'Patterns', children: h('p', { text: 'A carrier or a single flow can have a patterned fill, such as stripes in two colours for a mix. Choose it in the right panel; spacing and a drop shadow are under Shadow and patterns in the settings.' }) },
      { title: 'Files', children: h('p', { text: 'The sankey editor opens and saves Excel (.xlsx), JSON and YAML. Save writes back in the format you opened; Save as picks another. Excel files keep any extra sheets. Work is kept in this browser as you go, so a closed tab can be restored, but the file on disk only changes when you save.' }) },
      { title: 'Issues', children: h('p', { text: 'The sankey editor checks the data after every change: flows that point to missing nodes, duplicate IDs, missing carriers or values, nodes where inflow and outflow differ by more than 1, labels that overlap, and nodes outside the canvas. Click Show to find them on the canvas.' }) }
    ]
  })
}

// ---- about ----

export function openAboutDialog () {
  openDialog({
    title: 'About the sankey editor',
    width: 520,
    body: h('div', { class: 'stack' },
      h('p', { text: 'The sankey editor makes Sankey diagrams with precise, consistent unit-to-pixel scaling across sets of diagrams. Keep the data in a spreadsheet, fine-tune the layout here, export PNG or SVG, and save everything back to Excel, JSON or YAML for versioning and collaboration.' }),
      h('p', { class: 'muted small' }, 'Built with ', h('a', { href: 'https://d3js.org', target: '_blank', rel: 'noopener', text: 'd3' }), ', ', h('a', { href: 'https://github.com/ricklupton/d3-sankey-diagram', target: '_blank', rel: 'noopener', text: 'd3-sankey-diagram' }), ', ', h('a', { href: 'https://sheetjs.com', target: '_blank', rel: 'noopener', text: 'SheetJS' }), ', ', h('a', { href: 'https://github.com/nodeca/js-yaml', target: '_blank', rel: 'noopener', text: 'js-yaml' }), ' and ', h('a', { href: 'https://tabler.io/icons', target: '_blank', rel: 'noopener', text: 'Tabler Icons' }), ' (MIT). Licensed under the MIT License.')
    ),
    actions: [{ label: 'Close', kind: 'primary' }]
  })
}

// ---- start screen ----

export function renderEmptyState (root, app, draft) {
  renderStartScreen(root, {
    title: 'Sankey editor',
    draft,
    onRestore: d => app.restoreDraft(d),
    onDiscard: () => app.discardDraft(),
    cards: [
      { icon: 'open', title: 'Open a file', text: 'Excel, JSON or YAML. You can also drop a file anywhere on this window.', onClick: () => app.open(), primary: true },
      { icon: 'sparkle', title: 'Load the example', text: 'A worked example: the Dutch national budget as flows.', onClick: () => app.loadExample() },
      { icon: 'plus', title: 'Start from scratch', text: 'A small diagram with four nodes to build on.', onClick: () => app.newFromTemplate() },
      { icon: 'download', title: 'Download the xlsx template', text: 'An Excel file with every sheet and column explained.', onClick: () => app.downloadTemplate() }
    ],
    footer: [
      h('button', { type: 'button', class: 'link-btn', text: 'How the sankey editor works', onclick: openHelpDialog }), ' · ',
      h('button', { type: 'button', class: 'link-btn', text: 'About', onclick: openAboutDialog }), ' · ',
      h('a', { class: 'link-btn', href: '../', text: 'All tools' })
    ]
  })
}
