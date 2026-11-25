// Flow details for one node: incoming and outgoing flows as bars and tables,
// with copy-to-clipboard and xlsx download. Opened by double-clicking a node.
// Values use the diagram's own unit; nothing is converted.

import { h } from '../../../shared/src/dom.js'
import { openDialog, toast } from '../../../shared/src/feedback.js'
import { getSetting, isFiniteNumber } from '../model/schema.js'
import { formatNumber, formatValue } from '../../../shared/src/format.js'
import { lib } from '../../../shared/src/lib.js'
import { download } from '../../../shared/src/files.js'

export function openNodeDetails (app, uid) {
  const doc = app.getDoc()
  const node = doc.nodes.find(n => n._uid === uid)
  if (!node) return
  const unit = getSetting(doc, 'unit')
  const dec = getSetting(doc, 'decimalsRoundValues')
  const names = new Map(doc.nodes.map(n => [n.id, n.title || n.id]))
  const colors = new Map(doc.carriers.map(c => [c.id, c.color]))
  const rows = (links, other) => links
    .filter(l => isFiniteNumber(l.value) && l.value > 0)
    .map(l => ({ uid: l._uid, id: l[other], name: names.get(l[other]) || l[other], carrier: l.carrier, color: colors.get(l.carrier) || '#000', value: l.value }))
    .sort((a, b) => b.value - a.value)
  const incoming = rows(doc.links.filter(l => l.target === node.id), 'source')
  const outgoing = rows(doc.links.filter(l => l.source === node.id), 'target')
  const sum = list => list.reduce((s, r) => s + r.value, 0)
  const totalIn = sum(incoming)
  const totalOut = sum(outgoing)
  const diff = totalOut - totalIn
  const max = Math.max(1e-9, ...incoming.map(r => r.value), ...outgoing.map(r => r.value))
  const title = node.title || node.id

  let dialog = null
  const column = (label, list, otherLabel) => h('section', { class: 'nd-col' },
    h('h3', {}, `${label} `, h('span', { class: 'muted', text: `(${list.length})` }), h('span', { class: 'nd-total', text: formatValue(sum(list), dec, unit) })),
    list.length
      ? h('div', { class: 'nd-bars' }, list.map(r => h('button', {
        type: 'button',
        class: 'nd-bar-row',
        title: `Select this flow (${r.name}, ${r.carrier})`,
        onclick: () => { dialog.close(); app.setSelection({ links: [r.uid] }); app.reveal([r.uid]) }
      },
      h('span', { class: 'nd-name', text: r.name }),
      h('span', { class: 'nd-bar-track' }, h('span', { class: 'nd-bar', style: { width: `${(r.value / max) * 100}%`, background: r.color } })),
      h('span', { class: 'nd-value', text: formatNumber(r.value, dec) })
      )))
      : h('p', { class: 'muted', text: `No ${label.toLowerCase()} flows.` }),
    list.length ? h('table', { class: 'nd-table' },
      h('thead', {}, h('tr', {}, h('th', { text: otherLabel }), h('th', { text: 'ID' }), h('th', { text: 'Carrier' }), h('th', { class: 'num', text: 'Value', title: unit ? `Values in ${unit}` : undefined }))),
      h('tbody', {}, list.map(r => h('tr', {},
        h('td', { text: r.name, title: r.name }), h('td', { class: 'mono muted', text: r.id, title: r.id }),
        h('td', {}, h('span', { class: 'dot', style: { background: r.color } }), r.carrier || ''),
        h('td', { class: 'num', text: formatNumber(r.value, dec) })))),
      h('tfoot', {}, h('tr', {}, h('td', { text: 'Total', colspan: '3' }), h('td', { class: 'num', text: formatNumber(sum(list), dec) })))
    ) : null
  )

  const tableRows = () => [
    ['Node', title], ['ID', node.id], ['Unit', unit], [],
    ['INCOMING'], ['From', 'ID', 'Carrier', 'Value'], ...incoming.map(r => [r.name, r.id, r.carrier, r.value]), ['Total', '', '', totalIn], [],
    ['OUTGOING'], ['To', 'ID', 'Carrier', 'Value'], ...outgoing.map(r => [r.name, r.id, r.carrier, r.value]), ['Total', '', '', totalOut]
  ]

  const body = h('div', { class: 'node-details' },
    h('div', { class: 'nd-summary' },
      h('span', { class: 'mono muted', text: node.id }),
      h('span', {}, 'In ', h('strong', { text: formatValue(totalIn, dec, unit) })),
      h('span', {}, 'Out ', h('strong', { text: formatValue(totalOut, dec, unit) })),
      totalIn && totalOut ? h('span', { class: Math.abs(diff) > 1 ? 'warn' : 'ok' }, 'Balance ', h('strong', { text: `${diff > 0 ? '+' : ''}${formatNumber(diff, dec)}` })) : null
    ),
    h('div', { class: 'nd-cols' }, column('Incoming', incoming, 'From'), column('Outgoing', outgoing, 'To'))
  )

  dialog = openDialog({
    title,
    body,
    width: 980,
    className: 'dialog-wide',
    actions: [
      {
        label: 'Copy as table',
        close: false,
        onClick: async () => {
          const text = tableRows().map(r => r.map(v => (typeof v === 'number' ? String(v).replace('.', ',') : v ?? '')).join('\t')).join('\n')
          try { await navigator.clipboard.writeText(text); toast('Copied. Paste it into a spreadsheet.', { kind: 'success' }) } catch (e) { toast('The browser blocked clipboard access.', { kind: 'error' }) }
          return false
        }
      },
      {
        label: 'Download xlsx',
        close: false,
        onClick: () => {
          const XLSX = lib.XLSX
          const wb = XLSX.utils.book_new()
          const ws = XLSX.utils.aoa_to_sheet(tableRows())
          ws['!cols'] = [{ wch: 36 }, { wch: 28 }, { wch: 22 }, { wch: 14 }]
          XLSX.utils.book_append_sheet(wb, ws, 'Node flows')
          const safe = String(title).replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '') || 'node'
          download(XLSX.write(wb, { bookType: 'xlsx', type: 'array' }), `node_flows_${safe}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
          return false
        }
      },
      { label: 'Close', kind: 'primary' }
    ]
  })
}
