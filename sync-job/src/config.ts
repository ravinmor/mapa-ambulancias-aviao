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

// Aeronaves, via API publica do OpenSky Network. Acesso ANONIMO por padrao —
// zero setup, funciona sem cadastro nenhum. Consequencia medida (2026-08-22,
// pelo header X-Rate-Limit-Remaining da propria resposta): sao 400 creditos
// por dia e POR IP, e uma chamada nesse tamanho de bounding box custa 1
// credito. Por isso o intervalo default e de 5 minutos — 288 ciclos/dia,
// deixando folga pra reinicio e teste. Nao baixar esse valor sem refazer
// essa conta.
//
// AUTENTICADO (opt-in, pedido do usuario 2026-09-03): preenchendo
// OPENSKY_CLIENT_ID/OPENSKY_CLIENT_SECRET no ambiente (conta registrada em
// opensky-network.org + client OAuth2 criado no dashboard da conta), a cota
// sobe pra 4.000 creditos/dia — 10x. Ver getOpenSkyAuthHeaders() em
// sources/openskyAuth.ts — os headers da chamada mudam sozinhos, nada mais
// no pipeline precisa saber se esta autenticado ou nao.
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

// Aeronaves especificas (N, uma por ICAO24 fixo) rastreadas em paralelo ao
// pipeline generico do OpenSky (OpenSkyConfig acima, que fica com o codigo
// intacto mas sem ser chamado — ver index.ts).
//
// Estrategia de custo (elaborada com o usuario, 2026-09-02): busca SEM
// bounding box custa 4 creditos/chamada (medido); busca COM uma caixa
// pequena ao redor da ULTIMA POSICAO CONHECIDA custa so 1 (mesmo nivel da
// caixa SP+RJ do pipeline generico, tambem medido). Como cada aeronave da
// Amil passa a maior parte do dia PARADA (sem ADS-B nenhum, decolada ou nao
// — sem sentido gastar credito perguntando rapido por algo que nunca vai
// aparecer) e voa só algumas horas, o intervalo tambem e ADAPTATIVO por
// aeronave: espacado (idleSyncIntervalMs) enquanto ela esta no chao,
// curto (flightSyncIntervalMs) enquanto esta voando — ver checkOne() em
// trackedAircraft.ts, que decide isso por aeronave a cada tick do
// "scanner" (scannerIntervalMs, barato — so verifica se ja esta na hora de
// cada uma, sem gastar credito nenhum nisso).
//
// Conta (pior caso, todas as N aeronaves voando o maximo todo santo dia —
// 3 viagens de 2h = 6h voando, 18h paradas, ver elaboracao com o usuario,
// 2026-09-02): por aeronave, parada a cada 15min (18h / 15min = 72
// chamadas x 1 credito = 72) + voando a cada 5min (6h / 5min = 72 chamadas
// x 1 credito = 72) = 144 creditos/dia. Com 4 aeronaves: 576/dia — passa
// dos 400 nesse EXTREMO (usuario ciente e topou o risco); no dia a dia
// real (nem toda aeronave voa o maximo todo dia) deve caber. Se passar da
// cota de verdade em producao, o proximo ajuste e alongar
// idleSyncIntervalMs ou flightSyncIntervalMs conforme quantas aeronaves
// estiverem voando ao mesmo tempo.
export interface TrackedAircraftConfig {
  icao24List: string[];
  url: string;
  idleSyncIntervalMs: number;
  flightSyncIntervalMs: number;
  scannerIntervalMs: number;
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
  trackedAircraft: TrackedAircraftConfig;
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
  trackedAircraft: {
    // Placeholders de desenvolvimento: hex publico e real de 4 aeronaves
    // comerciais (nao da Amil ainda) — 4 pra ja testar o suporte a
    // MULTIPLAS aeronaves de verdade (pedido do usuario, 2026-09-02: "a
    // Amil tem 4 aeronaves"), nao so 1. Trocar por TRACKED_AIRCRAFT_ICAO24S
    // (lista separada por virgula) quando os ICAO24 reais da Amil entrarem
    // em uso, sem precisar mexer em codigo. Aceita tambem o singular
    // TRACKED_AIRCRAFT_ICAO24 (1 so, retrocompatibilidade com o setup
    // anterior a essa lista). Este default so vale fora do docker-compose
    // (ex: panel machine sem Docker) — no compose, a variavel e definida la
    // (ver docker-compose.yml).
    // Historico de troca do 1o placeholder (antes de virar lista): 3c6444
    // (Lufthansa) pousou em Munique em 2026-09-02 — trocado por 3c5ee5
    // (Eurowings), depois por 407a05 (easyJet). Passou a lista de 4
    // (Europa), depois trocada de novo pra 4 sobre SAO PAULO (pedido do
    // usuario, 2026-09-02): e49ef1=GLO1556 (GOL), e48ba9=TAM8147 (LATAM),
    // e49f52=AZU6503 (Azul), e4a50e=TAM3194 (LATAM).
    icao24List: (
      process.env.TRACKED_AIRCRAFT_ICAO24S ||
      process.env.TRACKED_AIRCRAFT_ICAO24 ||
      'e49ef1,e48ba9,e49f52,e4a50e'
    )
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
    url: process.env.TRACKED_AIRCRAFT_URL || 'https://opensky-network.org/api/states/all',
    // Espacado (aeronave no chao — pedido do usuario, 2026-09-02: "aumenta
    // de 15 em 15 minutos a busca pelos avioes parados").
    idleSyncIntervalMs: Number(process.env.TRACKED_AIRCRAFT_IDLE_SYNC_INTERVAL_MS || 900000),
    // Curto (aeronave voando de verdade).
    flightSyncIntervalMs: Number(process.env.TRACKED_AIRCRAFT_FLIGHT_SYNC_INTERVAL_MS || 300000),
    // O "scanner" (startLoop em index.ts) roda nesse ritmo so pra VERIFICAR
    // se alguma aeronave ja esta na hora do proprio intervalo dela — nao
    // gasta credito nenhum sozinho, quem decide ligar pro OpenSky de
    // verdade e checkOne() em trackedAircraft.ts. Bem mais curto que os
    // dois de cima de proposito, pra nao atrasar a hora certa de cada uma.
    scannerIntervalMs: Number(process.env.TRACKED_AIRCRAFT_SCANNER_INTERVAL_MS || 60000),
    // Retencao do trajeto (TrackedAircraftPositionHistory) — mesmo default
    // do pipeline generico (AIRCRAFT_HISTORY_RETENTION_DAYS).
    historyRetentionDays: Number(process.env.TRACKED_AIRCRAFT_HISTORY_RETENTION_DAYS || 30),
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
