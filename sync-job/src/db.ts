import { PrismaClient } from '@prisma/client';

// Sem retry de conexao aqui de proposito — o Dockerfile roda "prisma migrate
// deploy" (com o proprio retry) antes de iniciar o processo, entao por aqui o
// Postgres ja esta garantidamente pronto e migrado.
export const prisma = new PrismaClient();
