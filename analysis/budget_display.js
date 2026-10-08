/* Shared budget formatting and accessible table sorting. T means thousands. */
(function () {
  'use strict';
  const states = new WeakMap();
  const collator = new Intl.Collator('en', {numeric: true, sensitivity: 'base'});
  function amount(value, currency = true) {
    if (value == null || !Number.isFinite(Number(value))) return '—';
    const n = Number(value), a = Math.abs(n);
    const [scale, suffix] = a >= 1e9 ? [1e9, 'B'] : a >= 1e6 ? [1e6, 'M'] : [1e3, 'T'];
    return (n < 0 ? '−' : '') + (currency ? '₱' : '') + (a / scale).toFixed(3) + suffix;
  }
  function deltaClass(value) {
    return value == null ? '' : Number(value) > 0 ? 'delta-positive' : Number(value) < 0 ? 'delta-negative' : 'delta-neutral';
  }
  function delta(value) {
    return value == null ? 'Not paired / mapped' : (Number(value) > 0 ? '+' : '') + amount(value);
  }
  function cell(value, isDelta = false) {
    return `<td class="num ${isDelta ? deltaClass(value) : ''}" data-sort-value="${value == null ? '' : Number(value)}">${value == null ? 'Not mapped' : isDelta ? delta(value) : amount(value)}</td>`;
  }
  function compare(a, b, direction = 1) {
    // Unknown/unpaired values sort last in both directions.
    if (a == null || a === '') return b == null || b === '' ? 0 : 1;
    if (b == null || b === '') return -1;
    return direction * (typeof a === 'number' && typeof b === 'number' ? a - b : collator.compare(String(a), String(b)));
  }
  function value(cell) {
    if (!cell) return null;
    if (cell.hasAttribute('data-sort-value')) {
      const raw = cell.dataset.sortValue;
      return raw === '' ? null : Number.isFinite(Number(raw)) ? Number(raw) : raw;
    }
    const text = cell.innerText.trim();
    // Fallback for historical text cells. Current money cells store exact pesos.
    const match = text.replace(/,/g, '').replace(/−/g, '-').match(/^[+≈]?\s*([+-]?)\s*₱?\s*(\d+(?:\.\d+)?)([BMT])?(?:\s|$)/);
    if (match) return (match[1] === '-' ? -1 : 1) * Number(match[2]) * ({B: 1e9, M: 1e6, T: 1e3}[match[3]] || 1);
    return /^(—|Not mapped|Not paired|See suggestions)$/.test(text) ? null : text;
  }
  function groups(table) {
    const grouped = [], footer = [];
    const width = table.tHead.rows[0].cells.length;
    for (const row of [...table.tBodies[0].rows]) {
      if (row.matches('.subrow,.sub,.detail') && grouped.length) {
        grouped[grouped.length - 1].rows.push(row);
      } else if (row.cells.length === width) {
        grouped.push({rows: [row]});
      } else footer.push(row);
    }
    return {grouped, footer};
  }
  function updateHeaders(table, state) {
    [...table.tHead.rows[0].cells].forEach((th, column) => {
      const direction = state.column === column ? state.direction === 1 ? 'ascending' : 'descending' : 'none';
      th.setAttribute('aria-sort', direction);
      const button = th.querySelector('button[data-sort-column]');
      button.title = `Sort ${button.dataset.label} ${direction === 'ascending' ? 'descending' : 'ascending'}`;
      button.textContent = button.dataset.label + (direction === 'ascending' ? ' ▲' : direction === 'descending' ? ' ▼' : ' ↕');
    });
  }
  function apply(table, state) {
    if (state.column == null || state.handler) return;
    const {grouped, footer} = groups(table);
    const sorted = [...grouped].sort((a, b) => compare(value(a.rows[0].cells[state.column]), value(b.rows[0].cells[state.column]), state.direction));
    // Avoid unnecessary DOM moves and focus changes on already sorted bodies.
    if (sorted.every((g, i) => g === grouped[i])) return;
    const fragment = document.createDocumentFragment();
    sorted.forEach(g => g.rows.forEach(r => fragment.append(r)));
    footer.forEach(r => fragment.append(r));
    table.tBodies[0].append(fragment);
  }
  function enhanceTables(root = document) {
    for (const table of root.querySelectorAll('table')) {
      if (!table.tBodies.length) continue;
      if (!table.tHead && ['gt', 'sec'].includes(table.id)) {
        const head = table.createTHead(), row = head.insertRow();
        for (const label of [table.id === 'gt' ? 'Measure' : 'Section', 'Amount']) {
          const th = document.createElement('th');th.scope = 'col';th.textContent = label;row.append(th);
        }
      }
      if (!table.tHead?.rows.length) continue;
      let state = states.get(table);
      if (!state) {
        state = {column: null, direction: 1, handler: null};states.set(table, state);
        [...table.tHead.rows[0].cells].forEach((th, column) => {
          const button = document.createElement('button');button.type = 'button';button.dataset.sortColumn = column;
          button.dataset.label = th.textContent.trim();button.className = 'table-sort';
          button.addEventListener('click', () => {
            state.direction = state.column === column ? -state.direction : 1;state.column = column;
            updateHeaders(table, state);
            if (state.handler) state.handler(column, state.direction);else apply(table, state);
          });
          th.replaceChildren(button);
        });
      }
      updateHeaders(table, state);apply(table, state);
    }
  }
  function register(table, handler) {
    enhanceTables();states.get(table).handler = handler;
  }
  function clear(table) {
    const state = states.get(table);if (!state) return;state.column = null;state.direction = 1;updateHeaders(table, state);
  }
  function sortState(table) {return states.get(table) || {column: null, direction: 1};}
  function start() {
    const style = document.createElement('style');
    style.textContent = '.table-sort{border:0!important;background:transparent!important;color:inherit!important;font:inherit!important;font-weight:700!important;text-align:inherit;padding:3px!important;cursor:pointer;white-space:normal}.table-sort:focus-visible{outline:3px solid #3377bb;outline-offset:3px}.delta-positive{color:#126c48!important;background:#e6f4eb!important}.delta-negative{color:#a42a36!important;background:#fdeceb!important}.delta-neutral{color:#52657b!important;background:#f0f3f6!important}';
    document.head.append(style);enhanceTables();
    const observer = new MutationObserver(() => {
      observer.disconnect();enhanceTables();observer.observe(document.body, {childList: true, subtree: true});
    });
    observer.observe(document.body, {childList: true, subtree: true});
  }
  window.BudgetDisplay = {amount, peso: amount, delta, deltaClass, cell, compare, enhanceTables, register, clear, sortState};
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);else start();
})();
