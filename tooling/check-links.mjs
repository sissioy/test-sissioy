import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';

const distDir = path.resolve(process.argv[2] ?? 'dist');

async function walk(directory, prefix = '') {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...await walk(path.join(directory, entry.name), relative));
    else if (entry.isFile()) files.push(relative);
  }
  return files;
}

function localTarget(raw) {
  if (!raw || /^(?:[a-z]+:|\/\/|#|data:)/i.test(raw)) return null;
  const clean = decodeURIComponent(raw.split(/[?#]/)[0]);
  if (!clean.startsWith('/')) return null;
  const relative = clean.slice(1);
  if (!relative || clean.endsWith('/')) return path.join(distDir, relative, 'index.html');
  return path.join(distDir, relative);
}

const files = await walk(distDir);
const htmlFiles = files.filter(file => file.endsWith('.html'));
const missing = [];

for (const relative of htmlFiles) {
  const html = await readFile(path.join(distDir, relative), 'utf8');
  const resources = [
    ...html.matchAll(/<(?:script|img|source)[^>]+src=["']([^"']+)["']/gi),
    ...html.matchAll(/<link[^>]+href=["']([^"']+)["']/gi)
  ].map(match => match[1]);
  for (const resource of resources) {
    const target = localTarget(resource);
    if (!target) continue;
    try {
      if (!(await stat(target)).isFile()) missing.push(`${relative} -> ${resource}`);
    } catch {
      missing.push(`${relative} -> ${resource}`);
    }
  }
}

const legacyArticles = files.filter(file => /^archives\/[0-9a-f]+\.html$/i.test(file));
if (legacyArticles.length !== 45) missing.push(`Expected 45 legacy article URLs, found ${legacyArticles.length}`);

for (const required of [
  'index.html', 'archives/a5547e95.html', 'archives/c895e024.html',
  'atom.xml', 'sitemap.xml', 'deployment-manifest.json',
  'css/main.css', 'fonts/noto-serif-sc.css',
  'legacy-assets/css/main.css', 'legacy-assets/images/yourbackground_compress.webp'
]) {
  if (!files.includes(required)) missing.push(`Missing required output: ${required}`);
}

const pin = await readFile(path.join(distDir, 'archives/a5547e95.html'), 'utf8');
if (!pin.includes('https://ghchart.rshah.org/sissioy')) missing.push('Pinned page is missing the GitHub contribution chart');
const homepage = await readFile(path.join(distDir, 'index.html'), 'utf8');
if (!homepage.includes('https://ghchart.rshah.org/sissioy')) missing.push('Homepage is missing the pinned GitHub contribution chart');

if (missing.length) {
  console.error(missing.join('\n'));
  process.exit(1);
}

console.log(`Checked ${htmlFiles.length} HTML files and 45 frozen legacy article URLs.`);
