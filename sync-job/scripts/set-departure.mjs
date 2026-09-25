// Script standalone pra testar o alerta "prestes a decolar" (v4,
// 2026-09-24) sem esperar o horario previsto de verdade chegar — mesmo
// padrao do set-squawk.mjs (usuario ja escolheu esse caminho antes, Q-6:
// "script/CLI separado", grava direto no Postgres via Prisma, nenhuma rota
// de debug nova).
//
// PRE-REQUISITO: precisa existir uma solicitacao REAL ativa (nao Cancelada/
// Concluida) ja vinculada a essa aeronave no fluxo PA-RESGATE-
// GerenciaSolicitacoes — esse script so forca o HORARIO, quem decide se a
// missao esta ativa e' sempre o proximo ciclo real do sync-job
// (aircraftScheduling.ts), que roda de novo a cada 5s (AIRCRAFT_SCHEDULING_
// SYNC_INTERVAL_MS) e vai reler a solicitacao vinculada.
//
// O que o script faz: grava `scheduledDepartureAt` no passado (ou no
// instante que voce passar) e limpa `departureAlertMissionId`/
// `departureAlertAt` (pra poder disparar de novo, caso ja tenha disparado
// antes nessa mesma missao). No PROXIMO ciclo real (ate 5s depois), o
// sync-job ve' que `scheduledDepartureAt` ja esta preenchido (nao rebusca
// via obterUma) e dispara so' pelo horario (SEM cruzar com telemetria —
// removido 2026-09-25, pedido do usuario: o alerta precisa avisar a
// operacao pra monitorar a aeronave ENQUANTO ela ainda esta na base, nao so'
// depois de decolar de verdade).
//
// Uso (da pasta sync-job/, com DATABASE_URL apontando pro Postgres exposto
// pelo docker-compose em localhost:5434):
//   DATABASE_URL="postgres://postgres:postgres_local_dev@localhost:5434/vehicles" \
//     node scripts/set-departure.mjs <icao24-ou-reg-N> [minutos-no-passado]
//
// Sem argumentos, lista as aeronaves com agendamento ativo (scheduledAt
// preenchido) e o estado atual do alerta de decolagem de cada uma.

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const [key, minutosArg] = process.argv.slice(2);

  const rows = await prisma.trackedAircraft.findMany({
    where: { scheduledAt: { not: null } },
    orderBy: { id: 'asc' },
    select: {
      icao24: true,
      scheduledAircraftName: true,
      scheduledPatientName: true,
      scheduledMissionId: true,
      scheduledDepartureAt: true,
      departureAlertMissionId: true,
      departureAlertAt: true,
    },
  });

  if (!key) {
    console.log('Uso: node scripts/set-departure.mjs <icao24-ou-reg-N> [minutos-no-passado, default 1]\n');
    console.log('Aeronaves com agendamento ativo agora:');
    if (rows.length === 0) console.log('  (nenhuma — atribua uma missao no fluxo primeiro)');
    for (const r of rows) {
      const disparou = r.departureAlertAt ? `disparou em ${r.departureAlertAt.toISOString()}` : 'ainda nao disparou';
      console.log(
        `  ${r.icao24}  ${r.scheduledAircraftName ?? '(sem nome)'}  missao #${r.scheduledMissionId}  paciente ${r.scheduledPatientName ?? '-'}  previsto: ${r.scheduledDepartureAt?.toISOString() ?? '(ainda nao buscado)'}  ${disparou}`,
      );
    }
    process.exitCode = 1;
    return;
  }

  const icao24 = key.toLowerCase();
  const match = rows.find((r) => r.icao24 === icao24);
  if (!match) {
    console.error(`"${icao24}" nao tem agendamento ativo. Rode sem argumentos pra ver a lista.`);
    process.exitCode = 1;
    return;
  }

  const minutosNoPassado = Number(minutosArg ?? 1);
  const scheduledDepartureAt = new Date(Date.now() - minutosNoPassado * 60_000);

  await prisma.trackedAircraft.update({
    where: { icao24 },
    data: { scheduledDepartureAt, departureAlertMissionId: null, departureAlertAt: null },
  });

  console.log(`OK: ${icao24} (${match.scheduledAircraftName ?? '?'}) agora com scheduledDepartureAt = ${scheduledDepartureAt.toISOString()} (${minutosNoPassado}min atras).`);
  console.log('Aguarde ate 5s (proximo ciclo real do sync-job) e confira o log (`docker compose logs -f sync-job`) ou GET /api/tracked-aircraft.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
