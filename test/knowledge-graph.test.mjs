import test from 'node:test';
import assert from 'node:assert/strict';
import { articleFromHtml, createKnowledgeGraph, renderConnections, replaceWikilinks } from '../tooling/lib/knowledge-graph.mjs';

test('extracts article links and topics without including navigation or external links', () => {
  const post = articleFromHtml(`<meta property="og:title" content="A &amp; B">
    <meta property="article:tag" content="Python">
    <a href="/categories/Code/" rel="index">Code</a><a href="/navigation/">Menu</a>
    <div itemprop="articleBody"><a href="../second/#example">Second</a><a href="https://external.example/secret/">External</a></div>`,
  '/posts/first/', 'https://blog.example');
  assert.equal(post.title, 'A & B');
  assert.deepEqual(post.tags, ['Python']);
  assert.deepEqual(post.categories, ['Code']);
  assert.deepEqual(post.links, ['/posts/second/']);
});

test('connects all published articles through real topics and separates citations from shared topics', () => {
  const articles = [
    { id: '/a/', title: 'A', url: '/a/', tags: ['Python'], categories: [], links: ['/b/', '/private/'] },
    { id: '/b/', title: 'B', url: '/b/', tags: ['Python'], categories: [], links: [] },
    { id: '/c/', title: '<script>', url: '/c/', tags: [], categories: [], links: [] },
  ];
  const graph = createKnowledgeGraph(articles);
  assert.equal(graph.edges.filter(edge => edge.type === 'link').length, 1);
  assert.equal(graph.nodes.some(node => node.id === '/private/'), false);
  const reached = new Set(['collection:all']);
  for (let pass = 0; pass < graph.nodes.length; pass += 1) {
    for (const edge of graph.edges) {
      if (reached.has(edge.source)) reached.add(edge.target);
      if (reached.has(edge.target)) reached.add(edge.source);
    }
  }
  assert.equal(reached.size, graph.nodes.length);
  assert.match(renderConnections(graph, '/b/'), /反向链接/);
  assert.doesNotMatch(renderConnections(graph, '/a/'), /反向链接/);
  assert.match(renderConnections(graph, '/a/'), /共同标签或分类/);
});

test('resolves published wiki links, preserves code samples, and does not expose private vault paths', () => {
  const targets = new Map([['Public', '/public/']]);
  const result = replaceWikilinks('[[Public|Read more]] [[private/secret|Unpublished]] `[[Public]]`\n```md\n[[Public]]\n```', targets);
  assert.match(result, /<a href="\/public\/">Read more<\/a>/);
  assert.doesNotMatch(result, /private\/secret/);
  assert.match(result, /Unpublished/);
  assert.match(result, /`\[\[Public\]\]`/);
  assert.match(result, /```md\n\[\[Public\]\]\n```/);
});
