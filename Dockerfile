# ---------- Build ----------
FROM node:22-alpine AS builder

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@12.15.0 --activate

# Dependencias antes do fonte: a camada de install e reaproveitada quando so o codigo muda.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY tsconfig*.json nest-cli.json ./
COPY src ./src

RUN pnpm build && pnpm prune --prod

# ---------- Runtime ----------
FROM node:22-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3001

# O securityContext do Deployment exige runAsUser 1001 e runAsNonRoot.
RUN addgroup -S -g 1001 app && adduser -S -u 1001 -G app app

COPY --from=builder --chown=app:app /app/node_modules ./node_modules
COPY --from=builder --chown=app:app /app/dist ./dist
COPY --from=builder --chown=app:app /app/package.json ./package.json

USER app

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3001/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/main.js"]
