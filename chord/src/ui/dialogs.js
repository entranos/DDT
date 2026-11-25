// The chord editor's help, about and start screen. Export and save-as dialogs are shared
// (shared/src/fileDialogs.js).

import { h } from '../../../shared/src/dom.js'
import { openDialog } from '../../../shared/src/feedback.js'
import { MOD, openHelp } from '../../../shared/src/fileDialogs.js'
import { renderStartScreen } from '../../../shared/src/startScreen.js'

// ---- help ----

const SHORTCUTS = [
  ['Select', 'Click a flow, node, group or legend entry'],
  ['Add to the selection', 'Shift + click, or drag a box over labels from empty canvas'],
  ['Select several rows', `In the Data table: Shift + click selects the rows in between, ${MOD} + click adds one`],
  ['Add a flow', 'Drag the round handle outside a node onto another node'],
  ['Type an amount in the table', 'Double-click a flow: its cell opens in the Data table'],
  ['Move a node', 'Drag its arc along the circle, also into another group, or use the arrow keys'],
  ['Move a group', 'Drag its arc'],
  ['Move a label', 'Drag it; its panel brings it back to its automatic place'],
  ['Edit the name of a node or group, or the subtitle', 'Click it'],
  ['Choose an icon', 'Double-click the arc of a node'],
  ['Add a node', 'Double-click empty canvas'],
  ['Show another scenario', 'Click it in the list, or Page Up and Page Down'],
  ['Rename a carrier', 'Double-click its legend entry'],
  ['Add, rename or delete a scenario', 'The ⋯ in its heading in the Data table (or right-click the heading)'],
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
  ['Select all nodes', `${MOD} A`],
  ['Find', '/'],
  ['Open / save / save as', `${MOD} O / ${MOD} S / ${MOD} Shift S`],
  ['Make a palette', 'Palette in the top bar: Space for another one, V for a variation, Enter to apply, Esc to cancel'],
  ['Export image', `${MOD} E`],
  ['Help', '?']
]

export function openHelpDialog () {
  openHelp({
    title: 'Using the chord editor',
    shortcuts: SHORTCUTS,
    sections: [
      { title: 'Reading the diagram', children: h('p', { text: 'Nodes stand around a circle, with an arc as long as what they give and take. A flow is a ribbon from the node it leaves to the node it reaches, with an arrow head there, coloured by its carrier. Arcs of groups stand around the nodes, or inside the circle over the flows.' }) },
      { title: 'The screen', children: h('p', { text: 'The diagram sits in the middle, drawn on an artboard the size of the exported image. The left panel lists scenarios, nodes, groups, carriers and flows; the eye hides a node or carrier. The right panel edits whatever is selected; with nothing selected it holds the diagram settings. The panel at the bottom has the data as a table, the issues found in it, and a log.' }) },
      {
        title: 'Scenarios and scale',
        children: h('ul', {},
          h('li', { text: 'A file can hold several scenarios, for example years: one column of amounts each. One of them is shown.' }),
          h('li', { text: 'By default a full circle stands for the largest scenario, so the others leave part of it empty and all can be compared. The empty space goes between the groups, or to the end of the circle.' }),
          h('li', {}, h('strong', { text: 'Keep this scale' }), ' fixes the amount of a full circle, to compare with other files.'))
      },
      {
        title: 'Order',
        children: h('p', { text: 'Nodes and groups stand in the order of their lists. Under Nodes and groups in the settings, they can be reordered so that fewer flows cross.' })
      },
      { title: 'Details', children: h('p', { text: 'A node can have small lines under its label, for example what it is made up of. Add them in its panel or in the Details table.' }) },
      { title: 'Patterns', children: h('p', { text: 'A carrier or a single flow can have a patterned fill, such as stripes in two colours for a mix. Choose it in the right panel; spacing and a drop shadow are under Shadow and patterns in the settings.' }) },
      { title: 'Files', children: h('p', { text: 'The chord editor opens and saves Excel (.xlsx), JSON and YAML, with the tables flows, nodes, groups, carriers, scenarios and details. It also opens workbooks with a sheet of flows per scenario, sankey files, and any Excel table with a source and a target column or a matrix. Excel files keep any extra sheets. Work is kept in this browser as you go, but the file on disk only changes when you save.' }) },
      { title: 'Issues', children: h('p', { text: 'The data is checked after every change: flows without a node or carrier, amounts that aren’t numbers, duplicate IDs, and nodes or carriers that aren’t used. Click Show to find them.' }) }
    ]
  })
}

// ---- about ----

export function openAboutDialog () {
  openDialog({
    title: 'About the chord editor',
    width: 520,
    body: h('div', { class: 'stack' },
      h('p', { text: 'The chord editor draws flows between nodes around a circle, for one or more scenarios on one scale. Keep the data in a spreadsheet, fine-tune the diagram here, export PNG or SVG, and save everything back to Excel, JSON or YAML for versioning and collaboration.' }),
      h('p', { class: 'muted small' }, 'Built with ', h('a', { href: 'https://d3js.org', target: '_blank', rel: 'noopener', text: 'd3' }), ', ', h('a', { href: 'https://sheetjs.com', target: '_blank', rel: 'noopener', text: 'SheetJS' }), ', ', h('a', { href: 'https://github.com/nodeca/js-yaml', target: '_blank', rel: 'noopener', text: 'js-yaml' }), ' and ', h('a', { href: 'https://tabler.io/icons', target: '_blank', rel: 'noopener', text: 'Tabler Icons' }), ' (MIT). Licensed under the MIT License.')
    ),
    actions: [{ label: 'Close', kind: 'primary' }]
  })
}

// ---- start screen ----

export function renderEmptyState (root, app, draft) {
  renderStartScreen(root, {
    title: 'Chord editor',
    draft,
    onRestore: d => app.restoreDraft(d),
    onDiscard: () => app.discardDraft(),
    cards: [
      { icon: 'open', title: 'Open a file', text: 'Excel, JSON or YAML, also a sankey file or a matrix. You can also drop a file anywhere on this window.', onClick: () => app.open(), primary: true },
      { icon: 'sparkle', title: 'Load the example', text: 'Energy carriers, conversion and use in three years, with made-up values.', onClick: () => app.loadExample() },
      { icon: 'plus', title: 'Start from scratch', text: 'A small diagram with two scenarios to build on.', onClick: () => app.newFromTemplate() },
      { icon: 'download', title: 'Download the xlsx template', text: 'An Excel file with every sheet and column explained.', onClick: () => app.downloadTemplate() }
    ],
    footer: [
      h('button', { type: 'button', class: 'link-btn', text: 'How the chord editor works', onclick: openHelpDialog }), ' · ',
      h('button', { type: 'button', class: 'link-btn', text: 'About', onclick: openAboutDialog }), ' · ',
      h('a', { class: 'link-btn', href: '../', text: 'All tools' })
    ]
  })
}
