FROM node:22-bookworm-slim AS build
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates openssl && rm -rf /var/lib/apt/lists/* && corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY packages/database/package.json packages/database/package.json
RUN pnpm install --frozen-lockfile
COPY apps/api apps/api
COPY packages/database packages/database
COPY tsconfig.base.json eslint.config.mjs ./
RUN pnpm --filter @digital-mandal/api build

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates openssl && rm -rf /var/lib/apt/lists/* \
  && corepack enable && groupadd --system samavet && useradd --system --gid samavet --create-home samavet
WORKDIR /app
COPY --from=build --chown=samavet:samavet /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./
COPY --from=build --chown=samavet:samavet /app/node_modules ./node_modules
COPY --from=build --chown=samavet:samavet /app/apps/api/package.json ./apps/api/package.json
COPY --from=build --chown=samavet:samavet /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=build --chown=samavet:samavet /app/apps/api/dist ./apps/api/dist
COPY --from=build --chown=samavet:samavet /app/packages/database ./packages/database
USER samavet
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||process.env.API_PORT||4000)+'/api/v1/health/live').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "apps/api/dist/main.js"]
