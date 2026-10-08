const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../../_site');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const base = new URL('https://example.test/DPWH-NEP-HB-2027-ANALYSIS/');

function renderedSourceLinks(markup) {
  const data = markup.match(/<script id="indexData" type="application\/json">([\s\S]*?)<\/script>/)[1];
  const script = [...markup.matchAll(/<script>([\s\S]*?)<\/script>/g)].at(-1)[1];
  const elements = {indexData: {textContent: data}, sources: {}, checks: {}};
  vm.runInNewContext(script, {document: {getElementById: id => elements[id]}});
  return [...elements.sources.innerHTML.matchAll(/href="([^"]+)"/g)].map(match => match[1]);
}
function assertHostedTarget(href) {
  const url = new URL(href, base);
  assert.equal(url.origin, base.origin);
  assert.ok(url.pathname.startsWith(base.pathname), `Lost project base: ${href}`);
  assert.ok(!/\$\{|%24%7B/i.test(url.pathname), `Unexpanded URL: ${href}`);
  const target = path.join(root, decodeURIComponent(url.pathname.slice(base.pathname.length)));
  assert.ok(fs.existsSync(target), `Missing hosted target: ${href}`);
}

test('rendered source cards and review entry resolve under the GitHub project base', () => {
  const links = renderedSourceLinks(html);
  assert.deepEqual(links, [
    'analysis/hb_native_verification.html',
    'analysis/nep_source_verification.html',
    'analysis/nep_source_verification.html#review',
    'analysis/dpwh_nep_api_verification.html',
  ]);
  links.forEach(assertHostedTarget);
});

test('encoded template regression is rejected after rendering', () => {
  const corrupted = html.replaceAll('${s.page}', '%24%7Bs.page%7D');
  assert.throws(() => renderedSourceLinks(corrupted).forEach(assertHostedTarget), /Unexpanded URL/);
});

test('sortable comparison and current detail pages are visible outside archive disclosure', () => {
  const section = html.match(/<section id="comparisons">([\s\S]*?)<\/section>/)[1];
  assert.ok(html.indexOf('<section id="comparisons">') < html.indexOf('<details>'));
  const links = [...section.matchAll(/href="([^"]+)"/g)].map(match => match[1]);
  assert.deepEqual(links, ['analysis/stage_trace_2027.html', 'analysis/source_comparison_2027.html', 'analysis/nep_2027_tree.html']);
  links.forEach(assertHostedTarget);
  assert.match(section, /delta, or percent change/);
});
