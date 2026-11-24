import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, chmod } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

test('any failed privacy check stops publication before build, commit, or push', async () => {
  const source = await readFile(new URL('../tooling/publish-posts.sh', import.meta.url), 'utf8');
  for (const exitCode of [1, 2, 12]) {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'hexo-publish-gate-'));
    const bin = path.join(directory, 'bin');
    await mkdir(bin);
    const trace = path.join(directory, 'trace');
    for (const [name, body] of Object.entries({
      node: 'exit 0',
      git: 'case "$1" in fetch) exit 0;; rev-parse) echo fixture;; *) exit 90;; esac',
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
    assert.doesNotMatch(commands, /npm run ci|git add|git commit|git push/);
  }
});
