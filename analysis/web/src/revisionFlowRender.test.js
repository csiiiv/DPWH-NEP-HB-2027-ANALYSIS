import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createServer} from 'vite';
import {inventoryFlow} from './revisionFlowExample.js';
import {buildRevisionFlow} from './revisionFlow.js';

test('shared renderer accepts a second domain and multiple figures without budget vocabulary or duplicate IDs', async () => {
  const server = await createServer({root: new URL('..', import.meta.url).pathname,
    cacheDir: new URL(`../node_modules/.vite-tests/${process.pid}`, import.meta.url).pathname,
    server: {middlewareMode: true, hmr: false}, optimizeDeps: {noDiscovery: true, include: []}, appType: 'custom'});
  try {
    const {default: Diagram} = await server.ssrLoadModule('/src/RevisionFlowDiagram.jsx');
    const model = inventoryFlow();
    const html = renderToStaticMarkup(React.createElement(React.Fragment, null,
      React.createElement(Diagram, {model, formatValue: n => `${n} items`, metadata: {unit: 'items'}}),
      React.createElement(Diagram, {model: inventoryFlow('department')})));
    assert.match(html, /Opening stock/);
    assert.match(html, /Closing stock/);
    assert.match(html, /Removed items/);
    assert.match(html, /100 items/);
    assert.match(html, /&quot;unit&quot;:&quot;items&quot;/);
    assert.doesNotMatch(html, /NEP|HGAB|PHP|DPWH|House|₱|comparison rows/);
    const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
    assert.ok(ids.length >= 6);
    assert.equal(new Set(ids).size, ids.length);
    for (const match of html.matchAll(/aria-labelledby="([^"]+)"/g)) {
      for (const id of match[1].split(' ')) assert.ok(ids.includes(id), `missing accessible label ${id}`);
    }
  } finally {await server.close();}
});

test('scope-review deficits render a terminal node and surpluses retain unbooked labels', async () => {
  const server = await createServer({root: new URL('..', import.meta.url).pathname,
    cacheDir: new URL(`../node_modules/.vite-tests/${process.pid}`, import.meta.url).pathname,
    server: {middlewareMode: true, hmr: false}, optimizeDeps: {noDiscovery: true, include: []}, appType: 'custom'});
  try {
    const {default: Diagram} = await server.ssrLoadModule('/src/RevisionFlowDiagram.jsx');
    const flow = after => buildRevisionFlow({groups: [{id: 'review', label: 'Review',
      cells: [{key: 'scope_review', before: 100, after, count: 1}]}],
      expected: {before: 100, after, count: 1}});
    const deficit = flow(80);
    const html = renderToStaticMarkup(React.createElement(Diagram, {model: deficit}));
    assert.match(html, /class="bf-scope-sink"/);
    assert.match(html, /data-node="scope-review-deficit"[^>]*data-value="20"/);
    for (const node of deficit.graph.nodes.filter(node => node.role === 'scopeLoss')) {
      const attributeKey = node.key.replaceAll('&', '&amp;').replaceAll('"', '&quot;');
      assert.ok(html.includes(`data-node-key="${attributeKey}"`), 'the deficit ribbon must end at a drawn node');
    }
    const surplus = renderToStaticMarkup(React.createElement(Diagram, {model: flow(120)}));
    assert.match(surplus, /Unbooked scope-review surplus/);
    assert.doesNotMatch(surplus, /gross increase only/);
  } finally {await server.close();}
});
