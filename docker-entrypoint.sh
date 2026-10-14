#!/bin/sh
set -e

# 如果是以 root 启动，自动修复挂载目录权限，并自动切换为 node 用户运行
if [ "$(id -u)" = "0" ]; then
  mkdir -p /app/data /app/public/uploads/avatars
  chown -R node:node /app/data /app/public/uploads
  chmod -R 775 /app/data /app/public/uploads
  exec su-exec node node src/index.js "$@"
fi

# 默认直接以当前用户运行
exec node src/index.js "$@"
