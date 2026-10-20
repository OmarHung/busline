import { distanceMeters } from "@/lib/geo/nearest";
import { normalizeText } from "@/lib/text";
import type { LngLat, Place } from "@/lib/types";
import type { StopNetwork } from "../planner/network";

/** 同名站牌相距在這個範圍內就合成一個地點（例如路口兩側的站） */
const CLUSTER_METERS = 800;
const DEFAULT_LIMIT = 5;
/** 最多處理幾個符合的站名，避免很短的關鍵字掃出上千個站 */
const MAX_NAMES = 30;

interface Options {
  near?: LngLat;
  limit?: number;
}

interface Cluster {
  ids: number[];
  center: LngLat;
}

function matchScore(name: string, query: string): number {
  const normalized = normalizeText(name);
  if (normalized === query) return 0;
  if (normalized.startsWith(query)) return 1;
  if (normalized.includes(query)) return 2;
  return -1;
}

const centerOf = (positions: readonly LngLat[]): LngLat => [
  positions.reduce((sum, [lng]) => sum + lng, 0) / positions.length,
  positions.reduce((sum, [, lat]) => sum + lat, 0) / positions.length,
];

/** 相近的同名站合成一群（路口兩側、不同業者的站牌）；距離遠的同名站各自成群 */
function clusterStops(network: StopNetwork, ids: readonly number[]): Cluster[] {
  const clusters: Cluster[] = [];
  for (const id of ids) {
    const { position } = network.stop(id);
    const index = clusters.findIndex((c) => distanceMeters(c.center, position) <= CLUSTER_METERS);
    if (index < 0) {
      clusters.push({ ids: [id], center: position });
      continue;
    }
    const merged = [...clusters[index].ids, id];
    clusters[index] = { ids: merged, center: centerOf(merged.map((i) => network.stop(i).position)) };
  }
  return clusters;
}

/** 經過這群站的路線數（不分方向） */
function routeCount(network: StopNetwork, ids: readonly number[]): number {
  const uids = new Set(ids.flatMap((id) => network.occurrences(id).map((o) => network.pattern(o.pattern).routeUid)));
  return uids.size;
}

/** 用公車站名找地點；很多地標本身就是站名（國父紀念館、臺大醫院…） */
export function searchStopPlaces(
  network: StopNetwork,
  rawQuery: string,
  { near, limit = DEFAULT_LIMIT }: Options = {},
): Place[] {
  const query = normalizeText(rawQuery);
  if (!query) return [];

  const names = [...network.names()]
    .map((name) => ({ name, score: matchScore(name, query) }))
    .filter((m) => m.score >= 0)
    .sort((a, b) => a.score - b.score || a.name.length - b.name.length || a.name.localeCompare(b.name, "zh-Hant"))
    .slice(0, MAX_NAMES);

  const places = names.flatMap(({ name, score }) =>
    clusterStops(network, network.stopIdsByName(name)).map((cluster) => ({
      score,
      distance: near ? distanceMeters(near, cluster.center) : 0,
      place: {
        id: `stop:${cluster.ids[0]}`,
        name,
        detail: `公車站・${routeCount(network, cluster.ids)} 條路線`,
        position: cluster.center,
        kind: "stop" as const,
      },
    })),
  );

  return places
    .sort((a, b) => a.score - b.score || a.distance - b.distance)
    .slice(0, limit)
    .map((p) => p.place);
}
