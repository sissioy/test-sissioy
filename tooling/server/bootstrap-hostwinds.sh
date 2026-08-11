#!/usr/bin/env bash
set -euo pipefail

deploy_public_key="${DEPLOY_PUBLIC_KEY:?DEPLOY_PUBLIC_KEY is required}"
deploy_user="hexo-deploy"
deploy_root="/var/www/hexo-blog"
legacy_root="/var/www/sissioy"
nginx_config="/usr/local/nginx/conf/nginx.conf"
nginx_binary="/usr/local/nginx/sbin/nginx"

if ! id "$deploy_user" >/dev/null 2>&1; then
  useradd --system --create-home --shell /bin/bash "$deploy_user"
fi

deploy_home="$(getent passwd "$deploy_user" | cut -d: -f6)"
install -d -m 700 -o "$deploy_user" -g "$deploy_user" "$deploy_home/.ssh"
touch "$deploy_home/.ssh/authorized_keys"
if ! grep -qxF "$deploy_public_key" "$deploy_home/.ssh/authorized_keys"; then
  printf '%s\n' "$deploy_public_key" >> "$deploy_home/.ssh/authorized_keys"
fi
chown "$deploy_user:$deploy_user" "$deploy_home/.ssh/authorized_keys"
chmod 600 "$deploy_home/.ssh/authorized_keys"

install -d -m 755 -o "$deploy_user" -g "$deploy_user" "$deploy_root"
install -d -m 755 -o "$deploy_user" -g "$deploy_user" "$deploy_root/releases" "$deploy_root/incoming"
if [ ! -e "$deploy_root/current" ]; then
  ln -s "$legacy_root" "$deploy_root/current"
  chown -h "$deploy_user:$deploy_user" "$deploy_root/current"
fi

if grep -q 'root /var/www/sissioy;' "$nginx_config"; then
  cp -a "$nginx_config" "$nginx_config.pre-hexo-blog"
  sed -i 's#root /var/www/sissioy;#root /var/www/hexo-blog/current;#' "$nginx_config"
fi
grep -q 'root /var/www/hexo-blog/current;' "$nginx_config"
"$nginx_binary" -t
"$nginx_binary" -s reload

echo "Hostwinds deployment account and atomic document root are ready."
