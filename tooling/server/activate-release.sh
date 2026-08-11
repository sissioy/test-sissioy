#!/usr/bin/env bash
set -euo pipefail

commit_sha="${1:?commit SHA is required}"
deploy_root="/var/www/hexo-blog"
incoming_archive="$deploy_root/incoming/$commit_sha.tar.gz"
release_dir="$deploy_root/releases/$commit_sha"
release_tmp="$deploy_root/releases/.$commit_sha.tmp"
current_link="$deploy_root/current"
previous_link="$deploy_root/previous"
legacy_root="/var/www/sissioy"

case "$commit_sha" in
  *[!0-9a-f]*) echo "Invalid commit SHA" >&2; exit 2 ;;
esac

test -f "$incoming_archive"
rm -rf "$release_tmp"
mkdir -p "$release_tmp"
cleanup_release_tmp() {
  rm -rf "$release_tmp"
}
trap cleanup_release_tmp EXIT
tar -xzf "$incoming_archive" -C "$release_tmp"
test -s "$release_tmp/index.html"
test -s "$release_tmp/archives/a5547e95.html"
test -s "$release_tmp/archives/c895e024.html"
test -s "$release_tmp/deployment-manifest.json"

new_post_count="$(node -e "const m=require(process.argv[1]); process.stdout.write(String(m.newPostCount))" "$release_tmp/deployment-manifest.json")"
case "$new_post_count" in
  ''|*[!0-9]*) echo "Invalid newPostCount" >&2; exit 3 ;;
esac

if [ -e "$release_dir" ]; then
  rm -rf "$release_tmp"
else
  mv "$release_tmp" "$release_dir"
fi
trap - EXIT
rm -f "$incoming_archive"

current_target="$(readlink -f "$current_link" 2>/dev/null || true)"
if [ -z "$current_target" ]; then
  ln -s "$legacy_root" "$current_link"
  current_target="$legacy_root"
fi

if [ "$new_post_count" -eq 0 ] && [ "$current_target" = "$legacy_root" ]; then
  echo "STAGED_WITHOUT_ACTIVATION $commit_sha"
  exit 0
fi

ln -sfn "$current_target" "$previous_link.next"
mv -Tf "$previous_link.next" "$previous_link"
ln -sfn "$release_dir" "$current_link.next"
mv -Tf "$current_link.next" "$current_link"

rollback() {
  ln -sfn "$current_target" "$current_link.rollback"
  mv -Tf "$current_link.rollback" "$current_link"
  echo "ROLLED_BACK $commit_sha" >&2
}
trap rollback ERR

curl --fail --silent --show-error --max-time 15 --resolve www.sissioy.top:443:127.0.0.1 https://www.sissioy.top/ >/dev/null
curl --fail --silent --show-error --max-time 15 --resolve www.sissioy.top:443:127.0.0.1 https://www.sissioy.top/archives/a5547e95.html >/dev/null
first_new_path="$(node -e "const m=require(process.argv[1]); process.stdout.write(m.newPostPaths[0] || '')" "$release_dir/deployment-manifest.json")"
if [ -n "$first_new_path" ]; then
  curl --fail --silent --show-error --max-time 15 --resolve www.sissioy.top:443:127.0.0.1 "https://www.sissioy.top/$first_new_path" >/dev/null
fi

trap - ERR

find "$deploy_root/releases" -mindepth 1 -maxdepth 1 -type d -printf '%T@ %p\n' \
  | sort -nr \
  | tail -n +6 \
  | cut -d' ' -f2- \
  | while IFS= read -r old_release; do
      [ -z "$old_release" ] && continue
      [ "$(readlink -f "$current_link")" = "$old_release" ] && continue
      [ "$(readlink -f "$previous_link")" = "$old_release" ] && continue
      rm -rf "$old_release"
    done

echo "ACTIVATED $commit_sha"
