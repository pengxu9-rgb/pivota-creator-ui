# syntax=docker/dockerfile:1
# creator.pivota.cc (Next.js 15) on Cloud Run. Node 22 matches the Vercel project.
FROM node:22-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Build-arg defaults ARE the production values (what the serving image was built with,
# read from its Cloud Build substitutions), so the deploy workflow, the PR build and a
# hand-run `gcloud builds submit` all build the same bundle.
ARG NEXT_PUBLIC_ACCOUNTS_BASE=https://creator.pivota.cc/accounts
ENV NEXT_PUBLIC_ACCOUNTS_BASE=$NEXT_PUBLIC_ACCOUNTS_BASE NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
# next/image is used and no `images.unoptimized` is set, so Next optimizes in-process.
RUN npm install --omit=dev sharp@0.34.3 && npm cache clean --force
RUN groupadd -g 1001 nodejs && useradd -u 1001 -g nodejs -m nextjs
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
RUN mkdir -p /app/.next/cache && chown -R nextjs:nodejs /app/.next
USER nextjs
ENV PORT=8080 HOSTNAME=0.0.0.0
EXPOSE 8080
CMD ["node", "server.js"]
