# build context: ./api  (docker buildx build -f docker/Dockerfile ./api)
# 按目标架构选基础镜像：node:24-alpine 没有 arm/v7 和 ppc64le，
# arm/v7 用 node:22-alpine，ppc64le 用 node:24-slim
FROM node:24-alpine AS base-amd64
FROM node:24-alpine AS base-arm64
FROM node:24-alpine AS base-s390x
FROM node:22-alpine AS base-arm
FROM node:24-slim AS base-ppc64le

FROM base-${TARGETARCH}
ENV NODE_ENV=production
WORKDIR /data/api
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY app.js ./
COPY utils ./utils
EXPOSE 8088
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8088)+(process.env.API_ROOT||'').replace(/\/+$/,'')+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "app.js"]
