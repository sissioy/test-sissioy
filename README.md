# Sissioy Hexo Blog

`main` 保存可公开的 Hexo 源码，`gh-pages` 是 2022 年旧站的冻结快照。构建时会先恢复旧站，再用新 Hexo 输出覆盖首页、索引和置顶页，因此 45 个旧文章 URL 会继续可用。

## 写文章

在 `source/_posts/` 新建英文 kebab-case 文件：

```yaml
---
title: 文章标题
date: 2026-08-12 20:00:00
updated: 2026-08-12 20:00:00
tags:
  - Hexo
categories:
  - Learning-note
description: 一句话摘要。
---
```

配图放入同名资源目录。仓库是公开的，不要提交私密草稿、令牌或服务器凭据。

## 本地验证

```bash
npm ci
git fetch origin gh-pages:refs/remotes/origin/gh-pages
npm run ci
```

最终站点位于 `dist/`。`npm run ci` 会运行旧资源重写测试、生成合并站点并检查内部静态资源。

## 自动部署

推送 `main` 会触发 `.github/workflows/deploy.yml`。仓库需要以下 Actions Secrets：

- `HOSTWINDS_DEPLOY_HOST`
- `HOSTWINDS_DEPLOY_USER`
- `HOSTWINDS_DEPLOY_KEY`
- `HOSTWINDS_KNOWN_HOSTS`

首篇非 `legacy` 文章出现前，新构建只进入服务器 release 目录，不切换旧首页。首次真实文章发布后，`current` 软链接才会切到新站。

## 菜单栏助手

`tooling/install-menu-app.sh` 构建 ARM64 App，安装到 `~/Applications/Hexo Publisher.app` 并注册用户级 LaunchAgent。左键发布，右键打开仓库、日志或退出。
