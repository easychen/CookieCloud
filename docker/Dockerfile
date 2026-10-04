FROM --platform=$TARGETPLATFORM node:16-alpine3.15
EXPOSE 8088
RUN mkdir -p /data/api
COPY app.js /data/api/app.js
COPY server-keep-alive.cjs /data/api/server-keep-alive.cjs
COPY package.json /data/api/package.json
COPY package-lock.json /data/api/package-lock.json
RUN npm ci --omit=dev --prefix /data/api
CMD ["node", "/data/api/app.js"]
