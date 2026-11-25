// The sankey editor's tables in the shared data grid: flows, nodes, carriers.

import { columnsFromRows, optionalDot } from '../../../shared/src/grid.js'
import { LINK_COLUMNS, NODE_COLUMNS, CARRIER_COLUMNS } from '../model/schema.js'
import { nodeTotals } from '../model/graph.js'
import { ICON_NAMES } from '../../../shared/src/icons.js'
import { PATTERN_OPTIONS } from '../../../shared/src/patterns.js'

const ICON_OPTIONS = { id: 'dl-icons', options: [...ICON_NAMES, 'none'].map(value => ({ value })) }

const LABELS = { source: 'From', target: 'To', value: 'Value', carrier: 'Carrier', type: 'Type', annotate: 'Note', icon: 'Icon', iconposition: 'Icon at %', id: 'ID', title: 'Title', x: 'X', y: 'Y', direction: 'Direction', labelposition: 'Label side', color: 'Colour', pattern: 'Pattern', patterncolor: 'Second colour' }

export function sankeyGridKinds (app) {
  return {
    links: {
      label: 'Flows',
      noun: 'flow',
      selection: 'links',
      reveal: true,
      columns: doc => columnsFromRows({
        std: LINK_COLUMNS,
        meta: doc.meta.linkColumns,
        rows: doc.links,
        labels: LABELS,
        numeric: new Set(['value', 'iconposition']),
        lists: { source: 'dl-node-ids', target: 'dl-node-ids', carrier: 'dl-carrier-ids', icon: 'dl-icons', pattern: 'dl-patterns' }
      }),
      datalists: doc => [
        { id: 'dl-node-ids', options: doc.nodes.map(n => ({ value: n.id, label: n.title || '' })) },
        { id: 'dl-carrier-ids', options: doc.carriers.map(c => ({ value: c.id })) },
        ICON_OPTIONS,
        PATTERN_OPTIONS
      ],
      swatch: (doc, col, row) => {
        if (col === 'patterncolor') return optionalDot(row.patterncolor)
        if (col !== 'carrier') return undefined
        const c = doc.carriers.find(x => x.id === row.carrier)
        return c ? c.color : null
      },
      pasteDefaults: row => ({ value: 0, ...row }),
      add: () => app.addEmptyFlow()
    },
    nodes: {
      label: 'Nodes',
      noun: 'node',
      selection: 'nodes',
      reveal: true,
      columns: doc => [
        ...columnsFromRows({ std: NODE_COLUMNS, meta: doc.meta.nodeColumns, rows: doc.nodes, labels: LABELS, numeric: new Set(['x', 'y']) }),
        { key: '_in', label: 'In', readOnly: true, numeric: true },
        { key: '_out', label: 'Out', readOnly: true, numeric: true }
      ],
      decorate: (doc, rows) => {
        const totals = nodeTotals(doc)
        return rows.map(r => ({ ...r, _in: totals.get(r.id)?.in ?? 0, _out: totals.get(r.id)?.out ?? 0 }))
      },
      pasteDefaults: row => ({ x: 0, y: 0, direction: 'right', labelposition: 'right', ...row }),
      add: () => app.addNodeAt(null, { focus: false })
    },
    carriers: {
      label: 'Carriers',
      noun: 'carrier',
      selection: 'carriers',
      columns: doc => [
        ...columnsFromRows({ std: CARRIER_COLUMNS, meta: doc.meta.carrierColumns, rows: doc.carriers, labels: LABELS, lists: { icon: 'dl-icons', pattern: 'dl-patterns' } }),
        { key: '_uses', label: 'Flows', readOnly: true, numeric: true }
      ],
      decorate: (doc, rows) => {
        const uses = new Map()
        doc.links.forEach(l => uses.set(l.carrier, (uses.get(l.carrier) || 0) + 1))
        return rows.map(r => ({ ...r, _uses: uses.get(r.id) || 0 }))
      },
      datalists: () => [ICON_OPTIONS, PATTERN_OPTIONS],
      swatch: (doc, col, row) => (col === 'color' ? row.color || null : col === 'patterncolor' ? optionalDot(row.patterncolor) : undefined),
      add: () => app.addCarrier({ focus: false })
    }
  }
}
