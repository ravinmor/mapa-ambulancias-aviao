import { useCallback, useEffect, useRef, useState } from 'react';
import type { Map as LeafletMap } from 'leaflet';
import type { Breakpoint } from './useBreakpoint';

// Toda a mecanica de "clicou num marcador": seleciona, voa a camera ate ele,
// borra o mapa durante o voo, busca o trajeto e cicla pro proximo. Vivia
// dentro do Map.tsx atendendo so as vans; foi extraida aqui sem mudanca de
// comportamento porque, por acaso, ela nunca dependeu de nada especifico de
// van — so precisa de id/latitude/longitude e de uma URL de historico.
// Agora van e aeronave sao dois usuarios do mesmo hook.

const FLY_DURATION_SEC = 1.2; // segundos — fixo, nao escala com distancia (ver select)
const MOBILE_FOCUS_VERTICAL_OFFSET = 0.25; // fracao da altura da tela: 0.5 = centro, 0.25 = 1/4 do topo

export interface SelectableEntity {
  id: number;
  latitude: number | null;
  longitude: number | null;
  // Carimbo da ultima posicao REAL vinda do servidor. E a chave que dispara a
  // rebusca do trajeto (ver efeito abaixo) — de proposito nao e a lat/lon,
  // que no caso da aeronave muda a cada segundo por navegacao estimada e
  // faria o mapa buscar o historico 60x por minuto.
  positionAt?: string | null;
}

export interface TrailPoint {
  latitude: number;
  longitude: number;
  // A aeronave manda altitude por ponto (a van nao) — e o que permite colorir
  // o trajeto pelo gradiente, ver AircraftTrail.
  altitude?: number | null;
  positionAt?: string;
}

// No mobile a sidebar vira uma bottom sheet cobrindo ~metade de baixo da
// tela — centralizar o alvo de verdade (50% da altura) o deixaria escondido
// atras dela. Em vez disso, calculamos que ponto (lat/lon) precisa virar o
// "centro" do mapa pra que ele renderize mais pra cima (MOBILE_FOCUS_
// VERTICAL_OFFSET da altura), usando project/unproject do Leaflet pra
// converter entre coordenada geografica e pixel na tela.
function computeMobileFocusCenter(map: LeafletMap, target: [number, number], zoom: number): [number, number] {
  const targetPoint = map.project(target, zoom);
  const verticalOffsetPx = map.getSize().y * (0.5 - MOBILE_FOCUS_VERTICAL_OFFSET);
  const shiftedPoint = targetPoint.add([0, verticalOffsetPx]);
  const shiftedLatLng = map.unproject(shiftedPoint, zoom);
  return [shiftedLatLng.lat, shiftedLatLng.lng];
}

