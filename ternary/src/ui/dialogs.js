// The ternary editor's help, about and start screen. Export and save-as dialogs are
// shared (shared/src/fileDialogs.js).

import { h } from '../../../shared/src/dom.js'
import { openDialog } from '../../../shared/src/feedback.js'
import { MOD, openHelp } from '../../../shared/src/fileDialogs.js'
import { renderStartScreen } from '../../../shared/src/startScreen.js'

// ---- help ----

const SHORTCUTS = [
  ['Select', 'Click a line, a point or a legend entry'],
  ['Add to the selection', 'Shift + click, or drag a box over points'],
  ['Select several rows', `In the Data table: Shift + click selects the rows in between, ${MOD} + click adds one`],
  ['Change a point’s mix', 'Drag it (Shift for whole percents), or use the arrow keys (Shift for bigger steps)'],
  ['Edit a point’s values', 'Double-click it: its row opens in the Data table, ready to type'],
  ['Add a point', 'Double-click inside the triangle: it joins the selected series, or starts a new one'],
  ['Rename a series', 'Double-click its line or legend entry'],
  ['Edit a corner name or arrow text', 'Click it'],
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
  ['Select all points', `${MOD} A`],
  ['Find', '/'],
  ['Open / save / save as', `${MOD} O / ${MOD} S / ${MOD} Shift S`],
  ['Make a palette', 'Palette in the top bar: Space for another one, V for a variation, Enter to apply, Esc to cancel'],
  ['Export image', `${MOD} E`],
  ['Help', '?']
]

export function openHelpDialog () {
  openHelp({
    title: 'Using the ternary editor',
    shortcuts: SHORTCUTS,
    sections: [
      { title: 'Reading the diagram', children: h('p', { text: 'Each point is a mix of three shares that add up to 100%. The closer a point is to a corner, the larger that corner’s share. A line connects one series’ points in order of year, ending in the larger dot. Hover a point to see its shares with guide lines to the scales.' }) },
      { title: 'The screen', children: h('p', { text: 'The diagram sits in the middle, drawn on an artboard the size of the exported image. The left panel lists every series and point; the eye hides a series. The right panel edits whatever is selected; with nothing selected it holds the diagram settings. The panel at the bottom has the data as a table, the issues found in it, and a log.' }) },
      {
        title: 'Editing',
        children: h('ul', {},
          h('li', { text: 'Drag a point to change its mix. Its total stays the same; only the division over the three corners changes.' }),
          h('li', { text: 'Values in the Data table can be in any unit (PJ, %, …). Each point is scaled so its three values make 100%.' }),
          h('li', { text: 'You can paste rows copied from Excel into the Data table. Paste rows with a header line to add them; paste without headers to fill cells from the selected cell down.' }))
      },
      { title: 'Axes', children: h('p', {}, h('strong', { text: 'Zoomed to the data' }), ' shows only the part of the triangle the visible series use, which keeps similar trajectories apart. ', h('strong', { text: 'Full, 0–100%' }), ' shows the whole triangle, so diagrams can be compared side by side. The percentages read the same either way.') },
      { title: 'Files', children: h('p', { text: 'The ternary editor opens and saves Excel (.xlsx), JSON and YAML, with the tables points, series, axes and settings. Save writes back in the format you opened; Save as picks another. Excel files keep any extra sheets. Work is kept in this browser as you go, so a closed tab can be restored, but the file on disk only changes when you save.' }) },
      { title: 'Issues', children: h('p', { text: 'The data is checked after every change: points without a series, year or value, negative values, two points for the same year, duplicate IDs and series without points. Click Show to find them.' }) }
    ]
  })
}

// ---- about ----

export function openAboutDialog () {
  openDialog({
    title: 'About the ternary editor',
    width: 520,
    body: h('div', { class: 'stack' },
      h('p', { text: 'The ternary editor makes ternary diagrams: trajectories of a mix of three shares, such as electrons, fossil and bio in an energy system. Keep the data in a spreadsheet, fine-tune the diagram here, export PNG or SVG, and save everything back to Excel, JSON or YAML for versioning and collaboration.' }),
      h('p', { class: 'muted small' }, 'Built with ', h('a', { href: 'https://d3js.org', target: '_blank', rel: 'noopener', text: 'd3' }), ', ', h('a', { href: 'https://sheetjs.com', target: '_blank', rel: 'noopener', text: 'SheetJS' }), ' and ', h('a', { href: 'https://github.com/nodeca/js-yaml', target: '_blank', rel: 'noopener', text: 'js-yaml' }), '. Licensed under the MIT License.')
    ),
    actions: [{ label: 'Close', kind: 'primary' }]
  })
}

// ---- start screen ----

export function renderEmptyState (root, app, draft) {
  renderStartScreen(root, {
    title: 'Ternary editor',
    draft,
    onRestore: d => app.restoreDraft(d),
    onDiscard: () => app.discardDraft(),
    cards: [
      { icon: 'open', title: 'Open a file', text: 'Excel, JSON or YAML. You can also drop a file anywhere on this window.', onClick: () => app.open(), primary: true },
      { icon: 'sparkle', title: 'Load the example', text: 'Energy mix trajectories, with made-up values.', onClick: () => app.loadExample() },
      { icon: 'plus', title: 'Start from scratch', text: 'A small diagram with three series to build on.', onClick: () => app.newFromTemplate() },
      { icon: 'download', title: 'Download the xlsx template', text: 'An Excel file with every sheet and column explained.', onClick: () => app.downloadTemplate() }
    ],
    footer: [
      h('button', { type: 'button', class: 'link-btn', text: 'How the ternary editor works', onclick: openHelpDialog }), ' · ',
      h('button', { type: 'button', class: 'link-btn', text: 'About', onclick: openAboutDialog }), ' · ',
      h('a', { class: 'link-btn', href: '../', text: 'All tools' })
    ]
  })
}
