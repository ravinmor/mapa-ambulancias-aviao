// Script standalone pra testar o alerta de squawk de emergencia (R-15) sem
// esperar uma emergencia de verdade acontecer — resposta a Q-6/T-02 do
// CONTROLE_Aeronave_Amil.md (usuario escolheu "script/CLI separado" em vez
// de endpoint de debug ou painel admin, 2026-09-02: nenhuma rota nova fica
// exposta em lugar nenhum, so grava direto no Postgres via Prisma).
//
// O sync-job continua rodando normal: no proximo ciclo REAL dele (5-15min,
// ver TrackedAircraftConfig), o squawk daqui e sobrescrito pelo valor de
// verdade vindo do OpenSky — e so um valor de teste passageiro, nao uma
// flag persistente nem um modo especial.
//
// Uso (da pasta sync-job/, com DATABASE_URL apontando pro Postgres exposto
// pelo docker-compose em localhost:5434):
//   DATABASE_URL="postgres://postgres:postgres_local_dev@localhost:5434/vehicles" \
//     node scripts/set-squawk.mjs <icao24> <7500|7600|7700|clear>
//
// Sem argumentos, lista as aeronaves rastreadas e o squawk atual de cada
// uma, pra facilitar saber o que digitar.

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const VALID_VALUES = ['7500', '7600', '7700', 'clear'];

async function main() {
  const [icao24Arg, value] = process.argv.slice(2);

  const rows = await prisma.trackedAircraft.findMany({
    orderBy: { id: 'asc' },
    select: { icao24: true, callsign: true, label: true, squawk: true },
  });

  if (!icao24Arg || !value) {
    console.log('Uso: node scripts/set-squawk.mjs <icao24> <7500|7600|7700|clear>\n');
    console.log('Aeronaves rastreadas agora:');
    for (const r of rows) {
      console.log(`  ${r.icao24}  ${r.callsign ?? r.label ?? '(sem nome)'}  squawk atual: ${r.squawk ?? '-'}`);
    }
    process.exitCode = 1;
    return;
  }

  if (!VALID_VALUES.includes(value)) {
    console.error(`Valor invalido: "${value}". Use 7500, 7600, 7700 ou clear.`);
    process.exitCode = 1;
    return;
  }

  const icao24 = icao24Arg.toLowerCase();
  const match = rows.find((r) => r.icao24 === icao24);
  if (!match) {
    console.error(`icao24 "${icao24}" nao esta na lista de aeronaves rastreadas. Rode sem argumentos pra ver a lista.`);
    process.exitCode = 1;
    return;
  }

  const squawk = value === 'clear' ? null : value;
  await prisma.trackedAircraft.update({ where: { icao24 }, data: { squawk } });

  console.log(`OK: ${icao24} (${match.callsign ?? match.label ?? '?'}) agora com squawk = ${squawk ?? '(limpo)'}`);
  if (squawk) {
    console.log('Recarregue /aviacao-executiva — o marcador dessa aeronave deve ficar vermelho pulsando forte.');
  }
  console.log('Lembrete: o proximo ciclo real do sync-job sobrescreve com o squawk de verdade do OpenSky.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
