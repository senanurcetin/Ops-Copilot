import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const asset = (name: string) => readFileSync(new URL('../public/' + name, import.meta.url), 'utf8');

test('official local NEXUS marks retain vector gradient and no executable markup', () => {
  for (const name of ['nexus-x.svg', 'nexus-wordmark.svg']) {
    const svg = asset(name);
    assert.match(svg, /^<svg /);
    assert.match(svg, /#00E0FF/);
    assert.match(svg, /#6E55C6/);
    assert.doesNotMatch(svg, /<script|<foreignObject|onload=/i);
  }
});
