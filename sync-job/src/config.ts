// URLs dos 2 flows do Power Automate que fazem de proxy pro SharePoint (ver
// DECISOES_Infra_MapaAmbulancias.md) — cada URL ja vem com a assinatura
// (?sig=...) que o Power Automate gera pro gatilho HTTP, funcionando como
// segredo/senha. Nunca commitar o valor real, so o nome da env var.
export interface SharepointConfig {
  fleetUrl: string;
  // Opcionais de proposito: history/missionEvents nao bloqueiam o sync-job
  // subir so com o flow de frota pronto (e o unico que acende posicao no
  // mapa) — os outros 2 flows podem ser ligados depois, sem reiniciar nada
  // alem de passar a variavel de ambiente. Ver guardas em index.ts.
  trackingUrl?: string;
  missionEventsUrl?: string;
  // f_Operacao_Controle_Dados_do_Chamado — fonte da linha do tempo.
  // Opcional pelo mesmo motivo das outras: o sync-job sobe so com o flow de
  // frota, e este pode ser ligado depois sem reiniciar nada alem da variavel.
  missionsUrl?: string;
  // f_Regulação_chamados — endereco/local por extenso + dado do paciente.
  regulationsUrl?: string;
}

// Aeronaves, via API publica do OpenSky Network. Acesso ANONIMO por decisao
// explicita do usuario — sem client id/secret, sem fluxo de token, mesmo o
// endpoint OAuth2 existindo. Consequencia medida (2026-08-22, pelo header
// X-Rate-Limit-Remaining da propria resposta): sao 400 creditos por dia e
// POR IP, e uma chamada nesse tamanho de bounding box custa 1 credito. Por
// isso o intervalo default e de 5 minutos — 288 ciclos/dia, deixando folga
// pra reinicio e teste. Nao baixar esse valor sem refazer essa conta.
export interface OpenSkyConfig {
  // "fixture" le uma amostra real gravada em disco (desenvolvimento, nao
  // gasta credito nenhum); "live" bate na API de verdade.
  source: 'fixture' | 'live';
  url: string;
  // Uma unica chamada cobre SP e RJ juntos: a area combinada continua abaixo
  // do patamar de 1 credito, entao pedir as duas regioes em chamadas
  // separadas custaria o DOBRO pelo mesmo dado. O recorte por regiao e feito
  // em codigo, ver regionSplitLon.
  lamin: number;
  lomin: number;
  lamax: number;
  lomax: number;
  // Longitude que separa "SP" de "RJ" — -45.0 fica praticamente no meio
  // entre Sao Paulo (-46.6) e Rio (-43.2). Nao ha lacuna entre as duas
  // faixas: toda aeronave dentro do bounding box cai em uma ou na outra,
  // nenhuma se perde no corredor entre as cidades.
  regionSplitLon: number;
  // Vagas por regiao (5 + 5 = o limite de 10 aeronaves pedido).
  slotsPerRegion: number;
  syncIntervalMs: number;
  historyRetentionDays: number;
}

export interface Config {
  databaseUrl: string;
  // Frota: posicao atual, quanto mais rapido melhor pro mapa em tempo real.
  syncIntervalMs: number;
  // Historico e eventos de missao rodam em loops PROPRIOS, mais espacados —
  // a origem real (Power Apps/Power Automate) so escreve a cada ~30s por
  // van, entao bater esses 2 flows a cada 5s (mesmo intervalo da frota) e
  // 5x mais chamadas do que o necessario, sem nenhum dado novo pra mostrar
  // no meio do caminho. Suspeita forte de ser a causa do throttling visto
  // no flow de historico (ver DECISOES_Infra_MapaAmbulancias.md).
  historySyncIntervalMs: number;
  missionEventSyncIntervalMs: number;
  // Missao muda de etapa em minutos, nao em segundos — nao precisa do ritmo
  // da frota. E como cada ciclo rebusca os N chamados mais recentes (sem
  // cursor), um intervalo curto so repetiria trabalho.
  missionSyncIntervalMs: number;
  regulationSyncIntervalMs: number;
  dataSource: string;
  centerLat: number;
  centerLon: number;
  historyRetentionDays: number;
  sharepoint?: SharepointConfig;
  opensky: OpenSkyConfig;
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Variavel de ambiente obrigatoria ausente: ${name}`);
  }
  return value;
}

const DATA_SOURCE = process.env.DATA_SOURCE || 'simulated';

// Default "fixture", nao "live" — mesmo espirito do DATA_SOURCE=simulated:
// subir o projeto localmente nao pode gastar credito de uma cota diaria
// pequena e compartilhada por IP. Trocar pra "live" e opt-in via .env.
const OPENSKY_SOURCE = process.env.OPENSKY_SOURCE || 'fixture';
if (OPENSKY_SOURCE !== 'fixture' && OPENSKY_SOURCE !== 'live') {
  throw new Error(`OPENSKY_SOURCE invalido: "${OPENSKY_SOURCE}" (use "fixture" ou "live")`);
}

const config: Config = {
  databaseUrl: required('DATABASE_URL'),
  syncIntervalMs: Number(process.env.SYNC_INTERVAL_MS || 5000),
  historySyncIntervalMs: Number(process.env.HISTORY_SYNC_INTERVAL_MS || 30000),
  missionEventSyncIntervalMs: Number(process.env.MISSION_EVENT_SYNC_INTERVAL_MS || 30000),
  missionSyncIntervalMs: Number(process.env.MISSION_SYNC_INTERVAL_MS || 30000),
  regulationSyncIntervalMs: Number(process.env.REGULATION_SYNC_INTERVAL_MS || 30000),
  dataSource: DATA_SOURCE,
  centerLat: Number(process.env.CENTER_LAT || -23.5505),
  centerLon: Number(process.env.CENTER_LON || -46.6333),
  historyRetentionDays: Number(process.env.HISTORY_RETENTION_DAYS || 30),
  opensky: {
    source: OPENSKY_SOURCE,
    url: process.env.OPENSKY_URL || 'https://opensky-network.org/api/states/all',
    // Bounding box cobrindo SP e RJ juntos — testado contra a API real.
    lamin: Number(process.env.OPENSKY_LAMIN || -24.5),
    lomin: Number(process.env.OPENSKY_LOMIN || -47.5),
    lamax: Number(process.env.OPENSKY_LAMAX || -22.0),
    lomax: Number(process.env.OPENSKY_LOMAX || -42.5),
    regionSplitLon: Number(process.env.OPENSKY_REGION_SPLIT_LON || -45.0),
    slotsPerRegion: Number(process.env.OPENSKY_SLOTS_PER_REGION || 5),
    syncIntervalMs: Number(process.env.AIRCRAFT_SYNC_INTERVAL_MS || 300000),
    historyRetentionDays: Number(process.env.AIRCRAFT_HISTORY_RETENTION_DAYS || 30),
  },
};

if (DATA_SOURCE === 'sharepoint') {
  config.sharepoint = {
    fleetUrl: required('POWER_AUTOMATE_FLEET_URL'),
    trackingUrl: process.env.POWER_AUTOMATE_TRACKING_URL || undefined,
    missionEventsUrl: process.env.POWER_AUTOMATE_MISSION_EVENTS_URL || undefined,
    missionsUrl: process.env.POWER_AUTOMATE_MISSIONS_URL || undefined,
    regulationsUrl: process.env.POWER_AUTOMATE_REGULATIONS_URL || undefined,
  };
} else if (DATA_SOURCE !== 'simulated') {
  throw new Error(`DATA_SOURCE invalido: "${DATA_SOURCE}" (use "simulated" ou "sharepoint")`);
}

export default config;
