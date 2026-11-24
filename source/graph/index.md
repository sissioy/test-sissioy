---
title: 知识图谱
layout: page
comments: false
---

<link rel="stylesheet" href="/css/knowledge-graph.css">
<div class="knowledge-graph" id="knowledge-graph">
  <p class="knowledge-graph__intro">从一篇文章出发，沿着引用、标签和分类继续阅读。</p>
  <div class="knowledge-graph__toolbar">
    <label for="graph-search">查找文章或主题</label>
    <input id="graph-search" type="search" placeholder="输入标题、标签或分类" autocomplete="off">
    <label class="knowledge-graph__filter"><input id="graph-links-only" type="checkbox">只看正文引用</label>
    <button id="graph-reset" type="button">重置视图</button>
  </div>
  <p id="graph-status" role="status">正在加载文章关系…</p>
  <div class="knowledge-graph__workspace">
    <div class="knowledge-graph__canvas">
      <svg id="graph-svg" role="group" aria-label="文章知识图谱，可拖动画布和节点，滚轮缩放"></svg>
      <div class="knowledge-graph__zoom" aria-label="图谱缩放">
        <button id="graph-zoom-in" type="button" aria-label="放大图谱">＋</button>
        <button id="graph-zoom-out" type="button" aria-label="缩小图谱">−</button>
      </div>
      <p class="knowledge-graph__legend"><span class="graph-article-key">文章</span><span class="graph-tag-key">标签</span><span class="graph-category-key">分类</span></p>
    </div>
    <aside id="graph-detail" class="knowledge-graph__detail" aria-label="节点详情" aria-live="polite"><p>选择一个节点，查看它的关联。</p></aside>
  </div>
  <details class="knowledge-graph__directory">
    <summary>文章目录（也可使用键盘浏览）</summary>
    <ul id="graph-article-list"></ul>
  </details>
  <noscript><p>互动图谱需要 JavaScript。可以通过<a href="/archives/">文章归档</a>继续阅读；每篇文章底部也有文章关联。</p></noscript>
</div>
<script src="/js/knowledge-graph.js" defer></script>
