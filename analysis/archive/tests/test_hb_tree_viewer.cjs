/* Headless smoke test for hb_tree_viewer.js using a minimal DOM shim. */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const dir = __dirname;
const viewers = path.join(dir, '..', 'viewers');
const data = path.join(dir, '..', 'data');
const template = fs.readFileSync(path.join(viewers, 'hb_tree_viewer.template.html'), 'utf8');
const treeData = JSON.parse(fs.readFileSync(path.join(data, 'hb_2027_tree.json'), 'utf8'));
const html = template.replace('__HB_TREE_DATA__', JSON.stringify(treeData).replace(/</g, '\\u003c'));

// Minimal DOM elements
const elements = {};
function makeEl(id) {
    return elements[id] || (elements[id] = {
        id, innerHTML: '', textContent: '', value: '', hidden: false, checked: false,
        listeners: {}, dataset: {}, tabIndex: -1, focus() { this.focused = true; },
        addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); },
        querySelectorAll() { return []; },
        options: [{ textContent: '' }],
    });
}
['tree', 'details', 'cards', 'searchStatus', 'view', 'filter', 'search', 'more', 'collapse', 'download']
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
vm.runInContext(fs.readFileSync(path.join(viewers, 'hb_tree_viewer.js'), 'utf8'), sandbox);

function assert(cond, msg) { if (!cond) { console.error('FAIL:', msg); process.exit(1); } }

assert(elements['cards'].innerHTML.includes('₱654.102B'), 'grand total card renders');
assert(elements['cards'].innerHTML.includes('16,148'), 'allocation count card renders');
assert(elements['details'].innerHTML.includes('House Bill 10858 new appropriations'), 'root details render');
assert(elements['details'].innerHTML.includes('Balanced PAP controls') || elements['details'].innerHTML.includes('Mismatched controls below'), 'root details show gap summary');
assert(elements['tree'].innerHTML.includes('General Administration and Support'), 'tree renders GAS');

// Program view switch
elements['view'].value = 'program';
elements['view'].listeners['change'].forEach(fn => fn());
assert(elements['tree'].innerHTML.includes('program view'), 'program view renders');

// Mismatch filter
elements['view'].value = 'zone';
elements['view'].listeners['change'].forEach(fn => fn());
elements['filter'].value = 'mismatch';
elements['filter'].listeners['change'].forEach(fn => fn());
assert(elements['searchStatus'].textContent.includes('matching nodes'), 'mismatch filter counts nodes');
assert(elements['tree'].innerHTML.includes('Water Supply System'), 'mismatched PAP visible under filter');

console.log('viewer smoke test OK');
