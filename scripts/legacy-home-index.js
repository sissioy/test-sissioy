const { readFile, readdir } = require('node:fs/promises');
const path = require('node:path');
const { parse } = require('parse5');
const { isLegacyArticlePath } = require('../tooling/lib/legacy.mjs');
const { escapeHtml } = require('../tooling/lib/knowledge-graph.mjs');

const generateIndex = hexo.extend.generator.get('index');

hexo.extend.generator.register('index', async function(locals) {
  const directory = path.join(this.base_dir, '.build/legacy');
  const files = await readdir(path.join(directory, 'archives')).catch(error => {
    if (error.code !== 'ENOENT') throw error;
    return [];
  });
  const posts = locals.posts.toArray();
  const currentPaths = new Set(posts.map(post => post.path.replace(/^\/+/, '')));
  const legacyPaths = files.sort().map(file => `archives/${file}`)
    .filter(file => isLegacyArticlePath(file) && !currentPaths.has(file));
  const legacyPosts = await Promise.all(legacyPaths.map(async file => {
    const document = parse(await readFile(path.join(directory, file), 'utf8'));
    const html = document.childNodes.find(node => node.tagName === 'html');
    const head = html.childNodes.find(node => node.tagName === 'head');
    const meta = new Map(head.childNodes.filter(node => node.tagName === 'meta').map(node => {
      const attrs = Object.fromEntries(node.attrs.map(({ name, value }) => [name, value]));
      return [attrs.property ?? attrs.name, attrs.content];
    }));
    const title = meta.get('og:title');
    const date = new Date(meta.get('article:published_time'));
    if (!title || Number.isNaN(date.getTime())) throw new Error(`Missing title or date for ${file}`);
    const summary = meta.get('description');
    return {
      path: file,
      title: escapeHtml(title),
      date,
      updated: new Date(meta.get('article:modified_time') ?? date),
      lang: this.config.language,
      permalink: new URL(file, `${this.config.url}/`).href,
      excerpt: summary ? `<p>${escapeHtml(summary)}</p>` : ' '
    };
  }));

  // Give only the homepage generator the combined list.
  return generateIndex.call(this, {
    ...locals,
    posts: new locals.posts.constructor([...posts, ...legacyPosts])
  });
});
