import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PIN_PATH,
  assertOverlayAllowed,
  mapLegacyPath,
  rewriteLegacyText
} from '../tooling/lib/legacy.mjs';

test('maps frozen assets under legacy-assets', () => {
  assert.equal(mapLegacyPath('css/main.css'), 'legacy-assets/css/main.css');
  assert.equal(mapLegacyPath('images/logo.png'), 'legacy-assets/images/logo.png');
  assert.equal(mapLegacyPath('archives/c895e024.html'), 'archives/c895e024.html');
});

test('rewrites old asset roots and stale canonical domain', () => {
  const input = '<link href="/css/main.css"><img src="/images/logo.png"><link rel="canonical" href="https://www.sissioy.com/archives/a.html">';
  const output = rewriteLegacyText(input);
  assert.match(output, /\/legacy-assets\/css\/main\.css/);
  assert.match(output, /\/legacy-assets\/images\/logo\.png/);
  assert.match(output, /https:\/\/www\.sissioy\.top\/archives\/a\.html/);
  assert.doesNotMatch(output, /sissioy\.com/);
});

test('allows only the pinned legacy article to be replaced', () => {
  assert.doesNotThrow(() => assertOverlayAllowed(PIN_PATH));
  assert.throws(() => assertOverlayAllowed('archives/c895e024.html'), /may not overwrite/);
});

test('allows index and taxonomy overlay order', () => {
  for (const file of ['index.html', 'archives/index.html', 'archives/2026/08/index.html', 'tags/Hexo/index.html']) {
    assert.doesNotThrow(() => assertOverlayAllowed(file));
  }
});
