// The chord editor's tables in the shared data grid: flows, nodes, groups, carriers,
// scenarios and details.

import { columnsFromRows, optionalDot } from '../../../shared/src/grid.js'
import { ICON_NAMES } from '../../../shared/src/icons.js'
import { PATTERN_OPTIONS } from '../../../shared/src/patterns.js'
import { META, NODE_COLUMNS, GROUP_COLUMNS, CARRIER_COLUMNS, SCENARIO_COLUMNS, FLOW_HEAD, FLOW_TAIL, DETAIL_HEAD, flowColumns, detailColumns, scenarioIds, carrierColor, shownScenario, parseBoolean, isFiniteNumber } from '../model/schema.js'

const LABELS = { source: 'From', target: 'To', carrier: 'Carrier', part: 'Part', note: 'Note', icon: 'Icon', pattern: 'Pattern', patterncolor: 'Second colour', id: 'ID', title: 'Title', group: 'Group', color: 'Colour', label: 'Label', visible: 'Visible', labelx: 'Label x', labely: 'Label y', place: 'Place', node: 'Node', value: 'Value' }

const yesNo = v => (v === '' ? '' : parseBoolean(v) ? 'Yes' : 'No')
const round = v => Math.round(v * 1000) / 1000
const YES_NO = { id: 'dl-yes-no', options: [{ value: 'Yes' }, { value: 'No' }] }
const ICONS = { id: 'dl-icons', options: [...ICON_NAMES, 'none'].map(value => ({ value })) }
const PLACES = { id: 'dl-places', options: [{ value: 'outside' }, { value: 'inside' }] }
const withFlags = cols => cols.map(c => (c.key === 'visible' || c.key === 'label' ? { ...c, format: yesNo } : c))

