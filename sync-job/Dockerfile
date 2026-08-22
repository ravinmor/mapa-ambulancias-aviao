FROM node:20-alpine AS builder
WORKDIR /app
# Alpine nao vem com OpenSSL — sem isso o binario engine do Prisma falha ao
# rodar (erro "Could not parse schema engine response").
RUN apk add --no-cache openssl
COPY package.json ./
COPY prisma ./prisma
RUN npm install
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:20-alpine
WORKDIR /app
RUN apk add --no-cache openssl
COPY package.json ./
COPY prisma ./prisma
RUN npm install --omit=dev
COPY --from=builder /app/dist ./dist
# Migra o schema antes de iniciar — com retry, pois o Postgres pode ainda nao
# estar pronto (K8s nao tem "espera por servico saudavel" nativa como o
# healthcheck do docker-compose).
CMD ["sh", "-c", "until npx prisma migrate deploy; do echo '[migrate] aguardando Postgres...'; sleep 2; done; node dist/index.js"]
