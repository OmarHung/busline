import type { LiveBus, LngLat, RouteDetail, RouteDirection } from "@/lib/types";
import type { PointKind } from "../ui/plan/types";

interface Feature<G, P> {
  type: "Feature";
  geometry: G;
  properties: P;
}

export interface FeatureCollection<G, P> {
  type: "FeatureCollection";
  features: Feature<G, P>[];
}

type MultiLineString = { type: "MultiLineString"; coordinates: LngLat[][] };
type Point = { type: "Point"; coordinates: LngLat };

const collection = <G, P>(features: Feature<G, P>[]): FeatureCollection<G, P> => ({
  type: "FeatureCollection",
  features,
});

export function routeLineFeatures(
  detail: RouteDetail | null,
  activeDirection: number,
): FeatureCollection<MultiLineString, { direction: number; active: boolean; approximate: boolean }> {
  return collection(
    (detail?.directions ?? []).map((d) => ({
      type: "Feature",
      geometry: { type: "MultiLineString", coordinates: d.lines },
      properties: { direction: d.direction, active: d.direction === activeDirection, approximate: d.isApproximate },
    })),
  );
}

/** 起站、迄站；其他站為空字串 */
type Terminal = "start" | "end" | "";

const TERMINAL_LABELS: Record<Terminal, string> = { start: "起", end: "迄", "": "" };

interface StopProperties {
  uid: string;
  name: string;
  seq: number;
  selected: boolean;
  terminal: Terminal;
  /** 地圖上起訖點標記的文字 */
  label: string;
}

export function stopFeatures(
  direction: RouteDirection | null,
  selectedStopUid: string | null,
): FeatureCollection<Point, StopProperties> {
  const stops = direction?.stops ?? [];
  const terminalOf = (index: number): Terminal => (index === 0 ? "start" : index === stops.length - 1 ? "end" : "");
  return collection(
    stops.map((stop, index) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: stop.position },
      properties: {
        uid: stop.uid,
        name: stop.name,
        seq: stop.seq,
        selected: stop.uid === selectedStopUid,
        terminal: terminalOf(index),
        label: TERMINAL_LABELS[terminalOf(index)],
      },
    })),
  );
}

export function busesFeatures(
  buses: readonly LiveBus[],
  activeDirection: number,
): FeatureCollection<Point, { plate: string; azimuth: number }> {
  return collection(
    buses
      .filter((bus) => bus.direction === activeDirection)
      .map((bus) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: bus.position },
        properties: { plate: bus.plate, azimuth: bus.azimuth },
      })),
  );
}

/** 回傳 [[west, south], [east, north]]；沒有座標時回傳 null */
function boundsOfPoints(points: readonly LngLat[]): [LngLat, LngLat] | null {
  if (points.length === 0) return null;
  let [west, south] = points[0];
  let [east, north] = points[0];
  for (const [lng, lat] of points) {
    west = Math.min(west, lng);
    east = Math.max(east, lng);
    south = Math.min(south, lat);
    north = Math.max(north, lat);
  }
  return [
    [west, south],
    [east, north],
  ];
}

export function boundsOf(direction: RouteDirection): [LngLat, LngLat] | null {
  return boundsOfPoints([...direction.lines.flat(), ...direction.stops.map((s) => s.position)]);
}

/** 路線規劃要畫在地圖上的一個地點 */
export interface PlanOverlayPoint {
  kind: PointKind;
  /** 標記上的字：起、終，或經過點的編號 */
  label: string;
  position: LngLat;
}

/** 一段行程選取的方案：從出發點走到上車站、搭公車、下車走到目的地 */
export interface PlanOverlayLeg {
  from: LngLat;
  to: LngLat;
  board: LngLat;
  alight: LngLat;
  /** 實際坐到的那段公車路線 */
  ride: LngLat[];
}

/** 路線規劃要畫在地圖上的東西；還沒選好的地點、沒有方案的段都不在裡面 */
export interface PlanOverlay {
  points: PlanOverlayPoint[];
  legs: PlanOverlayLeg[];
}

type LineString = { type: "LineString"; coordinates: LngLat[] };

export function planLineFeatures(plan: PlanOverlay | null): FeatureCollection<LineString, { kind: "walk" | "ride" }> {
  if (!plan) return collection([]);
  const line = (kind: "walk" | "ride", coordinates: LngLat[]) => ({
    type: "Feature" as const,
    geometry: { type: "LineString" as const, coordinates },
    properties: { kind },
  });
  return collection(
    plan.legs.flatMap(({ from, to, board, alight, ride }) => [
      line("walk", [from, board]),
      ...(ride.length >= 2 ? [line("ride", ride)] : []),
      line("walk", [alight, to]),
    ]),
  );
}

interface PlanPointProperties {
  kind: PointKind | "stop";
  label: string;
  /** 起點、經過點、終點在 plan.points 中的位置，hover 時用來找對應的資訊；上下車站沒有 */
  order?: number;
}

export function planPointFeatures(plan: PlanOverlay | null): FeatureCollection<Point, PlanPointProperties> {
  if (!plan) return collection([]);
  const point = (properties: PlanPointProperties, coordinates: LngLat) => ({
    type: "Feature" as const,
    geometry: { type: "Point" as const, coordinates },
    properties,
  });
  const stop = (coordinates: LngLat) => point({ kind: "stop", label: "" }, coordinates);
  // 起終點與經過點的標記放在後面，畫在上下車站之上
  return collection([
    ...plan.legs.flatMap(({ board, alight }) => [stop(board), stop(alight)]),
    ...plan.points.map(({ kind, label, position }, order) => point({ kind, label, order }, position)),
  ]);
}

/** 規劃畫面要縮放到的範圍；沒有任何點時回傳 null */
export function planBounds(plan: PlanOverlay | null): [LngLat, LngLat] | null {
  if (!plan) return null;
  return boundsOfPoints([
    ...plan.points.map((p) => p.position),
    ...plan.legs.flatMap((leg) => [leg.board, leg.alight, ...leg.ride]),
  ]);
}
