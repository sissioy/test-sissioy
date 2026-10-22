import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  stat,
  utimes,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  LmStudioReviewer,
  ModelCheckError,
  parseChatCompletion,
  runRedaction,
} from '../tooling/redact-sensitive.mjs';
import {
  applyFindings,
  chunkMarkdown,
  dedupeFindings,
  findRuleCandidates,
  isPublicIpv4,
  isPublicIpv6,
  validateModelFindings,
} from '../tooling/lib/redaction.mjs';

function git(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' });
}

async function repository() {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'hexo-redaction-'));
  git(directory, ['init', '-b', 'main']);
  git(directory, ['config', 'user.name', 'Test User']);
  git(directory, ['config', 'user.email', 'test@example.com']);
  await mkdir(path.join(directory, 'source/_posts'), { recursive: true });
  await writeFile(path.join(directory, 'source/_posts/existing.md'), 'existing\n');
  git(directory, ['add', '--', 'source/_posts/existing.md']);
  git(directory, ['commit', '-m', 'fixture']);
  return directory;
}

function successfulReviewer(extraLiteral = null, category = 'email') {
  return {
    async start() {},
    async review(content) {
      return {
        findings: extraLiteral && content.includes(extraLiteral)
          ? [{ literal: extraLiteral, category }]
          : [],
      };
    },
    async close() {},
  };
}

test('classifies globally routable and non-public IPv4 addresses', () => {
  assert.equal(isPublicIpv4('8.8.8.8'), true);
  assert.equal(isPublicIpv4('1.1.1.1'), true);
  for (const address of [
    '10.0.0.1',
    '100.64.0.1',
    '127.0.0.1',
    '169.254.1.1',
    '172.16.0.1',
    '192.168.1.1',
    '192.0.2.1',
    '198.51.100.1',
    '203.0.113.1',
    '999.1.1.1',
  ]) assert.equal(isPublicIpv4(address), false, address);
});

test('classifies public and local or documentation IPv6 addresses', () => {
  assert.equal(isPublicIpv6('2001:4860:4860::8888'), true);
  for (const address of ['::1', 'fd00::1', 'fe80::1', 'ff02::1', '2001:db8::1']) {
    assert.equal(isPublicIpv6(address), false, address);
  }
});

test('finds deterministic sensitive formats and respects allowlists', () => {
  const privateKey = [
    '-----BEGIN PRIVATE KEY-----',
    'c2VjcmV0',
    '-----END PRIVATE KEY-----',
  ].join('\n');
  const content = [
    'IP 8.8.8.8 and local 192.168.1.2',
    'UUID 550e8400-e29b-41d4-a716-446655440000',
    'Path `/Users/alice/My Project/秘密.txt`',
    'Windows "C:\\Users\\alice\\My Project\\notes.txt"',
    'Authorization: Bearer abcdefghijklmnop',
    'password=supersecret',
    'https://alice:secret@example.com',
    privateKey,
    'Already your-ip-address your-uuid /path/to/file xxx',
  ].join('\n');
  const allowlist = new Set(['8.8.8.8']);
  const findings = findRuleCandidates(content, allowlist);
  const literals = new Set(findings.map((item) => item.literal));

  assert.equal(literals.has('8.8.8.8'), false);
  assert.equal(literals.has('192.168.1.2'), false);
  assert.equal(literals.has('550e8400-e29b-41d4-a716-446655440000'), true);
  assert.equal(literals.has('/Users/alice/My Project/秘密.txt'), true);
  assert.equal(literals.has('C:\\Users\\alice\\My Project\\notes.txt'), true);
  assert.equal(literals.has('abcdefghijklmnop'), true);
  assert.equal(literals.has('supersecret'), true);
  assert.equal(literals.has('alice:secret'), true);
  assert.equal(literals.has(privateKey), true);
});

test('applies fixed replacements and is idempotent', () => {
  const content = '8.8.8.8 550e8400-e29b-41d4-a716-446655440000 /Users/alice/a.txt';
  const once = applyFindings(content, findRuleCandidates(content));
  assert.equal(once, 'your-ip-address your-uuid /path/to/file');
  assert.deepEqual(findRuleCandidates(once), []);
  assert.equal(applyFindings(once, findRuleCandidates(once)), once);
});

