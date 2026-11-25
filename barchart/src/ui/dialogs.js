// The bar chart editor's help, about and start screen. Export and save-as dialogs are
// shared (shared/src/fileDialogs.js).

import { h } from '../../../shared/src/dom.js'
import { openDialog } from '../../../shared/src/feedback.js'
import { MOD, openHelp } from '../../../shared/src/fileDialogs.js'
import { renderStartScreen } from '../../../shared/src/startScreen.js'

// ---- help ----

const SHORTCUTS = [
  ['Select', 'Click a part of a bar, a name or a legend entry'],
  ['Add to the selection', 'Shift + click, or drag a box over bars from empty canvas'],
  ['Select several rows', `In the Data table: Shift + click selects the rows in between, ${MOD} + click adds one`],
  ['Change an amount', 'Drag a part of a bar (Shift for finer steps), or click its number and type'],
  ['Type an amount in the table', 'Double-click a part: its cell opens in the Data table'],
  ['Edit a name, group, subtitle or axis title', 'Click it'],
  ['Reorder bars', 'Drag a name (also into another group), or use the arrow keys'],
  ['Choose an icon', 'Double-click the icon of a bar; for a part, select it and use the right panel'],
  ['Add a bar', 'Click the + after the last one, or double-click empty canvas'],
  ['Rename a series', 'Double-click its legend entry'],
  ['Add, rename or delete a series', 'The ⋯ in its heading in the Data table (or right-click the heading)'],
  ['Edit or move the chart title', 'Click it to edit, drag it to move'],
  ['Resize the canvas', 'Drag its right or bottom edge or the corner grip (Shift for 1 px steps), or click the size shown above it'],
  ['Add a text box', 'T, or Text in the top bar. Click it to select, click again to type; drag it to move, its edges to size it'],
  ['Diagram settings', 'Esc to clear the selection, or Settings in the top bar'],
  ['Delete', 'Delete or Backspace'],
  ['Undo / redo', `${MOD} Z / ${MOD} Shift Z`],
  ['Pan', 'Scroll, or hold Space and drag'],
  ['Zoom the view', `${MOD} + scroll, pinch, or + and −`],
  ['Fit chart to window', 'Shift 1'],
  ['Zoom to 100%', `${MOD} 0`],
  ['Select all bars', `${MOD} A`],
  ['Find', '/'],
  ['Open / save / save as', `${MOD} O / ${MOD} S / ${MOD} Shift S`],
  ['Make a palette', 'Palette in the top bar: Space for another one, V for a variation, Enter to apply, Esc to cancel'],
  ['Export image', `${MOD} E`],
  ['Help', '?']
]

export function openHelpDialog () {
  openHelp({
    title: 'Using the bar chart editor',
    shortcuts: SHORTCUTS,
    sections: [
      { title: 'The screen', children: h('p', { text: 'The chart sits in the middle, drawn on an artboard the size of the exported image. The left panel lists bars and series; the eye hides one. The right panel edits whatever is selected; with nothing selected it holds the chart settings. The panel at the bottom has the data as a table, the issues found in it, and a log.' }) },
      {
        title: 'Kinds of charts',
        children: h('ul', {},
          h('li', { text: 'Under Chart in the settings, bars are vertical or horizontal, and their series are stacked, side by side, or stacked to 100%.' }),
          h('li', { text: 'A table with one series is a plain bar chart; its bars can each have their own colour.' }),
          h('li', { text: 'Bars with the same group are drawn together under its name. Negative amounts go the other way from the axis.' }))
      },
      {
        title: 'Icons',
        children: h('ul', {},
          h('li', { text: 'Bars can have an icon: with their name, in the bar at its start, or at its end.' }),
          h('li', { text: 'Series can have an icon, shown in their parts where it fits. One part can have its own icon: select it and choose one in the right panel.' }))
      },
      { title: 'Patterns', children: h('p', { text: 'A series, a whole bar or one part of a bar can have a patterned fill, such as stripes in two colours, for example to set forecasts apart. Spacing and a drop shadow are under Shadow and patterns in the settings.' }) },
      { title: 'Scale', children: h('p', {}, 'By default the chart fills the canvas. ', h('strong', { text: 'Fixed pixels per unit' }), ' draws at a set scale instead, so several charts can be compared; ', h('strong', { text: 'Keep this scale' }), ' takes over the current one.') },
      { title: 'Files', children: h('p', { text: 'The bar chart editor opens and saves Excel (.xlsx), JSON and YAML, with the tables bars, series and settings. It also makes a chart from any Excel table with a row per bar, and from treemap, waterfall and sankey files. Copy a table in Excel and paste it in the Data tab to add its rows and columns. Excel files keep any extra sheets. Work is kept in this browser as you go, but the file on disk only changes when you save.' }) },
      { title: 'Issues', children: h('p', { text: 'The data is checked after every change: amounts that aren’t numbers, duplicate series, unknown icons and patterns. Click Show to find them.' }) }
    ]
  })
}

// ---- about ----

export function openAboutDialog () {
  openDialog({
    title: 'About the bar chart editor',
    width: 520,
    body: h('div', { class: 'stack' },
      h('p', { text: 'The bar chart editor draws vertical and horizontal bar charts, plain, stacked or side by side, with icons. Keep the data in a spreadsheet, fine-tune the chart here, export PNG or SVG, and save everything back to Excel, JSON or YAML for versioning and collaboration.' }),
      h('p', { class: 'muted small' }, 'Built with ', h('a', { href: 'https://d3js.org', target: '_blank', rel: 'noopener', text: 'd3' }), ', ', h('a', { href: 'https://sheetjs.com', target: '_blank', rel: 'noopener', text: 'SheetJS' }), ', ', h('a', { href: 'https://github.com/nodeca/js-yaml', target: '_blank', rel: 'noopener', text: 'js-yaml' }), ' and ', h('a', { href: 'https://tabler.io/icons', target: '_blank', rel: 'noopener', text: 'Tabler Icons' }), ' (MIT). Licensed under the MIT License.')
    ),
    actions: [{ label: 'Close', kind: 'primary' }]
  })
}

// ---- start screen ----

export function renderEmptyState (root, app, draft) {
  renderStartScreen(root, {
    title: 'Bar chart editor',
    draft,
    onRestore: d => app.restoreDraft(d),
    onDiscard: () => app.discardDraft(),
    cards: [
      { icon: 'open', title: 'Open a file', text: 'Excel, JSON or YAML, or any Excel table. You can also drop a file anywhere on this window.', onClick: () => app.open(), primary: true },
      { icon: 'sparkle', title: 'Load the example', text: 'Energy use per sector in two years, stacked by carrier, with made-up values.', onClick: () => app.loadExample() },
      { icon: 'plus', title: 'Start from scratch', text: 'A small stacked chart to build on.', onClick: () => app.newFromTemplate() },
      { icon: 'download', title: 'Download the xlsx template', text: 'An Excel file with every sheet and column explained.', onClick: () => app.downloadTemplate() }
    ],
    footer: [
      h('button', { type: 'button', class: 'link-btn', text: 'How the bar chart editor works', onclick: openHelpDialog }), ' · ',
      h('button', { type: 'button', class: 'link-btn', text: 'About', onclick: openAboutDialog }), ' · ',
      h('a', { class: 'link-btn', href: '../', text: 'All tools' })
    ]
  })
}