export function useMapSelection<T extends SelectableEntity>({
  mapRef,
  breakpoint,
  entities,
  historyUrl,
  focusZoom,
}: {
  mapRef: React.MutableRefObject<LeafletMap | null>;
  breakpoint: Breakpoint;
  // Ja filtrada — e a mesma lista que vira marcador no mapa. Se o item
  // selecionado sair dela, a selecao se fecha sozinha (ver efeito abaixo).
  entities: T[];
  historyUrl: (id: number) => string;
  // Zoom pro qual a camera voa ao selecionar. Van e aeronave usam o mesmo
  // comportamento: seleciona, aproxima e da destaque.
  focusZoom: number;
}) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [trail, setTrail] = useState<TrailPoint[] | null>(null);
  // So true durante a animacao do flyTo — nao enquanto o item fica
  // selecionado (o blur e pra disfarcar a transicao do zoom, nao pra ficar
  // borrado o tempo todo com a sidebar aberta).
  const [isFocusing, setIsFocusing] = useState(false);

  const close = useCallback(() => {
    setSelectedId(null);
    setTrail(null);
    setIsFocusing(false);
  }, []);

  const select = useCallback(
    async (id: number) => {
      setSelectedId(id);

      const entity = entities.find((e) => e.id === id);
      if (entity?.latitude != null && entity?.longitude != null && mapRef.current) {
        const map = mapRef.current;
        const target: [number, number] = [entity.latitude, entity.longitude];
        const focusCenter =
          breakpoint === 'mobile' ? computeMobileFocusCenter(map, target, focusZoom) : target;

        // flyTo anima pan + zoom juntos (mais suave que setView) e sempre leva
        // pro focusZoom, mesmo se o usuario ja tiver dado zoom out antes.
        // duration fixa (nao o default, que escala com a distancia) — ha itens
        // em SP e RJ, ~360km de distancia, entao sem isso um clique de SP pra
        // RJ podia levar varios segundos. Blur/marcador voltam no "moveend",
        // mas TAMBEM ha um fallback por tempo: se o Leaflet nao disparar
        // moveend (ja visto quando o alvo calculado bate quase exato com o
        // centro atual), o marcador nao pode ficar invisivel pra sempre.
        setIsFocusing(true);
        let settled = false;
        const stopFocusing = () => {
          if (settled) return;
          settled = true;
          setIsFocusing(false);
        };
        map.once('moveend', stopFocusing);
        setTimeout(stopFocusing, FLY_DURATION_SEC * 1000 + 400);
        map.flyTo(focusCenter, focusZoom, { duration: FLY_DURATION_SEC });
      }
      // A busca do trajeto NAO acontece aqui — quem faz e o efeito abaixo,
      // que reage tanto a selecao quanto a chegada de posicao nova.
    },
    [entities, mapRef, breakpoint, focusZoom],
  );

  const selected = entities.find((e) => e.id === selectedId) ?? null;
  const selectedPositionAt = selected?.positionAt ?? null;

  // Rebusca o trajeto quando o item e selecionado E toda vez que chega uma
  // posicao nova pra ele. Antes isso rodava so no clique, entao a linha
  // congelava no momento da selecao enquanto o marcador seguia andando —
  // bug reportado pelo usuario em 2026-08-22. Como a dependencia e o
  // positionAt (carimbo do servidor) e nao a lat/lon, a aeronave sob
  // navegacao estimada nao dispara rebusca a cada segundo.
  useEffect(() => {
    if (selectedId == null) {
      setTrail(null);
      return;
    }

    let cancelled = false;
    fetch(historyUrl(selectedId))
      .then((response) => response.json())
      .then((points: TrailPoint[]) => {
        if (cancelled) return;
        // Basta 1 ponto: quem desenha emenda a posicao ATUAL no fim da linha
        // (ver Map.tsx), entao 1 ponto de historico + a posicao ao vivo ja
        // formam um segmento. Exigir 2 deixava sem trajeto nenhum toda
        // aeronave recem-entrada numa vaga — e como elas rotacionam rapido,
        // "boa parte" delas estava sempre sem linha (reportado pelo usuario).
        setTrail(points.length > 0 ? points : null);
      })
      .catch((error) => {
        if (cancelled) return;
        console.error('Erro ao buscar historico:', error);
        setTrail(null);
      });

    // Uma resposta lenta de uma selecao anterior nao pode sobrescrever o
    // trajeto da selecao atual.
    return () => {
      cancelled = true;
    };
  }, [selectedId, selectedPositionAt, historyUrl]);

  // Clicar de novo no item ja selecionado fecha, em vez de reabrir a mesma
  // coisa.
  const handleMarkerClick = useCallback(
    (id: number) => {
      if (selectedId === id) close();
      else void select(id);
    },
    [selectedId, close, select],
  );

  const positioned = entities.filter((e) => e.latitude != null && e.longitude != null);

  // Se o item selecionado sai do grupo visivel (o usuario apertou o filtro, ou
  // o status dele mudou na origem), fecha a sidebar — deixar aberta pra algo
  // que sumiu do mapa seria inconsistente.
  const selectedIsVisible = selectedId == null || entities.some((e) => e.id === selectedId);
  useEffect(() => {
    if (!selectedIsVisible) close();
  }, [selectedIsVisible, close]);

  // Passeia em ciclo pelos itens com posicao conhecida (a mesma lista que vira
  // marcador), na ordem em que aparecem. Respeita o filtro ativo.
  const focusNext = useCallback(() => {
    if (positioned.length === 0) return;
    const currentIndex = positioned.findIndex((e) => e.id === selectedId);
    void select(positioned[(currentIndex + 1) % positioned.length].id);
  }, [positioned, selectedId, select]);

  return {
    selectedId,
    selected,
    trail,
    isFocusing,
    positionedCount: positioned.length,
    select,
    close,
    handleMarkerClick,
    focusNext,
  };
}
