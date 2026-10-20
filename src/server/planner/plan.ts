import { distanceMeters } from "@/lib/geo/nearest";
import { directionHeadsign } from "@/lib/headsign";
import type { LngLat, PlanOption, PlanResult, PlanRide, PlanStop, RouteSummary } from "@/lib/types";
import type { NearbyStop, StopNetwork } from "./network";

/** 先找 600 公尺內的站，找不到再放寬到 1 公里 */
const WALK_RADII_METERS = [600, 1000];
const WALK_METERS_PER_MINUTE = 75;
/** 直線距離換算成實際步行距離的倍數 */
const WALK_DETOUR = 1.3;
/** 市區公車約時速 18 公里；公路客運多走快速道路，約 33 公里 */
const RIDE_METERS_PER_MINUTE = { city: 300, intercity: 550 };
/** 每停一站多花的時間 */
const DWELL_MINUTES_PER_STOP = 0.3;
const DEFAULT_LIMIT = 6;

interface Candidate {
  stop: number;
  position: number;
  meters: number;
}

interface Best {
  route: RouteSummary;
  pattern: number;
  board: Candidate;
  alight: Candidate;
  minutes: number;
}

const walkMinutes = (meters: number) => (meters * WALK_DETOUR) / WALK_METERS_PER_MINUTE;

function rideMinutes(meters: number, stops: number, cityCode: string): number {
  const speed = cityCode === "THB" ? RIDE_METERS_PER_MINUTE.intercity : RIDE_METERS_PER_MINUTE.city;
  return meters / speed + stops * DWELL_MINUTES_PER_STOP;
}

/** 附近的站 → 依路線方向分組，記下各自在該方向中的第幾站 */
function candidatesByPattern(network: StopNetwork, nearby: readonly NearbyStop[]): Map<number, Candidate[]> {
  const result = new Map<number, Candidate[]>();
  for (const { stop, meters } of nearby) {
    for (const { pattern, position } of network.occurrences(stop)) {
      const list = result.get(pattern) ?? [];
      list.push({ stop, position, meters });
      result.set(pattern, list);
    }
  }
  return result;
}

function findBestPerRoute(
  network: StopNetwork,
  routes: ReadonlyMap<string, RouteSummary>,
  from: LngLat,
  to: LngLat,
  radius: number,
): Map<string, Best> {
  const boards = candidatesByPattern(network, network.stopsNear(from, radius));
  const alights = candidatesByPattern(network, network.stopsNear(to, radius));
  const bestByRoute = new Map<string, Best>();

  for (const [pattern, boardList] of boards) {
    const alightList = alights.get(pattern);
    const { routeUid } = network.pattern(pattern);
    const route = routes.get(routeUid);
    if (!alightList || !route) continue;

    for (const board of boardList) {
      for (const alight of alightList) {
        if (alight.position <= board.position) continue; // 方向不對或同一站
        const stops = alight.position - board.position;
        const minutes =
          walkMinutes(board.meters) +
          rideMinutes(network.rideMeters(pattern, board.position, alight.position), stops, route.cityCode) +
          walkMinutes(alight.meters);
        const current = bestByRoute.get(routeUid);
        if (!current || minutes < current.minutes) {
          bestByRoute.set(routeUid, { route, pattern, board, alight, minutes });
        }
      }
    }
  }
  return bestByRoute;
}

function toRide(network: StopNetwork, best: Best): PlanRide {
  const { route } = best;
  const { direction, stops } = network.pattern(best.pattern);
  return {
    route,
    direction,
    headsign: directionHeadsign(direction, route, network.stop(stops[stops.length - 1]).name),
    stopCount: best.alight.position - best.board.position,
    rideMeters: Math.round(network.rideMeters(best.pattern, best.board.position, best.alight.position)),
    path: stops.slice(best.board.position, best.alight.position + 1).map((id) => network.stop(id).position),
    estimatedMinutes: Math.max(1, Math.round(best.minutes)),
  };
}

const planStop = (network: StopNetwork, candidate: Candidate): PlanStop => ({
  ...network.stop(candidate.stop),
  walkMeters: Math.round(candidate.meters),
});

/**
 * 每條路線取最快的上下車組合，再把上下車站相同的路線併成一個方案
 * （例如 212、212直、212夜 都從同一站到同一站）。
 */
function groupByStops(network: StopNetwork, best: Iterable<Best>, limit: number): PlanOption[] {
  const groups = new Map<string, Best[]>();
  for (const b of [...best].sort((x, y) => x.minutes - y.minutes)) {
    const key = `${network.stop(b.board.stop).name}|${network.stop(b.alight.stop).name}`;
    groups.set(key, [...(groups.get(key) ?? []), b]);
  }
  return [...groups.values()].slice(0, limit).map((list) => ({
    board: planStop(network, list[0].board),
    alight: planStop(network, list[0].alight),
    rides: list.map((b) => toRide(network, b)),
  }));
}

/** 直達方案（不轉乘）：起點附近上車、終點附近下車、同一條路線同一個方向 */
export function planDirect(
  network: StopNetwork,
  routes: ReadonlyMap<string, RouteSummary>,
  from: LngLat,
  to: LngLat,
  { limit = DEFAULT_LIMIT }: { limit?: number } = {},
): PlanResult {
  const directMeters = Math.round(distanceMeters(from, to));

  for (const radius of WALK_RADII_METERS) {
    const best = findBestPerRoute(network, routes, from, to, radius);
    if (best.size > 0) return { options: groupByStops(network, best.values(), limit), directMeters };
  }
  return { options: [], directMeters };
}
