import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('../utils/keep-alive.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
const exports = {};
runInNewContext(compiled.outputText, { exports, URL });

test('server keep-alive rules default to 60 minutes and deduplicate normalized addresses', () => {
  const rules = exports.parse_keep_alive('# comment\n\n https://example.com/path#fragment | 5\nhttps://other.example\nhttps://example.com/path|10');
  assert.equal(rules.length, 2);
  assert.equal(rules[0].url, 'https://example.com/path');
  assert.equal(rules[0].interval, 10);
  assert.equal(rules[1].interval, 60);
});

test('server keep-alive rejects invalid intervals, schemes and embedded credentials', () => {
  for (const text of ['javascript:alert(1)', 'https://example.com|0', 'https://example.com|NaN', 'https://example.com|1.5', 'https://example.com|10081', 'https://user:password@example.com']) {
    assert.throws(() => exports.parse_keep_alive(text));
  }
});
