import { distanceMeters } from "@/lib/geo/nearest";
import { directionHeadsign } from "@/lib/headsign";
import type { LngLat, NearbyRoute, NearbyStation, RouteSummary } from "@/lib/types";
import type { NearbyStop, StopNetwork } from "../planner/network";

/** 先找 500 公尺內的站，找不到再放寬到 1 公里 */
const SEARCH_RADII_METERS = [500, 1000];
/** 同名站牌相距在這個範圍內就合成一站（路口兩側、對向的站牌） */
const SAME_STATION_METERS = 200;
const DEFAULT_LIMIT = 8;

interface Options {
  limit?: number;
}

/** 依距離由近到遠，把同名且相近的站牌歸成一站；每站的第一支是最近的 */
function groupPoles(network: StopNetwork, nearby: readonly NearbyStop[]): NearbyStop[][] {
  const groups: NearbyStop[][] = [];
  for (const pole of nearby) {
    const { name, position } = network.stop(pole.stop);
    const index = groups.findIndex(([first]) => {
      const nearest = network.stop(first.stop);
      return nearest.name === name && distanceMeters(nearest.position, position) <= SAME_STATION_METERS;
    });
    if (index < 0) groups.push([pole]);
    else groups[index] = [...groups[index], pole];
  }
  return groups;
}

const byRouteName = (a: NearbyRoute, b: NearbyRoute) =>
  a.route.name.localeCompare(b.route.name, "zh-Hant", { numeric: true }) || a.direction - b.direction;

/** 這站可以上車的路線方向；終點站只能下車所以不算，同一路線方向停兩支站牌時取近的 */
function boardableRoutes(
  network: StopNetwork,
  routes: ReadonlyMap<string, RouteSummary>,
  poles: readonly NearbyStop[],
): NearbyRoute[] {
  const byKey = new Map<string, NearbyRoute>();
  for (const { stop } of poles) {
    for (const { pattern, position } of network.occurrences(stop)) {
      const { routeUid, direction, stops } = network.pattern(pattern);
      const route = routes.get(routeUid);
      const key = `${routeUid}:${direction}`;
      if (!route || position === stops.length - 1 || byKey.has(key)) continue;
      byKey.set(key, {
        route,
        direction,
        headsign: directionHeadsign(direction, route, network.stop(stops[stops.length - 1]).name),
        position: network.stop(stop).position,
      });
    }
  }
  return [...byKey.values()].sort(byRouteName);
}

/** 附近的公車站與各站可搭的路線，近的在前（只用預先產生的站序，不打 TDX） */
export function findNearbyStations(
  network: StopNetwork,
  routes: ReadonlyMap<string, RouteSummary>,
  point: LngLat,
  { limit = DEFAULT_LIMIT }: Options = {},
): NearbyStation[] {
  for (const radius of SEARCH_RADII_METERS) {
    const stations = groupPoles(network, network.stopsNear(point, radius))
      .map((poles) => ({
        id: String(poles[0].stop),
        name: network.stop(poles[0].stop).name,
        meters: Math.round(poles[0].meters),
        positions: poles.map(({ stop }) => network.stop(stop).position),
        routes: boardableRoutes(network, routes, poles),
      }))
      .filter((station) => station.routes.length > 0);
    if (stations.length > 0) return stations.slice(0, limit);
  }
  return [];
}
