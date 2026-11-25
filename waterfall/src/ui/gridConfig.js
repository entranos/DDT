// The waterfall editor's tables in the shared data grid: values, moments, diagrams, carriers.

import { columnsFromRows, optionalDot } from '../../../shared/src/grid.js'
import { ICON_NAMES } from '../../../shared/src/icons.js'
import { PATTERN_OPTIONS } from '../../../shared/src/patterns.js'
import { DIAGRAM_COLUMNS, MOMENT_COLUMNS, CARRIER_COLUMNS, VALUE_KEYS, carrierColor, parseBoolean, isFiniteNumber, isVisible } from '../model/schema.js'

const LABELS = { diagram: 'Diagram', carrier: 'Carrier', note: 'Note', id: 'ID', title: 'Title', subtitle: 'Subtitle', icon: 'Icon', visible: 'Visible', color: 'Colour', pattern: 'Pattern', patterncolor: 'Second colour' }

const yesNo = v => (v === '' ? '' : parseBoolean(v) ? 'Yes' : 'No')
const round = v => Math.round(v * 1000) / 1000
const YES_NO = { id: 'dl-yes-no', options: [{ value: 'Yes' }, { value: 'No' }] }
const withVisible = cols => cols.map(c => (c.key === 'visible' ? { ...c, format: yesNo } : c))

const totalsBy = (doc, key, momentId) => {
  const totals = new Map()
  doc.values.forEach(v => { if (isFiniteNumber(v[momentId])) totals.set(v[key], (totals.get(v[key]) || 0) + v[momentId]) })
  return totals
}

export function waterfallGridKinds (app) {
  const momentOf = key => (app.getDoc() ? app.getDoc().moments.find(m => m.id === key) : null)
  // Columns a table doesn't need itself can be deleted.
  const extraColumns = (kind, standard) => ({ canDelete: key => !key.startsWith('_') && !standard.includes(key), remove: key => app.deleteColumn(kind, key) })

  return {
    values: {
      label: 'Values',
      noun: 'values',
      selection: 'values',
      reveal: true,
      columns: doc => {
        const ids = doc.moments.map(m => m.id).filter(Boolean)
        const hidden = new Set(doc.moments.filter(m => !isVisible(m)).map(m => m.id))
        return [
          ...columnsFromRows({
            std: ['diagram', 'carrier', ...ids, 'note', 'pattern', 'patterncolor'],
            meta: doc.meta.valueColumns,
            rows: doc.values,
            labels: { ...LABELS, ...Object.fromEntries(doc.moments.map(m => [m.id, m.title || m.id])) },
            numeric: new Set(ids),
            lists: { diagram: 'dl-diagram-ids', carrier: 'dl-carrier-ids', pattern: 'dl-patterns' }
          }).map(c => (hidden.has(c.key) ? { ...c, muted: true } : c)),
          ...(ids.length > 1 ? [{ key: '_change', label: 'Change', readOnly: true, numeric: true }] : [])
        ]
      },
      decorate: (doc, rows) => {
        const ids = doc.moments.map(m => m.id).filter(Boolean)
        const first = ids[0]
        const last = ids[ids.length - 1]
        return rows.map(r => ({ ...r, _change: isFiniteNumber(r[first]) && isFiniteNumber(r[last]) ? round(r[last] - r[first]) : '' }))
      },
      datalists: doc => [
        { id: 'dl-diagram-ids', options: doc.diagrams.map(d => ({ value: d.id, label: d.title || '' })) },
        { id: 'dl-carrier-ids', options: doc.carriers.map(c => ({ value: c.id, label: c.title || '' })) },
        PATTERN_OPTIONS
      ],
      swatch: (doc, col, row) => {
        if (col === 'patterncolor') return optionalDot(row.patterncolor)
        if (col !== 'carrier') return undefined
        const c = doc.carriers.find(x => x.id === row.carrier)
        return c ? carrierColor(doc, c) : null
      },
      add: () => app.addEmptyValues(),
      // Its columns are the moments.
      columnActions: {
        ...extraColumns('values', VALUE_KEYS),
        add: (near, after) => app.addMomentColumn(near, after),
        canInsert: key => !!momentOf(key),
        canRename: key => !!momentOf(key),
        rename: (key, name) => app.renameMomentColumn(key, name),
        menu: key => { const m = momentOf(key); return m ? [{ label: isVisible(m) ? 'Hide in the diagram' : 'Show in the diagram', icon: isVisible(m) ? 'eyeOff' : 'eye', onClick: () => app.toggleVisible(m._uid) }] : [] }
      }
    },
    moments: {
      label: 'Moments',
      noun: 'moment',
      selection: 'moments',
      columns: doc => [
        ...withVisible(columnsFromRows({ std: MOMENT_COLUMNS, meta: doc.meta.momentColumns, rows: doc.moments, labels: LABELS, lists: { visible: 'dl-yes-no' } })),
        ...doc.diagrams.map(d => ({ key: `_total_${d.id}`, label: `Total ${d.title || d.id}`, readOnly: true, numeric: true }))
      ],
      decorate: (doc, rows) => rows.map(r => {
        const totals = totalsBy(doc, 'diagram', r.id)
        return { ...r, ...Object.fromEntries(doc.diagrams.map(d => [`_total_${d.id}`, round(totals.get(d.id) || 0)])) }
      }),
      datalists: () => [YES_NO],
      add: () => app.addMoment({ focus: false }),
      columnActions: extraColumns('moments', MOMENT_COLUMNS)
    },
    diagrams: {
      label: 'Diagrams',
      noun: 'diagram',
      selection: 'diagrams',
      columns: doc => withVisible(columnsFromRows({ std: DIAGRAM_COLUMNS, meta: doc.meta.diagramColumns, rows: doc.diagrams, labels: LABELS, lists: { visible: 'dl-yes-no' } })),
      datalists: () => [YES_NO],
      add: () => app.addDiagram({ focus: false }),
      columnActions: extraColumns('diagrams', DIAGRAM_COLUMNS)
    },
    carriers: {
      label: 'Carriers',
      noun: 'carrier',
      selection: 'carriers',
      columns: doc => columnsFromRows({ std: CARRIER_COLUMNS, meta: doc.meta.carrierColumns, rows: doc.carriers, labels: LABELS, lists: { icon: 'dl-icons', pattern: 'dl-patterns' } }),
      datalists: () => [{ id: 'dl-icons', options: [...ICON_NAMES, 'none'].map(value => ({ value })) }, PATTERN_OPTIONS],
      swatch: (doc, col, row) => (col === 'color' ? carrierColor(doc, doc.carriers.find(c => c._uid === row._uid) || row) : col === 'patterncolor' ? optionalDot(row.patterncolor) : undefined),
      add: () => app.addCarrier({ focus: false }),
      columnActions: extraColumns('carriers', CARRIER_COLUMNS)
    }
  }
}
