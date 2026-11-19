import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { creditLine } from '../src/format.ts';

const CLI = fileURLToPath(new URL('../src/cli.ts', import.meta.url));
const CREDIT = 'tells by Nexugen · tells.nexugen.app';

function draft() {
  const dir = mkdtempSync(join(tmpdir(), 'tells-credit-'));
  const file = join(dir, 'draft.md');
  writeFileSync(file, 'Great question! We leverage robust tooling.\n');
  return file;
}

test('the credit line shows only for text output at a terminal, dim when colour is on', () => {
  assert.equal(creditLine({ format: 'text', tty: true }), CREDIT);
  assert.equal(creditLine({ format: 'text', tty: true, color: true }), `\x1b[2m${CREDIT}\x1b[0m`);
  assert.equal(creditLine({ format: 'text', tty: false }), null);
  assert.equal(creditLine({ format: 'text', tty: true, quiet: true }), null);
  assert.equal(creditLine({ format: 'json', tty: true }), null);
  assert.equal(creditLine({ format: 'github', tty: true }), null);
});

test('piped lint output has no credit line', () => {
  const file = draft();
  for (const args of [[], ['--format', 'json'], ['--format', 'github'], ['--quiet']]) {
    const out = execFileSync(process.execPath, ['--experimental-strip-types', '--no-warnings', CLI, 'lint', file, ...args], { encoding: 'utf8' });
    assert.ok(!out.includes('tells.nexugen.app'), `no credit with ${args.join(' ') || 'defaults'}`);
  }
});

const hasScript = process.platform === 'linux' && spawnSync('script', ['--version']).status === 0;

test('lint at a real terminal ends with the credit line, and --quiet or json leave it out', { skip: !hasScript && 'needs util-linux script for a pseudo-terminal' }, () => {
  const file = draft();
  const run = (extra: string) => {
    const cmd = `${JSON.stringify(process.execPath)} --experimental-strip-types --no-warnings ${JSON.stringify(CLI)} lint ${JSON.stringify(file)} ${extra}`;
    return execFileSync('script', ['-qec', cmd, '/dev/null'], { encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } });
  };
  const lines = run('').trim().split(/\r?\n/);
  assert.equal(lines.at(-1), CREDIT);
  assert.equal(lines.filter((l) => l.includes(CREDIT)).length, 1);
  assert.ok(!run('--quiet').includes(CREDIT));
  assert.ok(!run('--format json').includes(CREDIT));
});

test('voice build, show and match work offline', () => {
  const dir = mkdtempSync(join(tmpdir(), 'tells-voice-cli-'));
  const samples = join(dir, 'samples.txt');
  writeFileSync(samples, Array.from({ length: 30 }, (_, i) => `okay so note ${i + 1}. the build finished but the logo is still wrong, can you fix that? i think its the old file`).join('\n---\n'));
  const out = join(dir, 'voice.json');
  spawnSync(process.execPath, ['--experimental-strip-types', CLI, 'voice', 'build', samples, '-o', out], { encoding: 'utf8' });
  const shown = execFileSync(process.execPath, ['--experimental-strip-types', CLI, 'voice', 'show', out], { encoding: 'utf8' });
  assert.match(shown, /30 samples/);
  const text = join(dir, 'text.txt');
  writeFileSync(text, 'okay the logo is fixed. can you check it? i think its the right file now');
  const matched = execFileSync(process.execPath, ['--experimental-strip-types', CLI, 'voice', 'match', out, text], { encoding: 'utf8' });
  assert.match(matched, /style match \d+\/100/);
});
