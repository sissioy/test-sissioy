import { execFileSync } from 'node:child_process';

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8' });
}

const branch = git(['branch', '--show-current']).trim();
if (branch !== 'main') throw new Error(`当前分支是 ${branch || '(detached)'}，必须位于 main。`);

const staged = git(['diff', '--cached', '--name-only', '-z']);
if (staged) throw new Error('检测到已暂存改动。请先处理暂存区，再使用一键发布。');

const status = git(['status', '--porcelain=v1', '--untracked-files=all', '-z']);
const records = status ? status.split('\0').filter(Boolean) : [];
const outsidePosts = [];
for (let index = 0; index < records.length; index += 1) {
  const record = records[index];
  const code = record.slice(0, 2);
  const file = record.slice(3);
  if (code.includes('R') || code.includes('C')) index += 1;
  if (!file.startsWith('source/_posts/')) outsidePosts.push(file);
}

if (outsidePosts.length) {
  throw new Error(`检测到文章目录之外的改动：\n${outsidePosts.join('\n')}`);
}

if (!records.length) process.exitCode = 10;
