# One image for the web app and the worker (different commands in docker-compose.yml).
FROM node:24-bookworm-slim AS base
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm install -g pnpm@11.10.0
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
# The build imports route modules; the database is not contacted at build time.
RUN DATABASE_URL=postgres://build:build@localhost:5432/build pnpm build

FROM base AS runner
ENV NODE_ENV=production
COPY --from=build --chown=node:node /app ./
RUN mkdir -p /app/uploads && chown node:node /app/uploads
USER node
EXPOSE 3000
CMD ["pnpm", "start"]
