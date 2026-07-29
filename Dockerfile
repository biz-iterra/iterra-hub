# syntax=docker/dockerfile:1

# ============================================================
# iterra-hub — NAS(Docker) 実行用イメージ
# ターゲット: linux/amd64（UGREEN DXP4800 GT / AMD Ryzen Embedded R2514）
#
# ビルドは GitHub Actions で行い、NAS は GHCR から pull する運用を前提とする
# （NAS 上の next build はメモリを要するため）。
# ============================================================

FROM node:24-alpine AS base
# Next.js の一部依存が glibc 互換を必要とする / TZ 設定に tzdata が必要
RUN apk add --no-cache libc6-compat tzdata
ENV NEXT_TELEMETRY_DISABLED=1

# ---- 依存解決 ------------------------------------------------
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---- ビルド --------------------------------------------------
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# NEXT_PUBLIC_* はクライアントバンドルに焼き込まれるためビルド時に必要。
# 変更した場合はイメージの再ビルドが要る（ランタイム注入では反映されない）。
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL}
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=${NEXT_PUBLIC_SUPABASE_ANON_KEY}

RUN npm run build

# ---- 実行 ----------------------------------------------------
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    TZ=Asia/Tokyo

RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 --ingroup nodejs nextjs

# standalone は public と .next/static を含まないため個別にコピーする
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000

# SUPABASE_SERVICE_ROLE_KEY はサーバー側でのみ使うためランタイムで注入する
CMD ["node", "server.js"]
