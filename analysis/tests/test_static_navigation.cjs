const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../../_site');
const routes = {
  'hb_native_verification.html': 'house', 'nep_source_verification.html': 'nep',
  'dpwh_nep_api_verification.html': 'transparency', 'stage_trace_2027.html': 'compare',
  'source_comparison_2027.html': 'house-nep', 'nep_2027_tree.html': 'nep-detail',
};
function redirected(file, hash) {
  const html = fs.readFileSync(path.join(root, file), 'utf8');
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  let destination;
  vm.runInNewContext(script, {location: {hash, replace: value => destination = value}});
  return new URL(destination, 'https://example.test/project/' + file);
}
test('root preserves SPA routes under the GitHub project prefix', () => {
  assert.equal(redirected('index.html', '').href, 'https://example.test/project/app/#home');
  assert.equal(redirected('index.html', '#nep?view=review').href,
    'https://example.test/project/app/#nep?view=review');
  assert.ok(fs.existsSync(path.join(root, 'app/index.html')));
});
test('all six old viewer URLs resolve to the corresponding SPA route', () => {
  for (const [name, route] of Object.entries(routes)) {
    assert.equal(redirected('analysis/viewers/' + name, '').href, 'https://example.test/project/app/#' + route);
    assert.equal(redirected('analysis/' + name, '').href, 'https://example.test/project/app/#' + route);
    assert.equal(redirected('analysis/' + name, '#review').hash, '#' + route + '?view=review');
    assert.equal(redirected('analysis/' + name, '#paps').hash, '#' + route + '?section=paps');
  }
});
test('verification route payloads retain canonical audit results', () => {
  for (const key of ['hb', 'nep', 'dpwh_nep_api']) {
    const data = JSON.parse(fs.readFileSync(path.join(root, 'analysis/verification_' + key + '.json')));
    assert.equal(data.key, key);
    assert.deepEqual(data.audit.failures, []);
    assert.ok(data.nodes.length > 0);
    assert.ok(data.nodes.some(n => n.id === data.root));
  }
});
