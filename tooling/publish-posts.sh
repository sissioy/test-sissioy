#!/bin/zsh
set -euo pipefail

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
repo_dir="/Users/syo/Documents/ChatGPT/hexo-blog"
log_dir="$HOME/Library/Logs/HexoPublisher"
mkdir -p "$log_dir"
log_file="$log_dir/publish.log"
exec > >(tee -a "$log_file") 2>&1

echo "[$(date '+%Y-%m-%d %H:%M:%S')] 开始发布"
cd "$repo_dir"

set +e
node tooling/validate-publish-state.mjs
state_exit=$?
set -e
if [ "$state_exit" -eq 10 ]; then
  echo "没有需要发布的文章改动。"
  exit 10
fi
if [ "$state_exit" -ne 0 ]; then
  exit "$state_exit"
fi

git fetch origin main
local_sha="$(git rev-parse HEAD)"
remote_sha="$(git rev-parse origin/main)"
if [ "$local_sha" != "$remote_sha" ]; then
  if git merge-base --is-ancestor "$local_sha" "$remote_sha"; then
    git merge --ff-only origin/main
  else
    echo "main 与 origin/main 已分叉或本地领先，请手工处理。"
    exit 20
  fi
fi

npm run ci
git add -A -- source/_posts
if git diff --cached --quiet; then
  echo "构建完成，但文章目录没有可提交改动。"
  exit 10
fi

commit_message="post: publish $(date '+%Y-%m-%d %H:%M')"
git commit -m "$commit_message"
git push origin main
published_sha="$(git rev-parse HEAD)"

run_id=""
for attempt in {1..24}; do
  run_id="$(gh run list --workflow deploy.yml --branch main --commit "$published_sha" --limit 1 --json databaseId --jq '.[0].databaseId // empty')"
  [ -n "$run_id" ] && break
  sleep 5
done
if [ -z "$run_id" ]; then
  echo "未找到对应的 GitHub Actions 运行。"
  exit 30
fi

gh run watch "$run_id" --exit-status
echo "[$(date '+%Y-%m-%d %H:%M:%S')] 线上发布成功"
