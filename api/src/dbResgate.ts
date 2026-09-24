// Client Prisma separado do db.ts principal (map-postgres) — aponta pro
// banco `resgate`, gerado a partir de api/prisma-resgate/ (schema proprio,
// migrations proprias). Ver package.json (scripts migrate:resgate:*) e
// CONTEXTO_SESSAO_2026-09-24_MissaoAerea_Resgate_DB.md.
//
// Import do output custom do generator (nao e o @prisma/client default,
// que continua sendo o do map-postgres) — path resolve pro pacote gerado
// em node_modules/.prisma/client-resgate (ver output em
// prisma-resgate/schema/schema.prisma).
import { PrismaClient } from '../node_modules/.prisma/client-resgate';
import config from './config';

// null quando RESGATE_DATABASE_URL nao esta setada — deploys existentes do
// container nao quebram so por essa feature nova ainda nao ter a env var
// configurada. Rotas que dependem disso devem checar antes de usar (ver
// requireResgateDb em missaoAerea.ts).
export const prismaResgate: InstanceType<typeof PrismaClient> | null = config.resgateDatabaseUrl
  ? new PrismaClient({ datasources: { db: { url: config.resgateDatabaseUrl } } })
  : null;
