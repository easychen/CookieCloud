FROM --platform=$TARGETPLATFORM node:16-alpine3.15
EXPOSE 8088
RUN mkdir -p /data/api
WORKDIR /data/api
COPY api/package.json ./package.json
RUN npm install
COPY api/app.js ./app.js
CMD ["node", "app.js"]
