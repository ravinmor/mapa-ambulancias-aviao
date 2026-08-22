"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.prisma = void 0;
const client_1 = require("@prisma/client");
// Sem retry de conexao aqui de proposito — o Dockerfile roda "prisma migrate
// deploy" (com o proprio retry) antes de iniciar o processo, entao por aqui o
// Postgres ja esta garantidamente pronto e migrado.
exports.prisma = new client_1.PrismaClient();
