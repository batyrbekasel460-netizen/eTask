FROM node:22-alpine AS production-dependencies
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build && npm run build:server

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN addgroup -S etask && adduser -S -G etask etask
COPY --from=production-dependencies --chown=etask:etask /app/node_modules ./node_modules
COPY --from=build --chown=etask:etask /app/dist ./dist
COPY --from=build --chown=etask:etask /app/dist-server ./dist-server
COPY --from=build --chown=etask:etask /app/package.json ./package.json
RUN mkdir -p storage/uploads && chown -R etask:etask storage
USER etask
EXPOSE 3000 4000
CMD ["node","dist-server/index.js"]
