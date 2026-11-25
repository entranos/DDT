// The treemap editor's tables in the shared data grid: values, blocks, carriers.

import { columnsFromRows, optionalDot } from '../../../shared/src/grid.js'
import { BLOCK_COLUMNS, VALUE_COLUMNS, CARRIER_COLUMNS, carrierColor, parseBoolean, isFiniteNumber } from '../model/schema.js'
import { ICON_NAMES } from '../../../shared/src/icons.js'
import { PATTERN_OPTIONS } from '../../../shared/src/patterns.js'

const LABELS = { block: 'Block', carrier: 'Carrier', part: 'Part', value: 'Value', note: 'Note', id: 'ID', title: 'Title', group: 'Group', icon: 'Icon', visible: 'Visible', color: 'Colour', pattern: 'Pattern', patterncolor: 'Second colour' }

const yesNo = v => (v === '' ? '' : parseBoolean(v) ? 'Yes' : 'No')
const totalBy = (doc, key) => {
  const totals = new Map()
  doc.values.forEach(v => { if (isFiniteNumber(v.value)) totals.set(v[key], (totals.get(v[key]) || 0) + v.value) })
  return totals
}
const round = v => Math.round(v * 1000) / 1000

export function treemapGridKinds (app) {
  return {
    values: {
      label: 'Values',
      noun: 'value',
      selection: 'values',
      reveal: true,
      columns: doc => [
        ...columnsFromRows({ std: VALUE_COLUMNS, meta: doc.meta.valueColumns, rows: doc.values, labels: LABELS, numeric: new Set(['value']), lists: { block: 'dl-block-ids', carrier: 'dl-carrier-ids', icon: 'dl-icons', pattern: 'dl-patterns' } }),
        { key: '_share', label: '% of block', readOnly: true, numeric: true }
      ],
      decorate: (doc, rows) => {
        const totals = totalBy(doc, 'block')
        return rows.map(r => ({ ...r, _share: isFiniteNumber(r.value) && totals.get(r.block) > 0 ? Math.round((r.value / totals.get(r.block)) * 1000) / 10 : '' }))
      },
      datalists: doc => [
        { id: 'dl-block-ids', options: doc.blocks.map(b => ({ value: b.id, label: b.title || '' })) },
        { id: 'dl-carrier-ids', options: doc.carriers.map(c => ({ value: c.id, label: c.title || '' })) },
        { id: 'dl-icons', options: [...ICON_NAMES, 'none'].map(value => ({ value })) },
        PATTERN_OPTIONS
      ],
      swatch: (doc, col, row) => {
        if (col === 'patterncolor') return optionalDot(row.patterncolor)
        if (col !== 'carrier') return undefined
        const c = doc.carriers.find(x => x.id === row.carrier)
        return c ? carrierColor(doc, c) : null
      },
      pasteDefaults: row => ({ value: 0, ...row }),
      add: () => app.addEmptyValue()
    },
    blocks: {
      label: 'Blocks',
      noun: 'block',
      selection: 'blocks',
      reveal: true,
      columns: doc => [
        ...columnsFromRows({ std: BLOCK_COLUMNS, meta: doc.meta.blockColumns, rows: doc.blocks, labels: LABELS, lists: { group: 'dl-groups', icon: 'dl-icons', visible: 'dl-yes-no' } })
          .map(c => (c.key === 'visible' ? { ...c, format: yesNo } : c)),
        { key: '_total', label: 'Total', readOnly: true, numeric: true }
      ],
      decorate: (doc, rows) => {
        const totals = totalBy(doc, 'block')
        return rows.map(r => ({ ...r, _total: round(totals.get(r.id) || 0) }))
      },
      datalists: doc => [
        { id: 'dl-groups', options: [...new Set(doc.blocks.map(b => b.group).filter(Boolean))].map(value => ({ value })) },
        { id: 'dl-icons', options: [...ICON_NAMES, 'none'].map(value => ({ value })) },
        { id: 'dl-yes-no', options: [{ value: 'Yes' }, { value: 'No' }] }
      ],
      add: () => app.addBlock({ focus: false })
    },
    carriers: {
      label: 'Carriers',
      noun: 'carrier',
      selection: 'carriers',
      columns: doc => [
        ...columnsFromRows({ std: CARRIER_COLUMNS, meta: doc.meta.carrierColumns, rows: doc.carriers, labels: LABELS, lists: { icon: 'dl-icons', pattern: 'dl-patterns' } }),
        { key: '_total', label: 'Total', readOnly: true, numeric: true }
      ],
      decorate: (doc, rows) => {
        const totals = totalBy(doc, 'carrier')
        return rows.map(r => ({ ...r, _total: round(totals.get(r.id) || 0) }))
      },
      datalists: () => [{ id: 'dl-icons', options: [...ICON_NAMES, 'none'].map(value => ({ value })) }, PATTERN_OPTIONS],
      swatch: (doc, col, row) => (col === 'color' ? carrierColor(doc, doc.carriers.find(c => c._uid === row._uid) || row) : col === 'patterncolor' ? optionalDot(row.patterncolor) : undefined),
      add: () => app.addCarrier({ focus: false })
    }
  }
}
