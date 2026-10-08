/* Headless smoke test for hb_source_tree_viewer.js using a minimal DOM shim. */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const dir = __dirname;
const viewers = path.join(dir, '..', 'viewers');
const data = path.join(dir, '..', 'data');
const template = fs.readFileSync(path.join(viewers, 'hb_source_tree_viewer.template.html'), 'utf8');
const treeData = JSON.parse(fs.readFileSync(path.join(data, 'hb_2027_source_tree.json'), 'utf8'));
const html = template.replace('__HB_TREE_DATA__', JSON.stringify(treeData).replace(/</g, '\\u003c'));

const elements = {};
function makeEl(id) {
    return elements[id] || (elements[id] = {
        id, innerHTML: '', textContent: '', value: '', hidden: false, checked: false,
        listeners: {}, dataset: {}, tabIndex: -1, focus() {},
        addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); },
        querySelectorAll() { return []; },
        options: [{ textContent: '' }],
    });
}
['tree', 'details', 'cards', 'searchStatus', 'filter', 'search', 'more', 'collapse', 'download']
    .forEach(makeEl);
const document = {
    getElementById: makeEl,
    activeElement: null,
    head: { append() {} },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    addEventListener() {},
    createElement() { return { click() {}, set href(v) {}, set download(v) {} }; },
    createObjectURL: () => 'blob:x',
    revokeObjectURL() {},
};
const m = html.match(/<script id="treeData" type="application\/json">([\s\S]*?)<\/script>/);
if (!m) throw new Error('treeData script missing');
makeEl('treeData').textContent = m[1];

const sandbox = { document, console, URL, setTimeout, clearTimeout, MutationObserver: class { observe() {} disconnect() {} } };
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(dir, '..', '..', 'viewers', 'budget_display.js'), 'utf8'), sandbox);
vm.runInContext(fs.readFileSync(path.join(viewers, 'hb_source_tree_viewer.js'), 'utf8'), sandbox);

function assert(cond, msg) { if (!cond) { console.error('FAIL:', msg); process.exit(1); } }

assert(elements['cards'].innerHTML.includes('₱654.102B'), 'grand total card renders');
assert(elements['cards'].innerHTML.includes('399 offices'), 'attached subtotals card renders');
assert(elements['details'].innerHTML.includes('new appropriations'), 'root details render');
assert(elements['tree'].innerHTML.includes('Operations (VOL I-C details)'), 'tree renders Operations section');
assert(elements['tree'].innerHTML.includes('Support to Operations'), 'tree renders S2O');

// mismatch filter
elements['filter'].value = 'mismatch';
elements['filter'].listeners['change'].forEach(fn => fn());
assert(elements['searchStatus'].textContent.includes('matching nodes'), 'mismatch filter counts');
assert(elements['tree'].innerHTML.includes('Water Supply System'), 'mismatched PAP visible');

// printed controls filter
elements['filter'].value = 'printed';
elements['filter'].listeners['change'].forEach(fn => fn());
assert(elements['tree'].innerHTML.includes('Balances'), 'printed filter shows controls');

console.log('source tree viewer smoke test OK');