export function chordGridKinds (app) {
  const scenarioOf = key => (app.getDoc() ? app.getDoc().scenarios.find(s => s.id === key) : null)
  const extraColumns = (kind, standard) => ({ canDelete: key => !key.startsWith('_') && !standard.includes(key), remove: key => app.deleteColumn(kind, key) })
  const labels = doc => ({ ...LABELS, ...Object.fromEntries(doc.scenarios.map(s => [s.id, s.title || s.id])) })
  // The other scenarios' amounts are muted: only one is on the canvas.
  const amounts = (doc, cols) => { const shown = shownScenario(doc); return cols.map(c => (scenarioIds(doc).includes(c.key) && shown && c.key !== shown.id ? { ...c, muted: true } : c)) }
  const scenarioColumns = (kind, standard) => ({
    ...extraColumns(kind, standard),
    add: (near, after) => app.addScenarioColumn(near, after),
    canInsert: key => !!scenarioOf(key),
    canRename: key => !!scenarioOf(key),
    rename: (key, name) => app.renameScenarioColumn(key, name),
    menu: key => { const s = scenarioOf(key); return s ? [{ label: 'Show in the diagram', icon: 'eye', onClick: () => app.showScenario(s._uid) }] : [] }
  })
  const nodeList = doc => ({ id: 'dl-node-ids', options: doc.nodes.map(n => ({ value: n.id, label: n.title || '' })) })
  const carrierSwatch = (doc, id) => { const c = doc.carriers.find(x => x.id === id); return c ? carrierColor(doc, c) : null }
  const totalOf = (doc, match) => { const s = shownScenario(doc); return round(doc.flows.reduce((t, f) => t + (s && match(f) && isFiniteNumber(f[s.id]) ? f[s.id] : 0), 0)) }

  return {
    flows: {
      label: 'Flows',
      noun: 'flow',
      selection: 'flows',
      reveal: true,
      newColumns: true,
      columns: doc => amounts(doc, columnsFromRows({ std: flowColumns(doc), meta: doc.meta.flowColumns, rows: doc.flows, labels: labels(doc), numeric: new Set(scenarioIds(doc)), lists: { source: 'dl-node-ids', target: 'dl-node-ids', carrier: 'dl-carrier-ids', icon: 'dl-icons', pattern: 'dl-patterns' } })),
      datalists: doc => [nodeList(doc), { id: 'dl-carrier-ids', options: doc.carriers.map(c => ({ value: c.id, label: c.title || '' })) }, ICONS, PATTERN_OPTIONS],
      swatch: (doc, col, row) => (col === 'carrier' ? carrierSwatch(doc, row.carrier) : col === 'patterncolor' ? optionalDot(row.patterncolor) : undefined),
      add: () => app.addEmptyFlow(),
      columnActions: scenarioColumns('flows', [...FLOW_HEAD, ...FLOW_TAIL])
    },
    nodes: {
      label: 'Nodes',
      noun: 'node',
      selection: 'nodes',
      reveal: true,
      columns: doc => [
        ...withFlags(columnsFromRows({ std: NODE_COLUMNS, meta: doc.meta[META.nodes], rows: doc.nodes, labels: LABELS, numeric: new Set(['labelx', 'labely']), lists: { group: 'dl-groups', icon: 'dl-icons', visible: 'dl-yes-no', label: 'dl-yes-no' } })),
        { key: '_in', label: 'In', readOnly: true, numeric: true },
        { key: '_out', label: 'Out', readOnly: true, numeric: true }
      ],
      decorate: (doc, rows) => rows.map(r => ({ ...r, _in: totalOf(doc, f => f.target === r.id), _out: totalOf(doc, f => f.source === r.id) })),
      datalists: doc => [{ id: 'dl-groups', options: doc.groups.map(g => ({ value: g.id, label: g.title || '' })) }, ICONS, YES_NO],
      swatch: (doc, col, row) => (col === 'color' ? optionalDot(row.color) : undefined),
      add: () => app.addNode({ focus: false }),
      columnActions: extraColumns('nodes', NODE_COLUMNS)
    },
    groups: {
      label: 'Groups',
      noun: 'group',
      selection: 'groups',
      columns: doc => [
        ...columnsFromRows({ std: GROUP_COLUMNS, meta: doc.meta[META.groups], rows: doc.groups, labels: LABELS, lists: { place: 'dl-places' } }),
        { key: '_nodes', label: 'Nodes', readOnly: true, numeric: true }
      ],
      decorate: (doc, rows) => rows.map(r => ({ ...r, _nodes: doc.nodes.filter(n => n.group === r.id).length })),
      datalists: () => [PLACES],
      swatch: (doc, col, row) => (col === 'color' ? optionalDot(row.color) : undefined),
      add: () => app.addGroup({ focus: false }),
      columnActions: extraColumns('groups', GROUP_COLUMNS)
    },
    carriers: {
      label: 'Carriers',
      noun: 'carrier',
      selection: 'carriers',
      columns: doc => [
        ...withFlags(columnsFromRows({ std: CARRIER_COLUMNS, meta: doc.meta[META.carriers], rows: doc.carriers, labels: LABELS, lists: { icon: 'dl-icons', pattern: 'dl-patterns', visible: 'dl-yes-no' } })),
        { key: '_total', label: 'Total', readOnly: true, numeric: true }
      ],
      decorate: (doc, rows) => rows.map(r => ({ ...r, _total: totalOf(doc, f => f.carrier === r.id) })),
      datalists: () => [ICONS, PATTERN_OPTIONS, YES_NO],
      swatch: (doc, col, row) => (col === 'color' ? carrierColor(doc, doc.carriers.find(c => c._uid === row._uid) || row) : col === 'patterncolor' ? optionalDot(row.patterncolor) : undefined),
      add: () => app.addCarrier({ focus: false }),
      columnActions: extraColumns('carriers', CARRIER_COLUMNS)
    },
    scenarios: {
      label: 'Scenarios',
      noun: 'scenario',
      selection: 'scenarios',
      columns: doc => [
        ...columnsFromRows({ std: SCENARIO_COLUMNS, meta: doc.meta[META.scenarios], rows: doc.scenarios, labels: LABELS }),
        { key: '_total', label: 'Total', readOnly: true, numeric: true }
      ],
      decorate: (doc, rows) => rows.map(r => ({ ...r, _total: round(doc.flows.reduce((t, f) => t + (isFiniteNumber(f[r.id]) ? f[r.id] : 0), 0)) })),
      add: () => app.addScenario({ focus: false }),
      columnActions: extraColumns('scenarios', SCENARIO_COLUMNS)
    },
    details: {
      label: 'Details',
      noun: 'detail',
      selection: 'details',
      columns: doc => amounts(doc, columnsFromRows({ std: detailColumns(doc), meta: doc.meta[META.details], rows: doc.details, labels: labels(doc), numeric: new Set(scenarioIds(doc)), lists: { node: 'dl-node-ids' } })),
      datalists: doc => [nodeList(doc)],
      add: () => app.addDetail(),
      columnActions: scenarioColumns('details', DETAIL_HEAD)
    }
  }
}
