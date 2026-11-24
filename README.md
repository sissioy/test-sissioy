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

### 发布前敏感信息检查

菜单栏助手会检查相对于 `HEAD` 新增和修改的 Markdown 文章，并扫描每篇文章的完整内容。它会通过本机 LM Studio 启动
`Qwen3-8B`（Q4_K_M；可用 `HEXO_REDACTION_MODEL` 指定其他已下载模型），
结合确定性规则，将公网 IP、UUID、用户绝对路径和常见凭据替换为公开占位符。未改动的文章、图片和附件不会自动检查。

允许公开的示例值可以写入仅保存在本机的：

```text
~/Library/Application Support/HexoPublisher/redaction-allowlist.json
```

内容格式为：

```json
{
  "literals": ["203.0.113.10", "550e8400-e29b-41d4-a716-446655440000"]
}
```

只有模型和所有分块都成功返回有效结构化结果时，文章才会被修改。改写前的原文保存在
`~/Library/Application Support/HexoPublisher/RedactionBackups/`，权限仅限当前用户，30 天后自动清理。

如果模型无法启动、超时或输出无效，检查会失败并阻止发布，所有文章保持原样。文件读取、备份或写入失败也会阻止发布。只有检查成功后才会继续构建、提交和推送；菜单栏在失败时显示“发布失败，右键查看日志”。

可以手工对新增和修改的文章执行同样的脱敏流程：

```bash
npm run redact:changed
```

可以手工执行一次只读的全库审计；发现敏感内容时命令返回状态码 2，不会修改文章：

```bash
npm run audit:sensitive
```

### 知识图谱与双向链接

`/graph/` 展示全部已发布文章（包括 45 篇旧文章）、标签和分类。支持搜索、拖动、缩放和只看正文引用。
每篇文章底部自动显示本文引用、反向链接以及拥有共同标签或分类的文章。未改动的旧文章源码保持冻结，关联信息在构建输出中追加。

文章中可以使用 `[[文章标题]]`、`[[slug|显示文字]]` 或普通 Markdown 链接。双链只会解析到已发布文章，未发布目标仅显示文字。
图谱只从公开文章生成，不会读取 Obsidian 私人知识库；后续文章在构建时自动加入。

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

修改助手源码后，重新运行安装脚本即可更新菜单栏程序。
