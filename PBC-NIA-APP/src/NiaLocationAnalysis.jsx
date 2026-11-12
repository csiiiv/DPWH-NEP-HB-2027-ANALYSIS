import React, {useMemo, useState} from 'react';
import SortableTable from './SortableTable.jsx';
import {niaLocationAggregates, locationFlagLabels} from './niaLocationModel.js';
import {money} from './fmrModel.js';

/** Province / municipality / district distribution over located rows. */
export default function NiaLocationAnalysis({data}) {
  const aggregates = useMemo(() => niaLocationAggregates(data), [data]);
  const [view, setView] = useState('province');
  if (!aggregates) return null;
  const lists = {province: aggregates.provinces, municipality: aggregates.municipalities, district: aggregates.districts};
  const rows = lists[view].map((r, i) => ({...r, id: i, amount: r.amount_php || null}));
  const summary = aggregates.summary;
  return <section className="fmr-section nia-location-analysis">
    <h2>Geographical distribution</h2>
    <p className="fmr-muted">Grouped over the {summary.located} located rows of {summary.records}
      {' '}({summary.located_pct}%). {aggregates.unlocatedStatuses.paired || 0} paired ·
      {' '}{aggregates.unlocatedStatuses.house_only || 0} House-only ·
      {' '}{aggregates.unlocatedStatuses.nep_only || 0} NEP-only rows carry no location yet.</p>
    <div className="fmr-tablist" role="tablist" aria-label="Distribution level">
      {Object.entries({province: 'Provinces', municipality: 'Municipalities', district: 'Legislative districts'}).map(([key, label]) =>
        <button key={key} role="tab" aria-selected={view === key} className={view === key ? 'active' : ''}
          onClick={() => setView(key)}>{label}</button>)}
    </div>
    <SortableTable rows={rows} ariaLabel={`NIA ${view} distribution`} columns={[
      {key: 'key', label: view === 'municipality' ? 'Municipality · Province' : view === 'district' ? 'District' : 'Province'},
      {key: 'count', label: 'Projects', align: 'num'},
      {key: 'amount', label: 'Allocation (PHP)', align: 'num', render: r => money(r.amount)},
      {key: 'statuses.paired', label: 'Paired', align: 'num', value: r => r.statuses.paired},
      {key: 'statuses.house_only', label: 'House only', align: 'num', value: r => r.statuses.house_only},
      {key: 'statuses.nep_only', label: 'NEP only', align: 'num', value: r => r.statuses.nep_only},
    ]}/>
    {aggregates.flagged.length > 0 && <details className="nia-location-flags">
      <summary>{aggregates.flagged.length} located rows carry review flags</summary>
      <ul>{aggregates.flagged.map(r => <li key={r.id}><code>{r.id}</code> — {r.title} ·
        {' '}{r.flags.map(f => locationFlagLabels[f] || f).join(', ')}</li>)}</ul>
    </details>}
  </section>;
}
