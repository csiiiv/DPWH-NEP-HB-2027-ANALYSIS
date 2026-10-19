import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createServer} from 'vite';
import {inventoryFlow} from './revisionFlowExample.js';

test('shared renderer accepts a second domain and multiple figures without budget vocabulary or duplicate IDs', async () => {
  const server = await createServer({root: new URL('..', import.meta.url).pathname, server: {middlewareMode: true}, appType: 'custom'});
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
