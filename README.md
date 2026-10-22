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

菜单栏助手只检查尚未出现在 `HEAD` 中的新增 Markdown 文章。它会通过本机 LM Studio 启动
`osmapi/Qwen3.6-27B-Claude-Opus-Reasoning-Distill-v2-abliterated-OptiQ-3.7bpw-mlx`，
结合确定性规则，将公网 IP、UUID、用户绝对路径和常见凭据替换为公开占位符。已存在文章的修改、图片和附件不会自动检查。

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

如果模型无法启动、超时或输出无效，本次检查会被完全跳过，文章保持原样并照常公开发布；菜单栏会显示黄色的“已发布，但未检查敏感信息”状态。文件读取、备份或写入失败仍会阻止发布。

可以手工执行一次只读的全库审计；发现敏感内容时命令返回状态码 2，不会修改文章：

```bash
npm run audit:sensitive
```

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
