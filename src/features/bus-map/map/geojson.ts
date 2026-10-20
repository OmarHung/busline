import type { LiveBus, LngLat, RouteDetail, RouteDirection } from "@/lib/types";

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

/** 路線規劃要畫在地圖上的東西；還沒有的部分為 null */
export interface PlanOverlay {
  origin: LngLat | null;
  destination: LngLat | null;
  board: LngLat | null;
  alight: LngLat | null;
  /** 實際坐到的那段公車路線 */
  ride: LngLat[] | null;
}

type LineString = { type: "LineString"; coordinates: LngLat[] };

export function planLineFeatures(plan: PlanOverlay | null): FeatureCollection<LineString, { kind: "walk" | "ride" }> {
  if (!plan) return collection([]);
  const line = (kind: "walk" | "ride", coordinates: LngLat[]) => ({
    type: "Feature" as const,
    geometry: { type: "LineString" as const, coordinates },
    properties: { kind },
  });
  const { origin, destination, board, alight, ride } = plan;
  return collection([
    ...(origin && board ? [line("walk", [origin, board])] : []),
    ...(ride && ride.length >= 2 ? [line("ride", ride)] : []),
    ...(alight && destination ? [line("walk", [alight, destination])] : []),
  ]);
}

export function planPointFeatures(
  plan: PlanOverlay | null,
): FeatureCollection<Point, { kind: "origin" | "destination" | "stop"; label: string }> {
  if (!plan) return collection([]);
  const point = (kind: "origin" | "destination" | "stop", label: string, coordinates: LngLat) => ({
    type: "Feature" as const,
    geometry: { type: "Point" as const, coordinates },
    properties: { kind, label },
  });
  const { origin, destination, board, alight } = plan;
  return collection([
    ...(board ? [point("stop", "", board)] : []),
    ...(alight ? [point("stop", "", alight)] : []),
    ...(origin ? [point("origin", "起", origin)] : []),
    ...(destination ? [point("destination", "終", destination)] : []),
  ]);
}

/** 規劃畫面要縮放到的範圍；沒有任何點時回傳 null */
export function planBounds(plan: PlanOverlay | null): [LngLat, LngLat] | null {
  if (!plan) return null;
  const points = [plan.origin, plan.destination, plan.board, plan.alight, ...(plan.ride ?? [])].filter(
    (p): p is LngLat => p !== null,
  );
  return boundsOfPoints(points);
}
