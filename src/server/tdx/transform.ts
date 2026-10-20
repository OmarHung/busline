import { parseWktLines } from "@/lib/geo/wkt";
import { directionHeadsign } from "@/lib/headsign";
import { etaKey } from "@/lib/types";
import type {
  LiveBus,
  LivePart,
  LngLat,
  RouteDetail,
  RouteDirection,
  RouteLive,
  RouteSummary,
  Stop,
  StopEta,
} from "@/lib/types";
import type { TdxBus, TdxEta, TdxRoute, TdxShape, TdxStopOfRoute } from "./schemas";

/** TDX DutyStatus：2 = 營運結束 */
const DUTY_ENDED = 2;

const routeName = (route: TdxRoute) => route.RouteName.Zh_tw?.trim() ?? "";

export function toRouteSummaries(routes: readonly TdxRoute[], cityCode: string): RouteSummary[] {
  const seen = new Set<string>();
  return routes.flatMap((route) => {
    const name = routeName(route);
    if (!name || seen.has(route.RouteUID)) return [];
    seen.add(route.RouteUID);
    return [
      {
        uid: route.RouteUID,
        name,
        cityCode,
        from: route.DepartureStopNameZh ?? "",
        to: route.DestinationStopNameZh ?? "",
      },
    ];
  });
}

function toStops(stopOfRoute: TdxStopOfRoute): Stop[] {
  return [...stopOfRoute.Stops]
    .sort((a, b) => a.StopSequence - b.StopSequence)
    .map((s) => ({
      uid: s.StopUID,
      name: s.StopName.Zh_tw ?? "",
      seq: s.StopSequence,
      position: [s.StopPosition.PositionLon, s.StopPosition.PositionLat] as LngLat,
    }));
}

/** 同方向有多條子路線時，取站數最多的當主線 */
export function mainStopsByDirection(uid: string, stopOfRoutes: readonly TdxStopOfRoute[]): Map<number, Stop[]> {
  const result = new Map<number, Stop[]>();
  for (const sor of stopOfRoutes) {
    if (sor.RouteUID !== uid) continue;
    const direction = sor.Direction ?? 0;
    const current = result.get(direction);
    if (!current || sor.Stops.length > current.length) result.set(direction, toStops(sor));
  }
  return result;
}

function pickShapeLines(uid: string, shapes: readonly TdxShape[], direction: number): LngLat[][] {
  const parsed = shapes
    .filter((s) => s.RouteUID === uid && s.Geometry)
    .map((s) => ({ direction: s.Direction, lines: parseWktLines(s.Geometry ?? "") }))
    .filter((s) => s.lines.length > 0);

  const pointCount = (lines: LngLat[][]) => lines.reduce((n, line) => n + line.length, 0);
  const best = (candidates: typeof parsed) =>
    candidates.reduce<LngLat[][]>((acc, s) => (pointCount(s.lines) > pointCount(acc) ? s.lines : acc), []);

  const exact = best(parsed.filter((s) => s.direction === direction));
  return exact.length > 0 ? exact : best(parsed.filter((s) => s.direction === undefined));
}

/** route 來自預先產生的路線清單；shapes / stopOfRoutes 來自 TDX */
export function buildRouteDetail(
  route: RouteSummary,
  shapes: readonly TdxShape[],
  stopOfRoutes: readonly TdxStopOfRoute[],
): RouteDetail {
  const stopsByDirection = mainStopsByDirection(route.uid, stopOfRoutes);

  const directions: RouteDirection[] = [...stopsByDirection.entries()]
    .sort(([a], [b]) => a - b)
    .map(([direction, stops]) => {
      const lines = pickShapeLines(route.uid, shapes, direction);
      const isApproximate = lines.length === 0;
      return {
        direction,
        headsign: directionHeadsign(direction, route, stops.at(-1)?.name),
        lines: isApproximate ? [stops.map((s) => s.position)] : lines,
        isApproximate,
        stops,
      };
    });

  return { ...route, directions };
}

function toStopEta(eta: TdxEta): StopEta {
  return {
    estimateSec: eta.EstimateTime ?? null,
    status: eta.StopStatus ?? 0,
    nextBusTime: eta.NextBusTime ?? null,
    isLastBus: eta.IsLastBus ?? false,
  };
}

/** 同一站有多筆預估（多條子路線）時，取最快到站的那筆 */
function isSooner(candidate: StopEta, current: StopEta): boolean {
  if (candidate.estimateSec === null) return false;
  return current.estimateSec === null || candidate.estimateSec < current.estimateSec;
}

function toLiveBus(bus: TdxBus): LiveBus {
  return {
    plate: bus.PlateNumb,
    direction: bus.Direction ?? 0,
    position: [bus.BusPosition.PositionLon, bus.BusPosition.PositionLat],
    azimuth: bus.Azimuth ?? 0,
    speed: bus.Speed ?? 0,
    gpsTime: bus.GPSTime ?? "",
  };
}

/** etas / buses 為 null 表示該部分這次抓取失敗 */
export function buildRouteLive(
  uid: string,
  etas: readonly TdxEta[] | null,
  buses: readonly TdxBus[] | null,
  now: Date,
): RouteLive {
  const etaMap: Record<string, StopEta> = {};
  for (const eta of etas ?? []) {
    if (eta.RouteUID !== uid) continue;
    const key = etaKey(eta.Direction ?? 0, eta.StopUID);
    const next = toStopEta(eta);
    const current = etaMap[key];
    if (!current || isSooner(next, current)) etaMap[key] = next;
  }

  const latestByPlate = new Map<string, TdxBus>();
  for (const bus of buses ?? []) {
    if (bus.RouteUID !== uid || bus.DutyStatus === DUTY_ENDED) continue;
    const current = latestByPlate.get(bus.PlateNumb);
    if (!current || (bus.GPSTime ?? "") > (current.GPSTime ?? "")) latestByPlate.set(bus.PlateNumb, bus);
  }

  const unavailable: LivePart[] = [...(etas ? [] : ["etas" as const]), ...(buses ? [] : ["buses" as const])];

  return {
    etas: etaMap,
    buses: [...latestByPlate.values()].map(toLiveBus),
    unavailable,
    fetchedAt: now.toISOString(),
  };
}
