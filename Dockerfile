# Wellbeing — Next.js 16 standalone image.
#
# The same image serves two roles in the cluster: the `migrate` init container
# runs `node migrate.mjs`, the app container runs `node server.js`. That way
# schema and code always ship together.
FROM node:22-alpine AS base
# tzdata is not optional: the Helm chart sets TZ=Europe/Berlin on the app
# container, and without the zone files musl cannot resolve it, so TZ silently
# does nothing. Every day computation goes through Intl with an explicit zone
# (ICU carries its own tz database), so this is harmless today — but the first
# getHours() without a zone would be UTC in production and Berlin in dev.
RUN apk add --no-cache libc6-compat tzdata

FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build
# Standalone output tracing does NOT pick up src/db/migrate.ts (no route imports
# it) nor drizzle/*.sql (read at runtime by path). Bundle the migrator
# explicitly; the SQL folder is COPYed below.
RUN npx esbuild src/db/migrate.ts \
      --bundle --platform=node --format=esm --target=node22 \
      --outfile=migrate.mjs

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 --ingroup nodejs nextjs
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/drizzle ./drizzle
COPY --from=builder --chown=nextjs:nodejs /app/migrate.mjs ./migrate.mjs
USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
