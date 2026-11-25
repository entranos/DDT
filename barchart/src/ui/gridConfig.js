// The bar chart editor's tables in the shared data grid: bars and series.

import { columnsFromRows, optionalDot } from '../../../shared/src/grid.js'
import { ICON_NAMES } from '../../../shared/src/icons.js'
import { PATTERN_OPTIONS } from '../../../shared/src/patterns.js'
import { SERIES_COLUMNS, BAR_KEYS, barColumns, iconKey, patternKey, patternColorKey, seriesColor, parseBoolean, isFiniteNumber, isVisible } from '../model/schema.js'

const LABELS = { title: 'Name', group: 'Group', icon: 'Icon', color: 'Colour', pattern: 'Pattern', patterncolor: 'Second colour', visible: 'Visible', note: 'Note', id: 'ID' }

const yesNo = v => (v === '' ? '' : parseBoolean(v) ? 'Yes' : 'No')
const round = v => Math.round(v * 1000) / 1000
const YES_NO = { id: 'dl-yes-no', options: [{ value: 'Yes' }, { value: 'No' }] }
const ICONS = { id: 'dl-icons', options: [...ICON_NAMES, 'none'].map(value => ({ value })) }
const withVisible = cols => cols.map(c => (c.key === 'visible' ? { ...c, format: yesNo } : c))
const sum = (rows, keys) => rows.reduce((t, r) => t + keys.reduce((s, k) => s + (isFiniteNumber(r[k]) ? r[k] : 0), 0), 0)

export function barchartGridKinds (app) {
  const seriesOf = key => (app.getDoc() ? app.getDoc().series.find(s => s.id === key) : null)
  const extraColumns = (kind, standard) => ({ canDelete: key => !key.startsWith('_') && !standard.includes(key), remove: key => app.deleteColumn(kind, key) })

  return {
    bars: {
      label: 'Bars',
      noun: 'bar',
      selection: 'bars',
      reveal: true,
      newColumns: true,
      columns: doc => {
        const ids = doc.series.map(s => s.id).filter(Boolean)
        const hidden = new Set(doc.series.filter(s => !isVisible(s)).map(s => s.id))
        const name = s => s.title || s.id
        const labels = { ...LABELS, ...Object.fromEntries(doc.series.flatMap(s => [[s.id, name(s)], [iconKey(s.id), `${name(s)}: icon`], [patternKey(s.id), `${name(s)}: pattern`], [patternColorKey(s.id), `${name(s)}: second colour`]])) }
        const lists = { group: 'dl-groups', icon: 'dl-icons', pattern: 'dl-patterns', visible: 'dl-yes-no', ...Object.fromEntries(doc.series.flatMap(s => [[iconKey(s.id), 'dl-icons'], [patternKey(s.id), 'dl-patterns']])) }
        return [
          ...withVisible(columnsFromRows({ std: barColumns(doc), meta: doc.meta.barColumns, rows: doc.bars, labels, numeric: new Set(ids), lists })).map(c => (hidden.has(c.key) ? { ...c, muted: true } : c)),
          ...(ids.length > 1 ? [{ key: '_total', label: 'Total', readOnly: true, numeric: true }] : [])
        ]
      },
      decorate: (doc, rows) => {
        const ids = doc.series.filter(isVisible).map(s => s.id).filter(Boolean)
        return rows.map(r => ({ ...r, _total: round(sum([r], ids)) }))
      },
      datalists: doc => [{ id: 'dl-groups', options: [...new Set(doc.bars.map(b => b.group).filter(Boolean))].map(value => ({ value })) }, ICONS, PATTERN_OPTIONS, YES_NO],
      swatch: (doc, col, row) => (col === 'color' || col.endsWith('patterncolor') ? optionalDot(row[col]) : undefined),
      add: () => app.addBar({ focus: false }),
      // Its columns of amounts are the series.
      columnActions: {
        ...extraColumns('bars', BAR_KEYS),
        add: (near, after) => app.addSeriesColumn(near, after),
        canInsert: key => !!seriesOf(key),
        canRename: key => !!seriesOf(key),
        rename: (key, name) => app.renameSeriesColumn(key, name),
        menu: key => { const s = seriesOf(key); return s ? [{ label: 'Colour, pattern and icon', icon: 'pencil', onClick: () => { app.setSelection({ series: [s._uid] }); app.showInspector() } }, { label: isVisible(s) ? 'Hide in the chart' : 'Show in the chart', icon: isVisible(s) ? 'eyeOff' : 'eye', onClick: () => app.toggleVisible(s._uid) }] : [] }
      }
    },
    series: {
      label: 'Series',
      noun: 'series',
      selection: 'series',
      columns: doc => [
        ...withVisible(columnsFromRows({ std: SERIES_COLUMNS, meta: doc.meta.seriesColumns, rows: doc.series, labels: { ...LABELS, title: 'Title' }, lists: { icon: 'dl-icons', pattern: 'dl-patterns', visible: 'dl-yes-no' } })),
        { key: '_total', label: 'Total', readOnly: true, numeric: true }
      ],
      decorate: (doc, rows) => { const shown = doc.bars.filter(isVisible); return rows.map(r => ({ ...r, _total: round(sum(shown, [r.id])) })) },
      datalists: () => [ICONS, PATTERN_OPTIONS, YES_NO],
      swatch: (doc, col, row) => (col === 'color' ? seriesColor(doc, doc.series.find(s => s._uid === row._uid) || row) : col === 'patterncolor' ? optionalDot(row.patterncolor) : undefined),
      add: () => app.addSeries({ focus: false }),
      columnActions: extraColumns('series', SERIES_COLUMNS)
    }
  }
}
