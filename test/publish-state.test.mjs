import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const validator = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../tooling/validate-publish-state.mjs');

function git(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' });
}

async function repository() {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'hexo-publish-state-'));
  git(directory, ['init', '-b', 'main']);
  git(directory, ['config', 'user.name', 'Test User']);
  git(directory, ['config', 'user.email', 'test@example.com']);
  await mkdir(path.join(directory, 'source/_posts'), { recursive: true });
  await writeFile(path.join(directory, 'README.md'), 'fixture\n');
  await writeFile(path.join(directory, 'source/_posts/first.md'), 'first\n');
  git(directory, ['add', '--', 'README.md', 'source/_posts/first.md']);
  git(directory, ['commit', '-m', 'fixture']);
  return directory;
}

function validate(cwd) {
  return spawnSync(process.execPath, [validator], { cwd, encoding: 'utf8' });
}

test('returns warning status when there are no article changes', async () => {
  const cwd = await repository();
  assert.equal(validate(cwd).status, 10);
});

test('accepts changed and new files only under source/_posts', async () => {
  const cwd = await repository();
  await writeFile(path.join(cwd, 'source/_posts/first.md'), 'changed\n');
  await writeFile(path.join(cwd, 'source/_posts/second.md'), 'second\n');
  assert.equal(validate(cwd).status, 0);
});

test('rejects unrelated working-tree changes', async () => {
  const cwd = await repository();
  await writeFile(path.join(cwd, 'README.md'), 'changed\n');
  const result = validate(cwd);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /文章目录之外/);
});

test('rejects pre-staged changes', async () => {
  const cwd = await repository();
  await writeFile(path.join(cwd, 'source/_posts/first.md'), 'changed\n');
  git(cwd, ['add', '--', 'source/_posts/first.md']);
  const result = validate(cwd);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /已暂存改动/);
});