test('deterministic literals take precedence over overlapping model findings', () => {
  const content = 'Server address: 8.8.8.8';
  const findings = dedupeFindings([
    ...findRuleCandidates(content),
    ...validateModelFindings(content, {
      findings: [{ literal: 'Server address: 8.8.8.8', category: 'other_sensitive_identifier' }],
    }),
  ]);
  assert.equal(applyFindings(content, findings), 'Server address: your-ip-address');
});

test('validates model findings without exposing arbitrary model replacements', () => {
  const content = 'Contact alice@example.com on the private system.';
  const findings = validateModelFindings(content, {
    findings: [{ literal: 'alice@example.com', category: 'email' }],
  });
  assert.equal(findings[0].replacement, 'your-email-address');
  assert.throws(
    () => validateModelFindings(content, {
      findings: [{ literal: 'alice@example.com', category: 'email', replacement: 'attacker text' }],
    }),
    /未知字段/,
  );
  assert.throws(
    () => validateModelFindings(content, { findings: [{ literal: 'missing', category: 'email' }] }),
    /不存在于原文/,
  );
  assert.throws(
    () => validateModelFindings(content, { findings: [{ literal: 'alice@example.com', category: 'unknown' }] }),
    /未知 category/,
  );
  assert.throws(() => validateModelFindings(content, { nope: [] }), /findings/);
});

test('parses structured chat completions and rejects invalid output', () => {
  assert.deepEqual(parseChatCompletion({
    choices: [{ message: { content: '{"findings":[]}' } }],
  }), { findings: [] });
  assert.deepEqual(parseChatCompletion({
    choices: [{ message: { content: '', reasoning_content: '{"findings":[]}' } }],
  }), { findings: [] });
  assert.throws(
    () => parseChatCompletion({ choices: [{ message: { content: '{' } }] }),
    ModelCheckError,
  );
  assert.throws(() => parseChatCompletion({ choices: [] }), ModelCheckError);
});

test('chunks long Markdown without changing its content', () => {
  const content = `${'a'.repeat(7_000)}\n\n${'b'.repeat(7_000)}`;
  const chunks = chunkMarkdown(content, 8_000);
  assert.equal(chunks.length, 2);
  assert.equal(chunks.join(''), content);
});

test('redacts only new posts and creates private recoverable backups', async () => {
  const cwd = await repository();
  const appSupportDir = path.join(cwd, 'app-support');
  const newPost = 'IP 8.8.8.8\nUUID 550e8400-e29b-41d4-a716-446655440000\nEmail alice@example.com\n';
  await writeFile(path.join(cwd, 'source/_posts/new.md'), newPost);
  await writeFile(path.join(cwd, 'source/_posts/existing.md'), 'modified 8.8.4.4\n');
  const logs = [];

  const result = await runRedaction({
    cwd,
    scope: 'new',
    write: true,
    failOpen: true,
    reviewer: successfulReviewer('alice@example.com'),
    appSupportDir,
    now: new Date('2026-08-14T00:00:00Z'),
    log: (message) => logs.push(message),
  });

  assert.deepEqual(result, { status: 'checked', files: 1, findings: 3, changed: 1 });
  assert.equal(
    await readFile(path.join(cwd, 'source/_posts/new.md'), 'utf8'),
    'IP your-ip-address\nUUID your-uuid\nEmail your-email-address\n',
  );
  assert.equal(await readFile(path.join(cwd, 'source/_posts/existing.md'), 'utf8'), 'modified 8.8.4.4\n');

  const backupRoot = path.join(appSupportDir, 'RedactionBackups');
  const backupDirectories = await readdir(backupRoot);
  assert.equal(backupDirectories.length, 1);
  const backupDirectory = path.join(backupRoot, backupDirectories[0]);
  assert.equal((await stat(backupRoot)).mode & 0o777, 0o700);
  assert.equal((await stat(backupDirectory)).mode & 0o777, 0o700);
  const backupFile = path.join(backupDirectory, 'source/_posts/new.md');
  assert.equal((await stat(backupFile)).mode & 0o777, 0o600);
  assert.equal(await readFile(backupFile, 'utf8'), newPost);
  assert.doesNotMatch(logs.join('\n'), /8\.8\.8\.8|alice@example\.com|550e8400/);
});

