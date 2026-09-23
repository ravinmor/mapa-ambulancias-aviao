import config from './config';
import { prisma } from './db';
import { fetchAeronaves } from './sources/solicitacoesAeronaves';

// Deteccao de agendamento de voo (2026-09-22, "primeiro passo" pedido pelo
// usuario) — cruza o fluxo PA-RESGATE-GerenciaSolicitacoes (d_Cadastro_
// Aeronaves, ver solicitacoesAeronaves.ts) com a aeronave rastreada por
// ICAO24 (TrackedAircraft, ver trackedAircraft.ts — rastreio ADS-B real,
// tabela SEPARADA). Os dois nunca se falam por FK: aqui so gravamos o
// resultado na MESMA linha (mesmo icao24) que o rastreio ja usa, pro Command
// Center ler os dois campos (posicao + agendamento) numa unica consulta.
//
// "Novo agendamento" = a aeronave-alvo (casada por texto de matricula,
// AIRCRAFT_SCHEDULING_REGISTRATION) transicionou de "Livre" pra "Em uso"
// desde a ultima checagem — so a BORDA de subida dispara scheduledAt novo,
// nao toda vez que ela CONTINUA "Em uso" (senao o alerta "agendada" do
// Command Center repetiria a cada 5s enquanto durar o voo).
function normalize(value: string | null | undefined): string {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase();
}

const STATUS_EM_USO = normalize('Em uso');

export async function runAircraftSchedulingCycle(): Promise<void> {
  const cfg = config.aircraftScheduling;
  if (!cfg) return;

  const aeronaves = await fetchAeronaves(cfg.url);
  const target = aeronaves.find((a) => normalize(a.registro) === normalize(cfg.registration));

  if (!target) {
    console.warn(
      `[sync-job] agendamento de aeronave: registro "${cfg.registration}" nao encontrado no fluxo PA-RESGATE-GerenciaSolicitacoes (${aeronaves.length} aeronave(s) cadastrada(s))`,
    );
    return;
  }

  const existing = await prisma.trackedAircraft.findUnique({
    where: { icao24: cfg.icao24 },
    select: { schedulingStatus: true },
  });

  const wasInUse = normalize(existing?.schedulingStatus) === STATUS_EM_USO;
  const isNowInUse = normalize(target.status) === STATUS_EM_USO;
  const isNewScheduling = isNowInUse && !wasInUse;

  await prisma.trackedAircraft.upsert({
    where: { icao24: cfg.icao24 },
    create: {
      icao24: cfg.icao24,
      schedulingStatus: target.status,
      ...(isNewScheduling ? { scheduledAt: new Date() } : {}),
    },
    update: {
      schedulingStatus: target.status,
      ...(isNewScheduling ? { scheduledAt: new Date() } : {}),
    },
  });

  if (isNewScheduling) {
    console.log(
      `[sync-job] NOVO AGENDAMENTO detectado — "${target.nome}" (registro ${target.registro}, icao24 ${cfg.icao24}) status "${target.status}"`,
    );
  }
}
