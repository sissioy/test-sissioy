---
title: Hexo 部署成功后，为什么线上还在用旧 CSS？
date: 2026-11-25 16:38:00
tags:
  - Hexo
  - Cloudflare
  - 前端
categories:
  - Learning note
description: 记录一次首页样式没更新的排查，从浏览器实际请求的 CSS 查到 CDN 缓存，再用内容哈希给样式表加版本。
---

博客迁站后，有几张文章卡片变成了直角。我补上原来的 20 像素圆角，GitHub Actions 也报告部署成功，但重新打开首页，卡片仍然是直角。最后在同一个 Chrome 页面里做了对照。加载首页原本引用的 CSS 时，浏览器算出的圆角是 `0px`。只把样式表 URL 换成带版本参数的地址，圆角就变成了 `20px`。

<!-- more -->

## 先查页面实际请求的地址

第一次验收时，我直接打开了带版本参数的 CSS，确认里面有新规则。访客打开首页时，HTML 仍然引用 `/css/main.css`。这两个请求可以得到不同的响应，所以排查要从 DevTools 的 **Network** 面板开始，找到页面加载的样式表，复制完整的 Request URL。

可以用下面的命令查看那个 URL 的响应头。把例子里的地址换成 Network 面板里的地址。

```sh
css_url='https://www.sissioy.top/css/main.css'
curl -fsS -D - -o /dev/null "$css_url" |
  grep -Ei '^(HTTP/|cf-cache-status:|age:|cache-control:|last-modified:|etag:)'
```

这次首页的 `Last-Modified` 是当天 16:22，样式表却停在前一天。CSS 响应还带着 `Age: 1596` 和 `Cache-Control: max-age=14400`。`Age` 表明响应来自 Cloudflare 缓存。再对照两个地址的 CSS 内容和浏览器算出的圆角，就能确认旧样式是怎么被用上的。[Cloudflare 缓存响应说明](https://developers.cloudflare.com/cache/concepts/cache-responses/)

## 把 CSS 内容版本写进 HTML

构建时对生成的 `css/main.css` 计算 SHA-256，取前 16 个十六进制字符作为版本，把 HTML 中的样式地址改成类似 `/css/main.css?v=09c1c6616ace055a`。如果页面预加载这张样式表，预加载和正式加载也要使用同一个地址。

这样，发一篇文章时可以继续复用原来的 CSS 缓存。修改样式时，页面会引用一个新地址。Cloudflare 的默认缓存键包含查询参数。如果站点配置为忽略查询参数，就把哈希写进文件名，例如 `main.09c1c6616ace055a.css`。[Cloudflare 缓存键说明](https://developers.cloudflare.com/cache/how-to/cache-keys/)

我把构建检查也补上了，让它逐页核对首页和分页中写入的 CSS 版本是否与文件内容一致。上线后再从访客打开的首页重复检查一遍，确认页面请求了带版本的样式，并在 DevTools 的 **Computed** 面板看到卡片的 `border-radius` 是 `20px`。
