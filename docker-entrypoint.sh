#!/bin/sh
set -e

# CF 挑战源需要驱动"有头"Chromium (无头会被 CF 判定为机器人)。容器内没有显示器,
# 故用 Xvfb 起一个虚拟显示并导出 DISPLAY; 若外部已提供 DISPLAY 则直接复用。
if [ -z "$DISPLAY" ] && command -v Xvfb >/dev/null 2>&1; then
  Xvfb :99 -screen 0 1280x1024x24 -nolisten tcp >/dev/null 2>&1 &
  export DISPLAY=:99
  # 等 Xvfb 就绪, 避免浏览器启动时抢跑
  for i in 1 2 3 4 5 6 7 8 9 10; do
    [ -e /tmp/.X11-unix/X99 ] && break
    sleep 0.3
  done
fi

# 如果是以 root 启动，自动修复挂载目录权限，并自动切换为 node 用户运行
if [ "$(id -u)" = "0" ]; then
  mkdir -p /app/data /app/public/uploads/avatars /app/data/cf-profile
  chown -R node:node /app/data /app/public/uploads
  chmod -R 775 /app/data /app/public/uploads
  # Xvfb 的 socket 建在 /tmp/.X11-unix, 降权后 node 用户要能连上
  chmod 1777 /tmp/.X11-unix 2>/dev/null || true
  exec gosu node node src/index.js "$@"
fi

# 默认直接以当前用户运行
exec node src/index.js "$@"
