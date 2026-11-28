# syntax=docker/dockerfile:1

# Base image digests resolved from the Docker Hub v2 API on 2026-11-26; bump
# them with the tags when Node or Debian move.
FROM node:26-bookworm@sha256:893ea48106e988a5f91e69629d6472600daa9d0494adf7db87eb0b886ce82255 AS build
WORKDIR /repo
RUN npm install -g pnpm@10.24.0
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm gen
RUN pnpm -C apps/app build
RUN npm_config_ignore_scripts=true pnpm deploy --legacy --filter @repo/app --prod /out

FROM node:26-bookworm-slim@sha256:0042e17d232a87a2cd485be1da7900fca4d10a4ad11b29e9285da1d2e54798c9
WORKDIR /app
COPY --from=build /out .
COPY --chmod=555 deploy/railway/entrypoint.sh /usr/local/bin/railway-entrypoint
ENV NODE_ENV=production \
    PORT=3010
EXPOSE 3010
HEALTHCHECK --interval=30s --timeout=5s --start-period=75s --retries=3 \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||3010)+'/api/health').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/usr/local/bin/railway-entrypoint"]
CMD ["node", "dist/src/main.js"]
