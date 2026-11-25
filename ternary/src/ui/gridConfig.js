// The ternary editor's tables in the shared data grid: points, series, corners.

import { columnsFromRows } from '../../../shared/src/grid.js'
import { AXIS_COLUMNS, SERIES_COLUMNS, CORNERS, pointColumns, parseBoolean, isFiniteNumber } from '../model/schema.js'
import { seriesColors } from '../model/mix.js'

const LABELS = { series: 'Series', year: 'Year', id: 'ID', title: 'Title', group: 'Group', color: 'Colour', style: 'Style', highlight: 'Highlight', visible: 'Visible', label: 'Name', corner: 'Corner', low: 'Arrow start', high: 'Arrow end' }

const yesNo = v => (v === '' ? '' : parseBoolean(v) ? 'Yes' : 'No')

export function ternaryGridKinds (app) {
  return {
    points: {
      label: 'Points',
      noun: 'point',
      selection: 'points',
      reveal: true,
      columns: doc => [
        ...columnsFromRows({
          std: pointColumns(doc),
          meta: doc.meta.pointColumns,
          rows: doc.points,
          labels: { ...LABELS, ...Object.fromEntries(doc.axes.map(a => [a.id, a.label || a.id])) },
          numeric: new Set(['year', ...doc.axes.map(a => a.id)]),
          lists: { series: 'dl-series-ids' }
        }),
        { key: '_total', label: 'Total', readOnly: true, numeric: true },
        ...doc.axes.map(a => ({ key: `_share_${a.id}`, label: `${a.label || a.id} %`, readOnly: true, numeric: true }))
      ],
      decorate: (doc, rows) => rows.map(r => {
        const values = doc.axes.map(a => r[a.id])
        const ok = values.every(v => isFiniteNumber(v) && v >= 0)
        const total = ok ? values.reduce((a, b) => a + b, 0) : null
        const out = { ...r, _total: total === null ? '' : Math.round(total * 1000) / 1000 }
        doc.axes.forEach((a, i) => { out[`_share_${a.id}`] = total > 0 ? Math.round((values[i] / total) * 1000) / 10 : '' })
        return out
      }),
      datalists: doc => [{ id: 'dl-series-ids', options: doc.series.map(s => ({ value: s.id, label: s.title || '' })) }],
      swatch: (doc, col, row) => {
        if (col !== 'series') return undefined
        const s = doc.series.find(x => x.id === row.series)
        return s ? seriesColors(doc).get(s._uid) : null
      },
      add: () => app.addEmptyPoint()
    },
    series: {
      label: 'Series',
      noun: 'series',
      selection: 'series',
      reveal: true,
      columns: doc => [
        ...columnsFromRows({ std: SERIES_COLUMNS, meta: doc.meta.seriesColumns, rows: doc.series, labels: LABELS, lists: { style: 'dl-styles', highlight: 'dl-yes-no', visible: 'dl-yes-no' } })
          .map(c => (c.key === 'highlight' || c.key === 'visible' ? { ...c, format: yesNo } : c)),
        { key: '_points', label: 'Points', readOnly: true, numeric: true }
      ],
      decorate: (doc, rows) => {
        const counts = new Map()
        doc.points.forEach(p => counts.set(p.series, (counts.get(p.series) || 0) + 1))
        return rows.map(r => ({ ...r, _points: counts.get(r.id) || 0 }))
      },
      datalists: () => [
        { id: 'dl-styles', options: [{ value: 'solid' }, { value: 'dashed' }] },
        { id: 'dl-yes-no', options: [{ value: 'Yes' }, { value: 'No' }] }
      ],
      swatch: (doc, col, row) => (col === 'color' ? seriesColors(doc).get(row._uid) || null : undefined),
      add: () => app.addSeries({ focus: false })
    },
    axes: {
      label: 'Corners',
      noun: 'corner',
      selection: 'axes',
      fixed: true,
      columns: doc => columnsFromRows({ std: AXIS_COLUMNS, meta: doc.meta.axisColumns, rows: doc.axes, labels: LABELS, lists: { corner: 'dl-corners' } }),
      datalists: () => [{ id: 'dl-corners', options: CORNERS.map(c => ({ value: c.id, label: c.label })) }]
    }
  }
}
