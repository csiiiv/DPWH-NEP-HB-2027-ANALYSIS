const pap = 'Rainwater Collector System';

export function rainwaterAllocations(rows, side) {
  return rows.flatMap(row => row[side] ? (row[side].records ?? [row[side]])
    .map(member => ({...row[side], ...member}))
    .filter(record => record.pap === pap) : []);
}

export function rainwaterSummary(rows) {
  return Object.fromEntries(['nep', 'second', 'third'].map(side => {
    const records = rainwaterAllocations(rows, side), bands = new Map();
    for (const record of records) bands.set(record.amount_php, (bands.get(record.amount_php) ?? 0) + 1);
    return [side, {
      records: records.length,
      amount_php: records.reduce((sum, record) => sum + record.amount_php, 0),
      bands: [...bands].map(([amount_php, records]) => ({amount_php, records, total_php: amount_php * records})).sort((a,b) => b.records - a.records),
    }];
  }));
}
