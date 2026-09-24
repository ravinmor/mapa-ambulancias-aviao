FROM node:20-alpine AS builder
WORKDIR /app
# Alpine nao vem com OpenSSL — sem isso o binario engine do Prisma falha ao
# rodar (erro "Could not parse schema engine response").
RUN apk add --no-cache openssl
COPY package.json ./
COPY prisma ./prisma
COPY prisma-resgate ./prisma-resgate
RUN npm install
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:20-alpine
WORKDIR /app
RUN apk add --no-cache openssl
COPY package.json ./
COPY prisma ./prisma
COPY prisma-resgate ./prisma-resgate
RUN npm install --omit=dev
COPY --from=builder /app/dist ./dist
# Migra o schema antes de iniciar — com retry, pois o Postgres pode ainda nao
# estar pronto (K8s nao tem "espera por servico saudavel" nativa como o
# healthcheck do docker-compose). Idempotente: se sync-job ja migrou, essa
# chamada so confirma que nao ha nada pendente e segue.
# Migration do resgate so roda se RESGATE_DATABASE_URL estiver setada — essa
# env var ainda nao existe em todo ambiente (feature nova, ver
# CONTEXTO_SESSAO_2026-09-24_MissaoAerea_Resgate_DB.md), e o resto da api
# (map-postgres) nao pode ficar bloqueado esperando um banco que nem vai
# subir ainda.
CMD ["sh", "-c", "until npx prisma migrate deploy; do echo '[migrate] aguardando Postgres...'; sleep 2; done; if [ -n \"$RESGATE_DATABASE_URL\" ]; then until npx prisma migrate deploy --schema=prisma-resgate/schema; do echo '[migrate:resgate] aguardando Postgres...'; sleep 2; done; fi; node dist/index.js"]
