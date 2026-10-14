# Novelia 后端 — 生产镜像
# 无原生依赖, 直接跑 Node 官方 alpine 镜像, 无需编译工具链。
FROM node:20-alpine

# 工作目录
WORKDIR /app

# 依赖层 (单独 COPY 以利用构建缓存)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# 应用代码 (data/ 与 public/ 由 .dockerignore 过滤掉运行时数据)
COPY . .

# 安装 su-exec (轻量级降权运行工具，启动时自动修复挂载目录权限并降权给 node 用户)
RUN apk add --no-cache su-exec

# 运行时数据目录 (users/redeem/bookpool 等落盘于此) 与头像上传目录
ENV NODE_ENV=production \
    PORT=7001 \
    DATA_DIR=/app/data \
    ADMIN_PATH=/admin
RUN mkdir -p /app/data /app/public/uploads/avatars \
    && chown -R node:node /app/data /app/public/uploads \
    && chmod +x /app/docker-entrypoint.sh

EXPOSE 7001

# 健康检查: 聚合搜索接口存活即视为健康
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||7001)+'/version').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/app/docker-entrypoint.sh"]

