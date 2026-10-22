import { isIP } from 'node:net';

export const MODEL_CATEGORIES = Object.freeze([
  'ip_address',
  'uuid',
  'file_path',
  'credential',
  'email',
  'phone_number',
  'hostname',
  'account_identifier',
  'other_sensitive_identifier',
]);

export const REPLACEMENTS = Object.freeze({
  ip_address: 'your-ip-address',
  uuid: 'your-uuid',
  file_path: '/path/to/file',
  credential: 'xxx',
  email: 'your-email-address',
  phone_number: 'your-phone-number',
  hostname: 'your-hostname',
  account_identifier: 'xxx',
  other_sensitive_identifier: 'xxx',
});

const PLACEHOLDERS = new Set(Object.values(REPLACEMENTS));

function finding(literal, category, source = 'rule') {
  return { literal, category, replacement: REPLACEMENTS[category], source };
}

function isAllowlisted(literal, allowlist) {
  return allowlist.has(literal) || PLACEHOLDERS.has(literal);
}

export function isPublicIpv4(value) {
  if (isIP(value) !== 4) return false;
  const [a, b, c] = value.split('.').map(Number);

  if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 192 && b === 0 && c === 2) return false;
  if (a === 198 && (b === 18 || b === 19)) return false;
  if (a === 198 && b === 51 && c === 100) return false;
  if (a === 203 && b === 0 && c === 113) return false;
  return true;
}

export function isPublicIpv6(value) {
  const address = value.split('%', 1)[0].toLowerCase();
  if (isIP(address) !== 6) return false;
  if (address === '::' || address === '::1') return false;
  if (address.startsWith('fc') || address.startsWith('fd')) return false;
  if (/^fe[89ab]/.test(address)) return false;
  if (address.startsWith('ff')) return false;
  if (address.startsWith('2001:db8:') || address === '2001:db8::') return false;
  if (address.startsWith('::ffff:')) return false;
  return true;
}

function addCandidate(results, literal, category, allowlist, source = 'rule') {
  if (!literal || isAllowlisted(literal, allowlist)) return;
  results.push(finding(literal, category, source));
}

function addMatches(results, content, regex, category, allowlist, capture = 0) {
  for (const match of content.matchAll(regex)) {
    addCandidate(results, match[capture], category, allowlist);
  }
}

