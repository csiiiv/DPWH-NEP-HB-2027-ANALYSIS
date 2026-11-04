import test from 'node:test';
import assert from 'node:assert/strict';
import {serializeSummary} from './summaryExport.js';

const rows = [
  {
    "name": "=unsafe,\"district\"",
    "representative": "Rep",
    "nepCount": 2,
    "nepAmount": 123456789,
    "houseCount": 3,
    "houseAmount": 150000000,
    "delta": 26543211,
    "card": {
      "id": "card1",
      "tier": "A",
      "region": "NCR",
      "rows": 3,
      "offices": [
        {
          "name": "Office 1"
        }
      ]
    }
  }
];
const meta = {
  "scope": "simple",
  "lens": "DEO",
  "filters": {
    "q": "test"
  },
  "sort": {
    "key": "houseCount",
    "direction": "desc"
  },
  "totals": {
    "nep": {
      "count": 2,
      "amount_php": 123456789
    },
    "house": {
      "count": 3,
      "amount_php": 150000000
    },
    "delta_php": 26543211,
    "rows": 3
  }
};

test('summary JSON exports keep exact counts, amounts, totals and sorted row order', () => {
  for (const scope of ['simple', 'full']) {
    const result = JSON.parse(serializeSummary(rows, {...meta, scope}, 'json'));
    assert.equal(result.rows[0].nepAmount, 123456789);
    assert.equal(result.rows[0].houseCount, 3);
    assert.equal(result.totals.delta, 26543211);
    assert.deepEqual(result.sort, meta.sort);
    assert.deepEqual(result.filters, meta.filters);
    assert.equal(Object.keys(result.rows[0]).length, scope === 'simple' ? 7 : 12);
    if (scope === 'full') {
      assert.equal(result.rows[0].cardId, 'card1');
      assert.deepEqual(result.rows[0].offices, ['Office 1']);
      assert.equal(result.totals.ledgerRows, 3);
    }
  }
});

test('both CSV scopes quote cells, guard formulas and end with totals', () => {
  for (const scope of ['simple', 'full']) {
    const csv = serializeSummary(rows, {...meta, scope}, 'csv');
    assert.ok(csv.startsWith('\ufeff'));
    assert.ok(csv.includes(`"'=unsafe,""district"""`));
    const lines = csv.split('\r\n');
    assert.equal(lines.length, 3);
    assert.ok(lines[2].startsWith('"Total",'));
    assert.ok(lines[1].includes('"123456789"'));
  }
});

test('empty summaries export no rows and zero totals', () => {
  const emptyMeta = {...meta, totals: {
    nep: {count: 0, amount_php: 0}, house: {count: 0, amount_php: 0},
    delta_php: 0, rows: 0,
  }};
  const result = JSON.parse(serializeSummary([], emptyMeta, 'json'));
  assert.deepEqual(result.rows, []);
  assert.equal(result.row_count, 0);
  assert.equal(result.totals.houseCount, 0);
});
