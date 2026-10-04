import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('../utils/curl.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } });
const exports = {};
runInNewContext(compiled.outputText, { exports, URL });

function arguments_for(command) {
  const result = spawnSync('/bin/sh', ['-s'], { input: 'curl() { printf "%s\\0" "$@"; }\n' + command + '\n', encoding: 'utf8', timeout: 5000 });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.split('\0').slice(0, -1);
}

test('HTTPS curl disables certificate checks and sends edited Cookie values', () => {
  const args = arguments_for(exports.page_curl('https://example.com/account?q=1&x=2#fragment', [{ name: 'session', value: 'edited' }, { name: 'csrf', value: 'token' }]));
  assert.deepEqual(args, ['--include', '--compressed', '-k', '--url', 'https://example.com/account?q=1&x=2', '--header', 'Cookie: session=edited; csrf=token']);
});

test('HTTP curl does not include -k and works without cookies', () => {
  assert.deepEqual(arguments_for(exports.page_curl('http://example.com/', [])), ['--include', '--compressed', '--url', 'http://example.com/']);
  assert.throws(() => exports.page_curl('file:///etc/passwd', []));
});

test('shell metacharacters in URLs and Cookie values remain literal arguments', () => {
  const value = "a'$(printf INJECTED)`printf INJECTED`; $HOME\\tail";
  const url = "https://example.com/path?q='$(printf INJECTED)&x=2";
  const args = arguments_for(exports.page_curl(url, [{ name: 'session', value }]));
  assert.equal(args[args.indexOf('--url') + 1], new URL(url).href);
  assert.equal(args[args.indexOf('--header') + 1], `Cookie: session=${value}`);
});
