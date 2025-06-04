FROM --platform=$TARGETPLATFORM node:16-alpine3.15
EXPOSE 8088
WORKDIR /data/api
COPY api/package.json ./package.json
COPY api/yarn.lock ./yarn.lock
RUN npm install
COPY api/ ./
CMD ["node", "app.js"]
