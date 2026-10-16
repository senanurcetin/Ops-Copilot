import test from 'node:test';
import assert from 'node:assert/strict';
import { splitFirstLiteralHighlight } from '../src/lib/highlight-text';

test('highlights one literal quote even if it contains regex metacharacters', () => {
  for (const quote of ['PID (P+I)', 'a[b]', '16#800D', 'motor.*fault', '\\', '(?i)']) {
    const text = 'Start ' + quote + ' and ' + quote + ' end';
    const parts = splitFirstLiteralHighlight(text, quote);
    assert.equal(parts.filter(part => part.highlighted).length, 1);
    assert.equal(parts.find(part => part.highlighted)?.text, quote);
    assert.equal(parts.map(part => part.text).join(''), text);
  }
});

test('matches text case-insensitively without modifying quote source content', () => {
  assert.deepEqual(splitFirstLiteralHighlight('ALARM 16#800D detected', 'alarm 16#800d'), [
    { text: 'ALARM 16#800D', highlighted: true },
    { text: ' detected', highlighted: false },
  ]);
});

test('does not mark unsupported or empty quotes and never alters the text', () => {
  const text = 'Check motor (P+I) before resetting.';
  assert.deepEqual(splitFirstLiteralHighlight(text, 'not present'), [{ text, highlighted: false }]);
  assert.deepEqual(splitFirstLiteralHighlight(text, null), [{ text, highlighted: false }]);
  assert.deepEqual(splitFirstLiteralHighlight(text, ''), [{ text, highlighted: false }]);
});


test('preserves source offsets when Turkish dotted capitals expand during lowercase', () => {
  const text = 'İkaz lambası — PANEL (P+I) arızası';
  const parts = splitFirstLiteralHighlight(text, 'PANEL (P+I)');
  assert.equal(parts.find(part => part.highlighted)?.text, 'PANEL (P+I)');
  assert.equal(parts.map(part => part.text).join(''), text);
});
