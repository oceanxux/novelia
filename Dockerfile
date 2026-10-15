# Novelia 后端 — 生产镜像
#
# 基础镜像用 Debian slim 而非 alpine: 本项目的 CF 挑战源 (半夏/茶马) 依赖 patchright
# 驱动有头 Chromium, 而 Playwright/patchright 官方不支持 alpine (musl)。
#
# 有头模式是过 CF 的硬性要求 (无头 Chromium 会被直接判定为机器人), 容器内无显示器,
# 故用 Xvfb 提供虚拟显示 (见 docker-entrypoint.sh)。
FROM node:20-bookworm-slim

WORKDIR /app

# 依赖层 (单独 COPY 以利用构建缓存)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# 应用代码 (data/ 与 public/ 由 .dockerignore 过滤掉运行时数据)
COPY . .

# 安装 Xvfb (虚拟显示) + gosu (降权运行) + 浏览器系统依赖, 并把 patchright 自带
# Chromium 装到共享路径 (--with-deps 会装上 Chromium 运行所需的全部 .so)。
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
RUN apt-get update \
    && apt-get install -y --no-install-recommends xvfb gosu ca-certificates \
    && npx patchright install --with-deps chromium --no-shell \
    && apt-get clean && rm -rf /var/lib/apt/lists/* \
    && chmod -R 755 /ms-playwright

# 运行时数据目录 (users/redeem/bookpool 等落盘于此) 与头像上传目录
ENV NODE_ENV=production \
    PORT=7001 \
    DATA_DIR=/app/data \
    ADMIN_PATH=/admin \
    CF_PROFILE=/app/data/cf-profile
RUN mkdir -p /app/data /app/public/uploads/avatars /app/data/cf-profile \
    && chown -R node:node /app/data /app/public/uploads \
    && chmod +x /app/docker-entrypoint.sh

EXPOSE 7001

# 健康检查: 聚合搜索接口存活即视为健康
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||7001)+'/version').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/app/docker-entrypoint.sh"]