export function findRuleCandidates(content, allowlist = new Set()) {
  const results = [];

  for (const match of content.matchAll(/(?<![\d.])(?:\d{1,3}\.){3}\d{1,3}(?![\d.])/g)) {
    if (isPublicIpv4(match[0])) addCandidate(results, match[0], 'ip_address', allowlist);
  }

  for (const match of content.matchAll(/[0-9A-Fa-f:]+(?:%[A-Za-z0-9._-]+)?/g)) {
    if (match[0].includes(':') && isPublicIpv6(match[0])) {
      addCandidate(results, match[0], 'ip_address', allowlist);
    }
  }

  addMatches(
    results,
    content,
    /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,
    'uuid',
    allowlist,
  );

  addMatches(
    results,
    content,
    /(["'`])((?:\/Users\/|\/home\/)[^"'`\r\n]+)\1/g,
    'file_path',
    allowlist,
    2,
  );
  addMatches(
    results,
    content,
    /(["'`])([A-Za-z]:\\Users\\[^"'`\r\n]+)\1/g,
    'file_path',
    allowlist,
    2,
  );
  addMatches(
    results,
    content,
    /(?:\/Users\/|\/home\/)[^/\s"'`<>]+(?:\/[^\s"'`<>\])},;]*)*/g,
    'file_path',
    allowlist,
  );
  addMatches(
    results,
    content,
    /\b[A-Za-z]:\\Users\\[^\\\s"'`<>]+(?:\\[^\s"'`<>\])},;]*)*/g,
    'file_path',
    allowlist,
  );

  addMatches(
    results,
    content,
    /-----BEGIN ([A-Z0-9 ]*PRIVATE KEY)-----[\s\S]*?-----END \1-----/g,
    'credential',
    allowlist,
  );
  addMatches(results, content, /\bBearer\s+([A-Za-z0-9._~+/=-]{8,})/gi, 'credential', allowlist, 1);
  addMatches(
    results,
    content,
    /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b|\bgithub_pat_[A-Za-z0-9_]{20,}\b|\bgh[pousr]_[A-Za-z0-9]{20,}\b|\bxox[baprs]-[A-Za-z0-9-]{10,}\b|\bsk-[A-Za-z0-9_-]{20,}\b/g,
    'credential',
    allowlist,
  );
  addMatches(
    results,
    content,
    /\b(?:api[_-]?key|access[_-]?token|auth[_-]?token|password|passwd|secret|client[_-]?secret)\b\s*[:=]\s*["']?([^\s"'`,;}{]{4,})/gi,
    'credential',
    allowlist,
    1,
  );
  addMatches(
    results,
    content,
    /\b(?:https?|postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis):\/\/([^:\s/@]+:[^@\s/]+)@/gi,
    'credential',
    allowlist,
    1,
  );

  return dedupeFindings(results);
}

export function validateModelFindings(content, value, allowlist = new Set()) {
  if (!value || typeof value !== 'object' || !Array.isArray(value.findings)) {
    throw new Error('模型输出缺少 findings 数组。');
  }
  if (Object.keys(value).some((key) => key !== 'findings')) {
    throw new Error('模型输出包含未知字段。');
  }

  const results = [];
  for (const item of value.findings) {
    if (!item || typeof item !== 'object') throw new Error('模型 finding 不是对象。');
    if (Object.keys(item).some((key) => !['literal', 'category'].includes(key))) {
      throw new Error('模型 finding 包含未知字段。');
    }
    const { literal, category } = item;
    if (typeof literal !== 'string' || literal.length < 2 || literal.length > 512 || literal.includes('\0')) {
      throw new Error('模型返回了无效 literal。');
    }
    if (!MODEL_CATEGORIES.includes(category)) throw new Error('模型返回了未知 category。');
    if (!content.includes(literal)) throw new Error('模型返回的 literal 不存在于原文。');
    if (isAllowlisted(literal, allowlist)) continue;
    results.push(finding(literal, category, 'model'));
  }
  return dedupeFindings(results);
}

export function dedupeFindings(findings) {
  const byLiteral = new Map();
  for (const item of findings) {
    const existing = byLiteral.get(item.literal);
    if (!existing || (item.source === 'rule' && existing.source !== 'rule')) {
      byLiteral.set(item.literal, item);
    }
  }
  const unique = [...byLiteral.values()];
  return unique.filter((item) => {
    if (item.source === 'rule') return !unique.some((other) => other !== item
      && other.source === 'rule'
      && other.category === item.category
      && other.literal.length > item.literal.length
      && other.literal.includes(item.literal));
    if (unique.some((other) => other.source === 'rule' && (
      item.literal.includes(other.literal) || other.literal.includes(item.literal)
    ))) return false;
    return !unique.some((other) => other !== item
      && other.source === 'model'
      && other.category === item.category
      && other.literal.length < item.literal.length
      && item.literal.includes(other.literal));
  });
}

export function applyFindings(content, findings) {
  let output = content;
  const ordered = [...findings].sort((a, b) => b.literal.length - a.literal.length);
  for (const item of ordered) {
    output = output.split(item.literal).join(item.replacement);
  }
  return output;
}

export function lineNumberFor(content, literal) {
  const index = content.indexOf(literal);
  if (index < 0) return null;
  return content.slice(0, index).split('\n').length;
}

export function chunkMarkdown(content, maxCharacters = 6_000) {
  if (content.length <= maxCharacters) return [content];
  const parts = content.split(/(\n\n+)/);
  const paragraphs = [];
  for (let index = 0; index < parts.length; index += 2) {
    paragraphs.push(parts[index] + (parts[index + 1] ?? ''));
  }
  const chunks = [];
  let current = '';

  function flush() {
    if (current) chunks.push(current);
    current = '';
  }

  for (const paragraph of paragraphs) {
    if (paragraph.length > maxCharacters) {
      flush();
      for (let offset = 0; offset < paragraph.length; offset += maxCharacters) {
        chunks.push(paragraph.slice(offset, offset + maxCharacters));
      }
      continue;
    }
    if (current && current.length + paragraph.length > maxCharacters) flush();
    current += paragraph;
  }
  flush();
  return chunks;
}
