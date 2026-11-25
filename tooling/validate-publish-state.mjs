import { execFileSync } from 'node:child_process';

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8' });
}

const branch = git(['branch', '--show-current']).trim();
if (branch !== 'main') throw new Error(`当前分支是 ${branch || '(detached)'}，必须位于 main。`);

const staged = git(['diff', '--cached', '--name-only', '-z']);
if (staged) throw new Error('检测到已暂存改动。请先处理暂存区，再使用一键发布。');

const status = git(['status', '--porcelain=v1', '--untracked-files=all', '--', 'source/_posts']);
if (!status) process.exitCode = 10;
