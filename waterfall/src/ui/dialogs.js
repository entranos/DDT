// The waterfall editor's help, about and start screen. Export and save-as dialogs are
// shared (shared/src/fileDialogs.js).

import { h } from '../../../shared/src/dom.js'
import { openDialog } from '../../../shared/src/feedback.js'
import { MOD, openHelp } from '../../../shared/src/fileDialogs.js'
import { renderStartScreen } from '../../../shared/src/startScreen.js'

// ---- help ----

const SHORTCUTS = [
  ['Select', 'Click a step, a part of a total, a heading or a legend entry'],
  ['Add to the selection', 'Shift + click, or drag a box over bars from empty canvas'],
  ['Select several rows', `In the Data table: Shift + click selects the rows in between, ${MOD} + click adds one`],
  ['Change a step', 'Drag it up or down (Shift for finer steps), or click its number and type'],
  ['Change a part of a total', 'Drag it up or down, or double-click it: its cell opens in the Data table'],
  ['Add a moment', 'Click the + after the last one, or Add column in the Data table'],
  ['Rename, insert or delete a column', 'The ⋯ in its heading in the Data table (or right-click the heading)'],
  ['Edit a year, diagram name or subtitle', 'Click it'],
  ['Reorder carriers', 'Drag a heading onto another one, or use the arrow keys'],
  ['Choose an icon', 'Double-click a heading'],
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
  ['Select all values', `${MOD} A`],
  ['Find', '/'],
  ['Open / save / save as', `${MOD} O / ${MOD} S / ${MOD} Shift S`],
  ['Make a palette', 'Palette in the top bar: Space for another one, V for a variation, Enter to apply, Esc to cancel'],
  ['Export image', `${MOD} E`],
  ['Help', '?']
]

export function openHelpDialog () {
  openHelp({
    title: 'Using the waterfall editor',
    shortcuts: SHORTCUTS,
    sections: [
      { title: 'Reading the diagram', children: h('p', { text: 'Stacked bars are the totals at each moment. Between two of them, every carrier has a step from one total towards the next: up where it grows, down (outlined) where it declines. The arrow shows the net change.' }) },
      { title: 'The screen', children: h('p', { text: 'The diagram sits in the middle, drawn on an artboard the size of the exported image. The left panel lists diagrams, moments, carriers and values; the eye hides a diagram or moment. The right panel edits whatever is selected; with nothing selected it holds the diagram settings. The panel at the bottom has the data as a table, the issues found in it, and a log.' }) },
      {
        title: 'One or two diagrams',
        children: h('ul', {},
          h('li', { text: 'Diagrams are drawn above each other on the same columns, for example what grows above and what declines below. Pointing at a carrier lights it up in both.' }),
          h('li', { text: 'Under Diagrams in the settings, choose both or one of them. Their vertical axes can be the same, share a scale, or be independent.' }))
      },
      {
        title: 'Values',
        children: h('ul', {},
          h('li', { text: 'You enter totals: a row per diagram and carrier, a column per moment. The steps follow from them, so they always add up.' }),
          h('li', { text: 'Changing a step moves the later moment; later moments keep their amounts, so the next step changes too.' }),
          h('li', { text: 'Hiding a moment makes the steps go from the one before to the one after.' }))
      },
      { title: 'Scale', children: h('p', {}, 'By default the diagram fills the canvas. ', h('strong', { text: 'Fixed pixels per unit' }), ' draws at a set scale instead, so several diagrams can be compared; ', h('strong', { text: 'Keep this scale' }), ' takes over the current one.') },
      { title: 'Patterns', children: h('p', { text: 'A carrier, or its values in one diagram, can have a patterned fill, such as stripes in two colours for a mix. Choose it in the right panel; the spacing is under Patterns in the settings.' }) },
      { title: 'Files', children: h('p', { text: 'The waterfall editor opens and saves Excel (.xlsx), JSON and YAML, with the tables values, diagrams, moments, carriers and settings. It also opens workbooks with “boven” and “onder” total sheets: you choose which selection becomes a new diagram. Excel files keep any extra sheets. Work is kept in this browser as you go, but the file on disk only changes when you save.' }) },
      { title: 'Issues', children: h('p', { text: 'The data is checked after every change: rows without a diagram or carrier, amounts that aren’t numbers, duplicate IDs, and carriers or diagrams that aren’t used. Click Show to find them.' }) }
    ]
  })
}

// ---- about ----

export function openAboutDialog () {
  openDialog({
    title: 'About the waterfall editor',
    width: 520,
    body: h('div', { class: 'stack' },
      h('p', { text: 'The waterfall editor shows how totals change from one moment to the next, step by step and carrier by carrier, in one diagram or in two synced ones. Keep the data in a spreadsheet, fine-tune the diagram here, export PNG or SVG, and save everything back to Excel, JSON or YAML for versioning and collaboration.' }),
      h('p', { class: 'muted small' }, 'Built with ', h('a', { href: 'https://d3js.org', target: '_blank', rel: 'noopener', text: 'd3' }), ', ', h('a', { href: 'https://sheetjs.com', target: '_blank', rel: 'noopener', text: 'SheetJS' }), ', ', h('a', { href: 'https://github.com/nodeca/js-yaml', target: '_blank', rel: 'noopener', text: 'js-yaml' }), ' and ', h('a', { href: 'https://tabler.io/icons', target: '_blank', rel: 'noopener', text: 'Tabler Icons' }), ' (MIT). Licensed under the MIT License.')
    ),
    actions: [{ label: 'Close', kind: 'primary' }]
  })
}

// ---- start screen ----

export function renderEmptyState (root, app, draft) {
  renderStartScreen(root, {
    title: 'Waterfall editor',
    draft,
    onRestore: d => app.restoreDraft(d),
    onDiscard: () => app.discardDraft(),
    cards: [
      { icon: 'open', title: 'Open a file', text: 'Excel, JSON or YAML. You can also drop a file anywhere on this window.', onClick: () => app.open(), primary: true },
      { icon: 'sparkle', title: 'Load the example', text: 'What grows and what declines in final energy use, with made-up values.', onClick: () => app.loadExample() },
      { icon: 'plus', title: 'Start from scratch', text: 'Two small synced diagrams to build on.', onClick: () => app.newFromTemplate() },
      { icon: 'download', title: 'Download the xlsx template', text: 'An Excel file with every sheet and column explained.', onClick: () => app.downloadTemplate() }
    ],
    footer: [
      h('button', { type: 'button', class: 'link-btn', text: 'How the waterfall editor works', onclick: openHelpDialog }), ' · ',
      h('button', { type: 'button', class: 'link-btn', text: 'About', onclick: openAboutDialog }), ' · ',
      h('a', { class: 'link-btn', href: '../', text: 'All tools' })
    ]
  })
}
