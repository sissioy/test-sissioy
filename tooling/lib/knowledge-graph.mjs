import { parse } from 'parse5';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

function elements(node) {
  return [node, ...(node.childNodes ?? []).flatMap(elements)];
}

function attr(node, name) {
  return node.attrs?.find(attribute => attribute.name === name)?.value;
}

function text(node) {
  return node.nodeName === '#text' ? node.value : (node.childNodes ?? []).map(text).join('');
}

export function articleFromHtml(html, url, siteUrl) {
  const nodes = elements(parse(html));
  const meta = name => nodes.filter(node => node.tagName === 'meta'
    && (attr(node, 'property') === name || attr(node, 'name') === name))
    .map(node => attr(node, 'content')).filter(Boolean);
  const body = nodes.find(node => attr(node, 'itemprop') === 'articleBody')
    ?? nodes.find(node => attr(node, 'class')?.split(/\s+/).includes('post-body'));
  const urlPath = raw => {
    try {
      const target = new URL(raw, new URL(url, siteUrl));
      if (target.origin !== new URL(siteUrl).origin) return null;
      return decodeURI(target.pathname).replace(/index\.html$/, '');
    } catch { return null; }
  };
  const tags = [...new Set(meta('article:tag'))];
  const categories = [...new Set(nodes.filter(node => node.tagName === 'a'
    && attr(node, 'href')?.startsWith('/categories/') && attr(node, 'rel') === 'index')
    .map(node => text(node).trim()).filter(Boolean))];
  return {
    id: urlPath(url), title: meta('og:title')[0] ?? url, url,
    tags, categories,
    links: body ? [...new Set(elements(body).filter(node => node.tagName === 'a')
      .map(node => urlPath(attr(node, 'href'))).filter(Boolean))] : []
  };
}

export function createKnowledgeGraph(articles) {
  const nodes = new Map([['collection:all', {
    id: 'collection:all', title: '全部文章', type: 'collection', url: '/archives/'
  }]]);
  const edges = new Map();
  const addEdge = (source, target, type) => {
    if (source !== target) edges.set(`${source}\0${target}\0${type}`, { source, target, type });
  };
  for (const article of articles) nodes.set(article.id, { ...article, type: 'article', links: undefined });
  for (const article of articles) {
    let topics = 0;
    for (const [type, labels] of [['tag', article.tags], ['category', article.categories]]) {
      for (const label of labels) {
        const id = `${type}:${label}`;
        nodes.set(id, { id, title: label, type });
        addEdge(article.id, id, type);
        addEdge(id, 'collection:all', 'collection');
        topics += 1;
      }
    }
    if (!topics) addEdge(article.id, 'collection:all', 'collection');
    for (const target of article.links) {
      if (nodes.get(target)?.type === 'article') addEdge(article.id, target, 'link');
    }
  }
  return { nodes: [...nodes.values()], edges: [...edges.values()] };
}

export function renderConnections(graph, id) {
  const articles = graph.nodes.filter(node => node.type === 'article' && node.id !== id);
  const outgoing = new Set(graph.edges.filter(edge => edge.source === id && edge.type === 'link').map(edge => edge.target));
  const incoming = new Set(graph.edges.filter(edge => edge.target === id && edge.type === 'link').map(edge => edge.source));
  const topics = new Set(graph.edges.filter(edge => edge.source === id && ['tag', 'category'].includes(edge.type))
    .map(edge => edge.target));
  const relatedIds = new Set(graph.edges.filter(edge => topics.has(edge.target) && edge.source !== id)
    .map(edge => edge.source));
  const list = (label, selected) => selected.length
    ? `<h3>${label}</h3><ul>${selected.map(node => `<li><a href="${escapeHtml(node.url)}">${escapeHtml(node.title)}</a></li>`).join('')}</ul>` : '';
  return `<section class="article-connections" aria-label="文章关联"><h2>文章关联</h2>
    <p><a href="/graph/?focus=${encodeURIComponent(id)}">在知识图谱中查看</a></p>
    ${list('本文引用', articles.filter(node => outgoing.has(node.id)))}
    ${list('反向链接', articles.filter(node => incoming.has(node.id)))}
    ${list('共同标签或分类', articles.filter(node => relatedIds.has(node.id)).slice(0, 8))}
    </section>`;
}

export function replaceWikilinks(markdown, targets) {
  return markdown.split(/(```[^\n]*\n[\s\S]*?```|~~~[^\n]*\n[\s\S]*?~~~|`[^`\n]+`)/g)
    .map((part, index) => index % 2 ? part : part.replace(/!?\[\[([^\]\n]+)\]\]/g, (_match, raw) => {
      const [destination, alias] = raw.split('|');
      const [name, heading] = destination.split('#');
      const target = targets.get(name.replace(/\.md$/, ''));
      const label = alias ?? name.split('/').at(-1);
      if (!target) return label;
      const fragment = heading ? `#${encodeURIComponent(heading.toLowerCase().replace(/\s+/g, '-'))}` : '';
      return `<a href="${escapeHtml(target)}${fragment}">${escapeHtml(label)}</a>`;
    })).join('');
}

export async function writeKnowledgeGraph(directory, articlePaths, siteUrl) {
  const documents = [];
  for (const articlePath of new Set(articlePaths)) {
    const url = `/${articlePath.replace(/^\/+/, '')}`;
    const file = path.join(directory, articlePath, articlePath.endsWith('/') ? 'index.html' : '');
    const html = await readFile(file, 'utf8');
    documents.push({ file, html, article: articleFromHtml(html, url, siteUrl) });
  }
  const graph = createKnowledgeGraph(documents.map(document => document.article));
  await writeFile(path.join(directory, 'knowledge-graph.json'), `${JSON.stringify(graph)}\n`);
  for (const { file, html, article } of documents) {
    const body = elements(parse(html, { sourceCodeLocationInfo: true })).find(node =>
      attr(node, 'itemprop') === 'articleBody');
    if (!body?.sourceCodeLocation?.endTag) throw new Error(`Missing article body: ${article.url}`);
    const offset = body.sourceCodeLocation.endTag.startOffset;
    const output = `${html.slice(0, offset)}${renderConnections(graph, article.id)}${html.slice(offset)}`
      .replace('</head>', '<link rel="stylesheet" href="/css/knowledge-graph.css">\n</head>');
    await writeFile(file, output);
  }
  console.log(`Knowledge graph: ${documents.length} articles, ${graph.nodes.length} nodes, ${graph.edges.length} relationships.`);
  return graph;
}
