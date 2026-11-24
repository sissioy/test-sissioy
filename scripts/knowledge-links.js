// Resolve Obsidian links against published articles only.
hexo.extend.filter.register('before_post_render', async function(data) {
  if (!data.content?.includes('[[')) return data;
  const { articleFromHtml, replaceWikilinks } = require('../tooling/lib/knowledge-graph.mjs');
  const { readdir, readFile } = require('node:fs/promises');
  const path = require('node:path');
  const targets = new Map();
  for (const post of hexo.locals.get('posts').toArray()) {
    if (post.published === false) continue;
    const url = `/${post.path}`;
    targets.set(post.title, url);
    targets.set(post.slug, url);
    for (const alias of [].concat(post.aliases ?? [])) targets.set(alias, url);
  }
  const legacy = path.join(hexo.base_dir, '.build/legacy/archives');
  try {
    for (const name of await readdir(legacy)) {
      if (!/^[0-9a-f]+\.html$/i.test(name)) continue;
      const url = `/archives/${name}`;
      const article = articleFromHtml(await readFile(path.join(legacy, name), 'utf8'), url, hexo.config.url);
      if (!targets.has(article.title)) targets.set(article.title, url);
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  data.content = replaceWikilinks(data.content, targets);
  return data;
});
