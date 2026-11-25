import { readFile, readdir, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
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
const stylesheet = await readFile(path.join(distDir, 'css/main.css'));
const styleVersion = createHash('sha256').update(stylesheet).digest('hex').slice(0, 16);

const graph = JSON.parse(await readFile(path.join(distDir, 'knowledge-graph.json'), 'utf8'));
const nodeIds = new Set(graph.nodes.map(node => node.id));
const articles = graph.nodes.filter(node => node.type === 'article');
for (const node of articles) {
  try {
    if (!(await stat(localTarget(node.url))).isFile()) missing.push(`Graph article missing: ${node.url}`);
  } catch { missing.push(`Graph article missing: ${node.url}`); }
}
for (const edge of graph.edges) {
  if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) missing.push('Graph edge references an unknown node');
}
if (articles.filter(node => /^\/archives\/[0-9a-f]+\.html$/i.test(node.url)).length !== 45) {
  missing.push('Knowledge graph must contain all 45 legacy articles');
}

const cardsPerPage = 10;
const pageCount = Math.ceil(articles.length / cardsPerPage);
const sidebarCount = /<div class="site-state-item site-state-posts">\s*<a href="\/archives\/">\s*<span class="site-state-item-count">(\d+)<\/span>/;
const unseen = new Set(articles.map(article => article.id));
const homePages = htmlFiles.filter(file => file === 'index.html' || /^page\/\d+\/index\.html$/.test(file));
if (homePages.length !== pageCount) missing.push(`Expected ${pageCount} homepage listing pages, found ${homePages.length}`);
for (let page = 1; page <= pageCount; page++) {
  const file = page === 1 ? 'index.html' : `page/${page}/index.html`;
  if (!homePages.includes(file)) {
    missing.push(`Missing homepage listing page: ${file}`);
    continue;
  }
  const html = page === 1 ? homepage : await readFile(path.join(distDir, file), 'utf8');
  if (Number(html.match(sidebarCount)?.[1]) !== articles.length) {
    missing.push(`${file}: sidebar must show all ${articles.length} articles`);
  }
  if (!html.includes(`href="/css/main.css?v=${styleVersion}"`) || html.includes('href="/css/main.css"')) {
    missing.push(`${file}: stylesheet URL must use its current content hash`);
  }
  const cards = [...html.matchAll(/<link itemprop="mainEntityOfPage" href="([^"]+)"/g)];
  const expected = Math.min(cardsPerPage, articles.length - (page - 1) * cardsPerPage);
  if (cards.length !== expected) missing.push(`${file}: expected ${expected} article cards, found ${cards.length}`);
  for (const [, url] of cards) {
    const article = decodeURI(new URL(url).pathname).replace(/index\.html$/, '');
    if (!unseen.delete(article)) missing.push(`${file}: unexpected or duplicate article ${article}`);
  }
}
for (const article of unseen) missing.push(`Article card missing from the homepage listing: ${article}`);

const archivePages = htmlFiles.filter(file => file === 'archives/index.html' || /^archives\/page\/\d+\/index\.html$/.test(file));
if (archivePages.length !== pageCount) missing.push(`Expected ${pageCount} archive listing pages, found ${archivePages.length}`);
const unseenLegacy = new Set(legacyArticles.map(file => `/${file}`));
for (let page = 1; page <= pageCount; page++) {
  const file = page === 1 ? 'archives/index.html' : `archives/page/${page}/index.html`;
  if (!archivePages.includes(file)) {
    missing.push(`Missing archive listing page: ${file}`);
    continue;
  }
  const html = await readFile(path.join(distDir, file), 'utf8');
  const entries = [...html.matchAll(/<article itemscope itemtype="http:\/\/schema.org\/Article">/g)];
  const expected = Math.min(cardsPerPage, articles.length - (page - 1) * cardsPerPage);
  if (entries.length !== expected) missing.push(`${file}: expected ${expected} archive entries, found ${entries.length}`);
  if (Number(html.match(sidebarCount)?.[1]) !== articles.length) {
    missing.push(`${file}: sidebar must show all ${articles.length} articles`);
  }
  for (const [, article] of html.matchAll(/<a class="post-title-link" href="(\/archives\/[0-9a-f]+\.html)"/gi)) {
    if (!unseenLegacy.delete(article)) missing.push(`${file}: unexpected or duplicate legacy archive entry ${article}`);
  }
}
for (const article of unseenLegacy) missing.push(`Article missing from the archive listing: ${article}`);

if (missing.length) {
  console.error(missing.join('\n'));
  process.exit(1);
}

console.log(`Checked ${htmlFiles.length} HTML files and 45 frozen legacy article URLs.`);
