# Build the frontend, then run it and the API server from one small image.
# The same image runs the migrations job (command: node server/migrate.js).

FROM node:24-alpine AS web
WORKDIR /web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server ./server
COPY db ./db
COPY --from=web /web/dist ./web/dist
USER node
EXPOSE 8080
CMD ["node", "server/index.ts"]
