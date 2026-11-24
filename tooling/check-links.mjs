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
  'graph/index.html', 'knowledge-graph.json', 'js/knowledge-graph.js', 'css/knowledge-graph.css',
  'css/main.css', 'fonts/noto-serif-sc.css',
  'legacy-assets/css/main.css', 'legacy-assets/images/yourbackground_compress.webp'
]) {
  if (!files.includes(required)) missing.push(`Missing required output: ${required}`);
}

const pin = await readFile(path.join(distDir, 'archives/a5547e95.html'), 'utf8');
if (!pin.includes('https://ghchart.rshah.org/sissioy')) missing.push('Pinned page is missing the GitHub contribution chart');
const homepage = await readFile(path.join(distDir, 'index.html'), 'utf8');
if (!homepage.includes('https://ghchart.rshah.org/sissioy')) missing.push('Homepage is missing the pinned GitHub contribution chart');

const graph = JSON.parse(await readFile(path.join(distDir, 'knowledge-graph.json'), 'utf8'));
const nodeIds = new Set(graph.nodes.map(node => node.id));
for (const node of graph.nodes.filter(node => node.type === 'article')) {
  try {
    if (!(await stat(localTarget(node.url))).isFile()) missing.push(`Graph article missing: ${node.url}`);
  } catch { missing.push(`Graph article missing: ${node.url}`); }
}
for (const edge of graph.edges) {
  if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) missing.push('Graph edge references an unknown node');
}
if (graph.nodes.filter(node => node.type === 'article' && /^\/archives\/[0-9a-f]+\.html$/i.test(node.url)).length !== 45) {
  missing.push('Knowledge graph must contain all 45 legacy articles');
}

if (missing.length) {
  console.error(missing.join('\n'));
  process.exit(1);
}

console.log(`Checked ${htmlFiles.length} HTML files and 45 frozen legacy article URLs.`);
