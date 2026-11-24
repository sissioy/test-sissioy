(() => {
  const root = document.getElementById('knowledge-graph');
  if (!root) return;
  const svg = document.getElementById('graph-svg');
  const search = document.getElementById('graph-search');
  const linksOnly = document.getElementById('graph-links-only');
  const status = document.getElementById('graph-status');
  const detail = document.getElementById('graph-detail');
  const directory = document.getElementById('graph-article-list');
  const ns = 'http://www.w3.org/2000/svg';
  const types = { article: '文章', tag: '标签', category: '分类', collection: '目录' };
  let graph, nodes, edges, layer, selected, drag;
  let zoom = 1, pan = { x: 0, y: 0 };

  function element(tag, attributes = {}, value) {
    const node = document.createElementNS(ns, tag);
    Object.entries(attributes).forEach(([name, item]) => node.setAttribute(name, item));
    if (value) node.textContent = value;
    return node;
  }

  function addList(title, items) {
    if (!items.length) return;
    const heading = document.createElement('h3');
    heading.textContent = title;
    const list = document.createElement('ul');
    for (const item of items) {
      const li = document.createElement('li');
      const anchor = document.createElement('a');
      anchor.href = item.url;
      anchor.textContent = item.title;
      li.append(anchor);
      list.append(li);
    }
    detail.append(heading, list);
  }

  function select(id) {
    selected = id;
    const node = graph.nodes.find(item => item.id === id);
    if (!node) return;
    detail.replaceChildren();
    const heading = document.createElement('h2');
    heading.textContent = node.title;
    const type = document.createElement('p');
    type.textContent = types[node.type];
    detail.append(heading, type);
    if (node.url) {
      const link = document.createElement('a');
      link.href = node.url;
      link.textContent = node.type === 'article' ? '阅读全文' : '查看文章归档';
      detail.append(link);
    }
    const outgoing = new Set(graph.edges.filter(edge => edge.source === id && edge.type === 'link').map(edge => edge.target));
    const incoming = new Set(graph.edges.filter(edge => edge.target === id && edge.type === 'link').map(edge => edge.source));
    const topics = new Set(graph.edges.filter(edge => edge.source === id && ['tag', 'category'].includes(edge.type)).map(edge => edge.target));
    const related = new Set(graph.edges.filter(edge => edge.target === id || topics.has(edge.target)).map(edge => edge.source));
    const articles = graph.nodes.filter(item => item.type === 'article' && item.id !== id);
    addList('本文引用', articles.filter(item => outgoing.has(item.id)));
    addList('反向链接', articles.filter(item => incoming.has(item.id)));
    addList(node.type === 'article' ? '共同标签或分类' : '关联文章', articles.filter(item => node.type === 'collection' || related.has(item.id)));
    filter();
  }

  function filter() {
    if (!graph) return;
    const query = search.value.trim().toLocaleLowerCase();
    const matching = new Set(graph.nodes.filter(node => node.title.toLocaleLowerCase().includes(query)).map(node => node.id));
    const neighbors = new Set([selected]);
    for (const edge of graph.edges) {
      if (edge.source === selected) neighbors.add(edge.target);
      if (edge.target === selected) neighbors.add(edge.source);
    }
    const linked = new Set(graph.edges.filter(edge => edge.type === 'link').flatMap(edge => [edge.source, edge.target]));
    for (const node of nodes) {
      node.el.style.display = linksOnly.checked && !linked.has(node.id) ? 'none' : '';
      node.el.classList.toggle('is-selected', node.id === selected);
      node.el.classList.toggle('is-dimmed', query ? !matching.has(node.id) : selected && !neighbors.has(node.id));
      const showLabel = node.type === 'collection'
        || node.type === 'category' && svg.clientWidth > 600
        || zoom > 1.5 && node.type === 'tag'
        || matching.has(node.id) && query || neighbors.has(node.id);
      node.label.style.display = showLabel ? '' : 'none';
    }
    for (const edge of edges) {
      edge.el.style.display = linksOnly.checked && edge.type !== 'link' ? 'none' : '';
      edge.el.classList.toggle('is-dimmed', query
        ? !matching.has(edge.source.id) && !matching.has(edge.target.id)
        : selected && edge.source.id !== selected && edge.target.id !== selected);
    }
    const articles = graph.nodes.filter(node => node.type === 'article'
      && (!linksOnly.checked || linked.has(node.id))
      && (!query || matching.has(node.id)));
    directory.replaceChildren();
    for (const article of articles) {
      const li = document.createElement('li');
      const anchor = document.createElement('a');
      anchor.textContent = article.title;
      anchor.href = article.url;
      li.append(anchor);
      directory.append(li);
    }
    status.textContent = `${graph.nodes.filter(node => node.type === 'article').length} 篇文章 · ${graph.edges.filter(edge => edge.type === 'link').length} 条正文引用 · ${query ? `找到 ${articles.length} 篇文章` : '点击节点查看关联，拖动或缩放图谱'}`;
  }

  function transform() {
    layer.setAttribute('transform', `translate(${pan.x},${pan.y}) scale(${zoom})`);
  }

  function drawPositions() {
    nodes.forEach(node => node.el.setAttribute('transform', `translate(${node.x},${node.y})`));
    edges.forEach(edge => {
      edge.el.setAttribute('x1', edge.source.x);
      edge.el.setAttribute('y1', edge.source.y);
      edge.el.setAttribute('x2', edge.target.x);
      edge.el.setAttribute('y2', edge.target.y);
    });
  }

  function layout() {
    const width = svg.clientWidth, height = svg.clientHeight;
    nodes.forEach((node, index) => {
      const angle = index * 2.39996;
      const radius = Math.sqrt((index + 1) / nodes.length) * .43;
      node.x = width / 2 + Math.cos(angle) * width * radius;
      node.y = height / 2 + Math.sin(angle) * height * radius;
    });
    for (let tick = 0; tick < 180; tick += 1) {
      const cooling = 1 - tick / 200;
      for (let i = 0; i < nodes.length; i += 1) {
        const node = nodes[i];
        for (let j = i + 1; j < nodes.length; j += 1) {
          const other = nodes[j];
          const dx = node.x - other.x, dy = node.y - other.y;
          const square = dx * dx + dy * dy + 1;
          const force = Math.min(3, 600 / square) * cooling;
          const distance = Math.sqrt(square);
          node.x += dx / distance * force; node.y += dy / distance * force;
          other.x -= dx / distance * force; other.y -= dy / distance * force;
        }
      }
      edges.forEach(edge => {
        const dx = edge.target.x - edge.source.x, dy = edge.target.y - edge.source.y;
        const distance = Math.hypot(dx, dy) || 1;
        const force = (distance - 80) * .014 * cooling;
        edge.source.x += dx / distance * force; edge.source.y += dy / distance * force;
        edge.target.x -= dx / distance * force; edge.target.y -= dy / distance * force;
      });
      nodes.forEach(node => {
        node.x = Math.max(24, Math.min(width - 24, node.x + (width / 2 - node.x) * .003));
        node.y = Math.max(36, Math.min(height - 55, node.y + (height / 2 - node.y) * .003));
      });
    }
    drawPositions();
  }

  function scale(factor) {
    const next = Math.max(.45, Math.min(3, zoom * factor));
    const x = svg.clientWidth / 2, y = svg.clientHeight / 2;
    pan = { x: x - (x - pan.x) * next / zoom, y: y - (y - pan.y) * next / zoom };
    zoom = next;
    transform();
    filter();
  }

  fetch('/knowledge-graph.json').then(response => {
    if (!response.ok) throw new Error('无法读取图谱数据');
    return response.json();
  }).then(data => {
    graph = data;
    layer = element('g');
    svg.append(layer);
    nodes = graph.nodes.map(node => ({ ...node }));
    const byId = new Map(nodes.map(node => [node.id, node]));
    edges = graph.edges.map(edge => ({ ...edge, source: byId.get(edge.source), target: byId.get(edge.target) }));
    for (const edge of edges) {
      edge.el = element('line', { class: 'graph-edge', 'data-type': edge.type });
      layer.append(edge.el);
    }
    for (const node of nodes) {
      node.el = element('g', { class: 'graph-node', 'data-type': node.type, 'data-id': node.id, role: 'button', tabindex: '0', 'aria-label': `${types[node.type]}：${node.title}` });
      node.el.append(element('title', {}, node.title), element('circle', { r: node.type === 'article' ? 5 : 8 }));
      node.label = element('text', { x: 11, y: 5 }, node.title.length > 20 ? `${node.title.slice(0, 20)}…` : node.title);
      node.el.append(node.label);
      node.el.addEventListener('click', () => { if (!drag?.moved) select(node.id); });
      node.el.addEventListener('keydown', event => {
        if (['Enter', ' '].includes(event.key)) { event.preventDefault(); select(node.id); }
      });
      layer.append(node.el);
    }
    layout();
    filter();
    const focus = new URLSearchParams(location.search).get('focus');
    if (byId.has(focus)) select(focus);
    new ResizeObserver(() => { layout(); }).observe(svg);
    svg.addEventListener('wheel', event => { event.preventDefault(); scale(event.deltaY < 0 ? 1.1 : 1 / 1.1); }, { passive: false });
    svg.addEventListener('pointerdown', event => {
      const nodeElement = event.target.closest('.graph-node');
      drag = { node: byId.get(nodeElement?.dataset.id), x: event.clientX, y: event.clientY, moved: false };
      svg.setPointerCapture(event.pointerId);
      svg.classList.add('is-dragging');
    });
    svg.addEventListener('pointermove', event => {
      if (!drag) return;
      const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 2) drag.moved = true;
      if (drag.node) { drag.node.x += dx / zoom; drag.node.y += dy / zoom; drawPositions(); }
      else { pan.x += dx; pan.y += dy; transform(); }
      drag.x = event.clientX; drag.y = event.clientY;
    });
    const endDrag = event => {
      if (event.type === 'pointerup' && drag?.node && !drag.moved) select(drag.node.id);
      svg.classList.remove('is-dragging');
      setTimeout(() => { drag = null; }, 0);
    };
    svg.addEventListener('pointerup', endDrag);
    svg.addEventListener('pointercancel', endDrag);
    search.addEventListener('input', filter);
    linksOnly.addEventListener('change', filter);
    document.getElementById('graph-reset').addEventListener('click', () => {
      selected = null; search.value = ''; linksOnly.checked = false; zoom = 1; pan = { x: 0, y: 0 };
      detail.replaceChildren();
      detail.textContent = '选择一个节点，查看它的关联。';
      transform(); layout(); filter();
    });
    document.getElementById('graph-zoom-in').addEventListener('click', () => scale(1.25));
    document.getElementById('graph-zoom-out').addEventListener('click', () => scale(1 / 1.25));
  }).catch(() => {
    status.textContent = '图谱暂时无法加载，请稍后刷新或通过文章归档阅读。';
  });
})();
