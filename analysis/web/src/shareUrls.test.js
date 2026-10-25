import assert from 'node:assert/strict';
import test from 'node:test';
import { currentShareUrl, highlightShareUrl } from './shareUrls.js';

const app = 'https://csiiiv.github.io/DPWH-NEP-HB-2027-ANALYSIS/app/';
test('highlight share URL uses a server-visible path', () => {
  assert.equal(
    highlightShareUrl('regional-gains', app + '#highlights'),
    app + 'share/regional-gains/'
  );
});
test('highlight hash links get share-preview URLs', () => {
  assert.equal(
    currentShareUrl(app + '#highlights?story=regional-gains'),
    app + 'share/regional-gains/'
  );
});
test('other hash routes and unselected highlights retain their existing URLs', () => {
  for (const href of [app + '#highlights', app + '#compare?view=projects', app + '#fmr/map']) {
    assert.equal(currentShareUrl(href), href);
  }
});
test('invalid story identifiers cannot become share paths', () => {
  assert.throws(() => highlightShareUrl('../index.html', app), /Invalid highlight story identifier/);
});
