# syntax=docker/dockerfile:1
FROM node:26-bookworm AS build
WORKDIR /repo
RUN npm install -g pnpm@10.24.0
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm gen
RUN pnpm -C apps/app build
RUN npm_config_ignore_scripts=true pnpm deploy --legacy --filter @repo/app --prod /out

FROM node:26-bookworm-slim
WORKDIR /app
COPY --from=build /out .
ENV NODE_ENV=production \
    PORT=3010
EXPOSE 3010
CMD ["node", "dist/src/main.js"]
