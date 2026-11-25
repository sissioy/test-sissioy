#!/bin/zsh
set -euo pipefail

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
export GIT_TERMINAL_PROMPT=0 GH_PROMPT_DISABLED=1
repo_dir="$(cd "$(dirname "$0")/.." && pwd)"
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

github_git() {
  git -c credential.helper= -c 'credential.helper=!gh auth git-credential' \
    -c http.lowSpeedLimit=1 -c http.lowSpeedTime=20 "$@"
}

github_git fetch origin main
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

npm run redact:changed

preview_dir="$(mktemp -d)"
preview_tree="$preview_dir/site"
cleanup_preview() {
  if [ -f "$preview_tree/.git" ]; then
    git worktree remove --force -- "$preview_tree"
  fi
  rm -f -- "$preview_dir/index"
  rmdir -- "$preview_dir"
}
trap cleanup_preview EXIT

# Build the committed site plus this batch of articles, using a temporary index.
GIT_INDEX_FILE="$preview_dir/index" git read-tree "$local_sha"
GIT_INDEX_FILE="$preview_dir/index" git add -A -- source/_posts
candidate_tree="$(GIT_INDEX_FILE="$preview_dir/index" git write-tree)"
if [ "$candidate_tree" = "$(git rev-parse "$local_sha^{tree}")" ]; then
  echo "文章目录没有可提交改动。"
  exit 10
fi

git worktree add --detach --quiet -- "$preview_tree" "$local_sha"
git -C "$preview_tree" read-tree --reset -u "$candidate_tree"
ln -s "$repo_dir/node_modules" "$preview_tree/node_modules"
(cd "$preview_tree" && npm run ci)

node tooling/validate-publish-state.mjs
if [ "$(git rev-parse HEAD)" != "$local_sha" ]; then
  echo "构建期间当前提交已改变，请重新发布。"
  exit 20
fi
GIT_INDEX_FILE="$preview_dir/index" git add -A -- source/_posts
if [ "$(GIT_INDEX_FILE="$preview_dir/index" git write-tree)" != "$candidate_tree" ]; then
  echo "构建期间文章已改变，请重新发布。"
  exit 20
fi
git add -A -- source/_posts
commit_message="post: publish $(date '+%Y-%m-%d %H:%M')"
git commit -m "$commit_message"
published_sha="$(git rev-parse HEAD)"
if [ "$(git rev-parse "$published_sha^{tree}")" != "$candidate_tree" ]; then
  echo "发布提交与构建检查的文件不一致，请检查本地提交。"
  exit 20
fi
github_git push origin "${published_sha}:refs/heads/main"

run_id=""
for attempt in {1..24}; do
  run_id="$(gh run list --workflow deploy.yml --event push --branch main --commit "$published_sha" --limit 1 --json databaseId --jq '.[0].databaseId // empty')"
  [ -n "$run_id" ] && break
  sleep 5
done
if [ -z "$run_id" ]; then
  echo "未找到对应的 GitHub Actions 运行。"
  exit 30
fi

gh run watch "$run_id" --exit-status
curl --fail --silent --show-error --connect-timeout 10 --max-time 20 --retry 3 \
  "https://www.sissioy.top/deployment-manifest.json?v=$published_sha" |
  node -e '
    const manifest = JSON.parse(require("node:fs").readFileSync(0, "utf8"));
    if (manifest.commit !== process.argv[1]) throw new Error("线上版本与发布提交不一致。");
  ' "$published_sha"
echo "[$(date '+%Y-%m-%d %H:%M:%S')] 线上发布成功"