test('model failure skips every rule replacement and creates no backup', async () => {
  const cwd = await repository();
  const appSupportDir = path.join(cwd, 'app-support');
  const original = 'IP 8.8.8.8 and UUID 550e8400-e29b-41d4-a716-446655440000\n';
  await writeFile(path.join(cwd, 'source/_posts/new.md'), original);
  const reviewer = {
    async start() {},
    async review() { throw new Error('offline'); },
    async close() {},
  };

  const result = await runRedaction({
    cwd,
    scope: 'new',
    write: true,
    failOpen: true,
    reviewer,
    appSupportDir,
    log: () => {},
  });

  assert.equal(result.status, 'skipped');
  assert.equal(await readFile(path.join(cwd, 'source/_posts/new.md'), 'utf8'), original);
  await assert.rejects(access(path.join(appSupportDir, 'RedactionBackups')), /ENOENT/);
});

test('one failed article skips the whole multi-article transaction', async () => {
  const cwd = await repository();
  const first = 'first 8.8.8.8\n';
  const second = 'second 1.1.1.1\n';
  await writeFile(path.join(cwd, 'source/_posts/first.md'), first);
  await writeFile(path.join(cwd, 'source/_posts/second.md'), second);
  let calls = 0;
  const reviewer = {
    async start() {},
    async review() {
      calls += 1;
      if (calls === 2) throw new Error('timeout');
      return { findings: [] };
    },
    async close() {},
  };

  const result = await runRedaction({
    cwd,
    scope: 'new',
    write: true,
    failOpen: true,
    reviewer,
    appSupportDir: path.join(cwd, 'app-support'),
    log: () => {},
  });
  assert.equal(result.status, 'skipped');
  assert.equal(await readFile(path.join(cwd, 'source/_posts/first.md'), 'utf8'), first);
  assert.equal(await readFile(path.join(cwd, 'source/_posts/second.md'), 'utf8'), second);
});

test('audit fails instead of returning an incomplete report when the model fails', async () => {
  const cwd = await repository();
  const reviewer = {
    async start() { throw new Error('not available'); },
    async close() {},
  };
  await assert.rejects(
    runRedaction({
      cwd,
      scope: 'all',
      write: false,
      failOpen: false,
      reviewer,
      appSupportDir: path.join(cwd, 'app-support'),
      log: () => {},
    }),
    ModelCheckError,
  );
});

test('removes backup directories older than 30 days during a successful write', async () => {
  const cwd = await repository();
  const appSupportDir = path.join(cwd, 'app-support');
  const backupRoot = path.join(appSupportDir, 'RedactionBackups');
  const oldBackup = path.join(backupRoot, 'old');
  await mkdir(oldBackup, { recursive: true });
  const oldTime = new Date('2026-07-01T00:00:00Z');
  await utimes(oldBackup, oldTime, oldTime);
  await writeFile(path.join(cwd, 'source/_posts/new.md'), '8.8.8.8\n');

  await runRedaction({
    cwd,
    scope: 'new',
    write: true,
    failOpen: true,
    reviewer: successfulReviewer(),
    appSupportDir,
    now: new Date('2026-08-14T00:00:00Z'),
    log: () => {},
  });
  await assert.rejects(access(oldBackup), /ENOENT/);
});

test('LM Studio reviewer starts and cleans up only resources it created', async () => {
  const commands = [];
  const command = async (_file, args) => {
    commands.push(args);
    if (args[0] === 'server' && args[1] === 'status') {
      return { stdout: '{"running":false,"port":1234}' };
    }
    if (args[0] === 'ps') return { stdout: '[]' };
    return { stdout: '' };
  };
  const requests = [];
  const fetchImpl = async (_url, options) => {
    requests.push(JSON.parse(options.body));
    return {
      ok: true,
      async json() {
        return { choices: [{ message: { content: '{"findings":[]}' } }] };
      },
    };
  };
  const reviewer = new LmStudioReviewer({ command, fetchImpl });
  await reviewer.start();
  assert.deepEqual(await reviewer.review('safe', { file: 'new.md', chunkIndex: 0, chunkCount: 1 }), {
    findings: [],
  });
  await reviewer.close();

  assert.equal(requests[0].response_format.type, 'json_schema');
  assert.equal(commands.some((args) => args[0] === 'load'), true);
  assert.equal(commands.some((args) => args[0] === 'unload' && args[1] === 'hexo-sensitive-redactor'), true);
  assert.equal(commands.some((args) => args[0] === 'server' && args[1] === 'stop'), true);
});
