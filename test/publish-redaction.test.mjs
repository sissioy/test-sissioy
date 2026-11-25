import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, chmod, unlink } from 'node:fs/promises';
import { execFileSync, spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

test('any failed privacy check stops publication before build, commit, or push', async () => {
  const source = await readFile(new URL('../tooling/publish-posts.sh', import.meta.url), 'utf8');
  for (const exitCode of [1, 2, 12]) {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'hexo-publish-gate-'));
    const bin = path.join(directory, 'bin');
    await mkdir(bin);
    const trace = path.join(directory, 'trace');
    for (const [name, body] of Object.entries({
      node: 'exit 0',
      git: 'while [ "$1" = "-c" ]; do shift 2; done\ncase "$1" in fetch) exit 0;; rev-parse) echo fixture;; *) exit 90;; esac',
      npm: 'if [ "$*" = "run redact:changed" ]; then exit "$CHECK_EXIT"; fi\nexit 91',
    })) {
      const executable = path.join(bin, name);
      await writeFile(executable, `#!/bin/sh\nprintf '%s\\n' '${name}'\" $*\" >> "$TRACE"\n${body}\n`);
      await chmod(executable, 0o755);
    }
    const script = source.replace(/^export PATH=.*$/m, `export PATH="${bin}:/usr/bin:/bin:/usr/sbin:/sbin"`)
      .replace(/^repo_dir=.*$/m, `repo_dir="${directory}"`)
      .replace(/^log_dir=.*$/m, `log_dir="${directory}/logs"`);
    const file = path.join(directory, 'publish.sh');
    await writeFile(file, script);
    const shell = process.platform === 'darwin' ? '/bin/zsh' : '/bin/bash';
    const result = spawnSync(shell, [file], {
      encoding: 'utf8', env: { ...process.env, TRACE: trace, CHECK_EXIT: String(exitCode) },
    });
    assert.equal(result.status, exitCode, result.stderr);
    const commands = await readFile(trace, 'utf8');
    assert.match(commands, /npm run redact:changed/);
    assert.doesNotMatch(commands, /npm run ci|git add|git commit|git .*push/);
  }
});

test('publishes the locally checked article tree and preserves unrelated work', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'hexo-publish-tree-'));
  const repo = path.join(directory, 'repo');
  const remote = path.join(directory, 'remote.git');
  const bin = path.join(directory, 'bin');
  const git = (...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim();
  await mkdir(bin);
  await mkdir(path.join(repo, 'source/_posts'), { recursive: true });
  await mkdir(path.join(repo, 'tooling'));
  git('init', '-b', 'main');
  git('init', '--bare', '-b', 'main', remote);
  git('config', 'user.name', 'Test User');
  git('config', 'user.email', 'test@example.com');
  const checkedConfig = path.join(repo, '_config.yml');
  const posts = path.join(repo, 'source/_posts');
  const validator = fileURLToPath(new URL('../tooling/validate-publish-state.mjs', import.meta.url));
  await writeFile(path.join(repo, 'tooling/validate-publish-state.mjs'), await readFile(validator));
  await writeFile(checkedConfig, 'committed\n');
  await writeFile(path.join(posts, 'old.md'), 'old\n');
  git('add', '.');
  git('commit', '-m', 'fixture');
  git('remote', 'add', 'origin', remote);
  git('push', '-u', 'origin', 'main');
  await writeFile(checkedConfig, 'local edit\n');
  await writeFile(path.join(repo, 'scratch.txt'), 'local file\n');
  await unlink(path.join(posts, 'old.md'));
  await writeFile(path.join(posts, 'new.md'), 'new\n');

  for (const [name, body] of Object.entries({
    npm: `case "$*" in
      'run redact:changed') test -f source/_posts/new.md ;;
      'run ci') test "$(cat _config.yml)" = committed &&
        test -f source/_posts/new.md && test ! -e source/_posts/old.md && test ! -e scratch.txt ;;
      *) exit 90 ;;
    esac`,
    gh: 'case "$2" in list) echo 123;; watch) test "$3" = 123;; *) exit 90;; esac',
    curl: 'printf \'{"commit":"%s"}\\n\' "$(git rev-parse HEAD)"'
  })) {
    const executable = path.join(bin, name);
    await writeFile(executable, `#!/bin/sh\n${body}\n`);
    await chmod(executable, 0o755);
  }
  const source = await readFile(new URL('../tooling/publish-posts.sh', import.meta.url), 'utf8');
  const script = source.replace(/^export PATH=.*$/m, `export PATH="${bin}:$PATH"`)
    .replace(/^repo_dir=.*$/m, `repo_dir="${repo}"`)
    .replace(/^log_dir=.*$/m, `log_dir="${directory}/logs"`);
  const file = path.join(directory, 'publish.sh');
  await writeFile(file, script);
  const shell = process.platform === 'darwin' ? '/bin/zsh' : '/bin/bash';
  const result = spawnSync(shell, [file], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /线上发布成功/);
  assert.equal(git('rev-parse', 'HEAD'), git('rev-parse', 'origin/main'));
  assert.equal(git('show', 'HEAD:_config.yml'), 'committed');
  assert.deepEqual(git('diff', '--name-only', 'HEAD^', 'HEAD').split('\n'), [
    'source/_posts/new.md', 'source/_posts/old.md'
  ]);
  assert.equal(git('status', '--porcelain=v1'), 'M _config.yml\n?? scratch.txt');
});
