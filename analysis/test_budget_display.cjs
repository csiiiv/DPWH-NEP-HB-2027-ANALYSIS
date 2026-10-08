const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const sandbox = {window: {}, document: {readyState: 'loading', addEventListener() {}}, Intl};
vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'budget_display.js'), 'utf8'), sandbox);
const display = sandbox.window.BudgetDisplay;

test('budget amounts use three decimals and B/M/T scales, with T meaning thousands', () => {
  assert.equal(display.amount(642612015000), '₱642.612B');
  assert.equal(display.amount(123456789), '₱123.457M');
  assert.equal(display.amount(9876), '₱9.876T');
  assert.equal(display.amount(1), '₱0.001T');
  assert.equal(display.amount(0), '₱0.000T');
  assert.equal(display.amount(null), '—');
});

test('delta signs and colors reflect the exact underlying amount', () => {
  assert.equal(display.delta(11490000000), '+₱11.490B');
  assert.equal(display.delta(-2500000), '−₱2.500M');
  assert.equal(display.deltaClass(1), 'delta-positive');
  assert.equal(display.deltaClass(-1), 'delta-negative');
  assert.equal(display.deltaClass(0), 'delta-neutral');
  assert.equal(display.deltaClass(null), '');
});

test('numeric sorting orders mixed units and retains distinctions hidden by rounding', () => {
  const amounts = [9000000001, 950000, 1100000];
  assert.deepEqual(amounts.sort((a, b) => display.compare(a, b)), [950000, 1100000, 9000000001]);
  assert.equal(display.amount(1500000010), display.amount(1500000000));
  assert.ok(display.compare(1500000010, 1500000000) > 0);
  assert.match(display.cell(1500000010), /data-sort-value="1500000010"/);
});

test('unmapped and unpaired amounts stay last for both sort directions', () => {
  for (const direction of [1, -1]) {
    assert.ok(display.compare(null, 1000, direction) > 0);
    assert.ok(display.compare(1000, null, direction) < 0);
    assert.equal(display.compare(null, null, direction), 0);
  }
});
