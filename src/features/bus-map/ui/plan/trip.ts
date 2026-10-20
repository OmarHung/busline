import { nearestStopIndex } from "@/lib/geo/nearest";
import { sliceLineBetween } from "@/lib/geo/slice";
import {
  etaKey,
  type PlanOption,
  type PlanResult,
  type PlanRide,
  type RouteDetail,
  type RouteLive,
  type TripPlan,
} from "@/lib/types";
import type { PlanOverlay, PlanOverlayLeg } from "../../map/geojson";
import type { BoardEta, PlanPoint, PlanSelection, PointKind } from "./types";

/** 各段選取路線的詳情，以 RouteUID 為 key；null 表示抓不到（地圖改用站牌連線） */
export type RouteDetails = Readonly<Record<string, RouteDetail | null>>;

/** 一段行程：從一個地點到下一個地點 */
export interface PlanLeg {
  /** 第幾段＋起訖座標；地點改了 key 就跟著變，選取也回到預設 */
  key: string;
  from: PlanPoint;
  to: PlanPoint;
  /** 還沒拿到規劃結果時為 undefined */
  result: PlanResult | undefined;
  selection: PlanSelection | null;
  option: PlanOption | undefined;
  ride: PlanRide | undefined;
  /** 使用者按了「查看下一班」的就是這一段選取的路線 */
  isLiveRequested: boolean;
}

export function pointKind(index: number, count: number): PointKind {
  if (index === 0) return "origin";
  return index === count - 1 ? "destination" : "via";
}

/** 欄位與資訊卡上的名稱；經過點用欄位的位置當編號 */
export const pointTitle = (kind: PointKind, index: number) =>
  kind === "origin" ? "起點" : kind === "destination" ? "終點" : `經過點 ${index}`;

const pointKey = (point: PlanPoint) => point.position.join(",");

/** 一段行程選取的路線；即時到站的請求綁定這個 key，換方案或換路線就失效 */
export function legSelectionKey(leg: Pick<PlanLeg, "key" | "selection">): string | null {
  return leg.selection ? `${leg.key}|${leg.selection.option}:${leg.selection.ride}` : null;
}

/** 把依序的地點切成各段，配上規劃結果與選取（沒選過的段預設第一個方案） */
export function buildLegs(
  points: readonly PlanPoint[],
  trip: TripPlan | undefined,
  choices: Readonly<Record<string, PlanSelection>>,
  liveKey: string | null,
): PlanLeg[] {
  return points.slice(1).map((to, i) => {
    const from = points[i];
    const key = `${i}:${pointKey(from)}|${pointKey(to)}`;
    const result = trip?.legs[i];
    const hasOptions = (result?.options.length ?? 0) > 0;
    const selection = choices[key] ?? (hasOptions ? { option: 0, ride: 0 } : null);
    const option = selection ? result?.options[selection.option] : undefined;
    const ride = selection ? option?.rides[selection.ride] : undefined;
    const isLiveRequested = liveKey !== null && legSelectionKey({ key, selection }) === liveKey;
    return { key, from, to, result, selection, option, ride, isLiveRequested };
  });
}

const rideDirection = (detail: RouteDetail | null | undefined, ride: PlanRide) =>
  detail?.directions.find((d) => d.direction === ride.direction);

/**
 * 地圖上要畫的行程。points 含還沒選的 null（經過點的編號跟著欄位走）；
 * 線型有載入就沿實際路線切出坐到的那段，否則用站牌連線。
 */
export function tripOverlay(
  points: ReadonlyArray<PlanPoint | null>,
  legs: readonly PlanLeg[],
  details: RouteDetails,
): PlanOverlay {
  const labels: Record<PointKind, (index: number) => string> = {
    origin: () => "起",
    via: (index) => String(index),
    destination: () => "終",
  };
  return {
    points: points.flatMap((point, index) => {
      if (!point) return [];
      const kind = pointKind(index, points.length);
      return [{ kind, label: labels[kind](index), position: point.position }];
    }),
    legs: legs.flatMap((leg): PlanOverlayLeg[] => {
      const { option, ride } = leg;
      if (!option || !ride) return [];
      const direction = rideDirection(details[ride.route.uid], ride);
      const exact =
        direction && !direction.isApproximate
          ? sliceLineBetween(direction.lines, option.board.position, option.alight.position)
          : null;
      return [
        {
          from: leg.from.position,
          to: leg.to.position,
          board: option.board.position,
          alight: option.alight.position,
          ride: exact ?? ride.path,
        },
      ];
    }),
  };
}

/** 一段行程上車站的即時到站；要等即時資料與該路線的站序都到了才知道是哪一站 */
export function boardEtaOf(
  leg: PlanLeg,
  live: { data?: RouteLive; error?: Error },
  details: RouteDetails | undefined,
): BoardEta {
  const { option, ride } = leg;
  if (!leg.isLiveRequested || !option || !ride) return { status: "idle" };
  const detail = details?.[ride.route.uid];
  if ((live.error && !live.data) || detail === null) return { status: "error" };
  if (!live.data || !detail) return { status: "loading" };
  if (live.data.unavailable.includes("etas")) return { status: "error" };

  const stops = rideDirection(detail, ride)?.stops ?? [];
  const i = nearestStopIndex(stops, option.board.position);
  return { status: "ready", eta: i >= 0 ? live.data.etas[etaKey(ride.direction, stops[i].uid)] : undefined };
}

/** 各段選取路線的步行＋乘車時間合計；有一段沒有直達公車就算不出來 */
export function tripMinutes(legs: readonly PlanLeg[]): number | null {
  let total = 0;
  for (const { ride } of legs) {
    if (!ride) return null;
    total += ride.estimatedMinutes;
  }
  return total;
}

/** 地圖上 hover（手機為點一下）某個地點時要顯示的公車資訊 */
export interface PointBusInfo {
  kind: PointKind;
  title: string;
  name: string;
  /** 相關那一段在 legs 中的位置：起點、經過點是從這裡出發的那段，終點是抵達的那段 */
  leg: number;
  departure: PlanLeg | undefined;
  arrival: PlanLeg | undefined;
}

/** order 是第幾個已選的地點（與地圖上的標記順序相同）；不存在時回傳 null */
export function pointBusInfo(
  points: ReadonlyArray<PlanPoint | null>,
  legs: readonly PlanLeg[],
  order: number,
): PointBusInfo | null {
  const chosen = points.flatMap((point, index) => (point ? [{ point, index }] : []));
  const slot = chosen[order];
  if (!slot) return null;
  const kind = pointKind(slot.index, points.length);
  const isDestination = kind === "destination";
  const leg = isDestination ? order - 1 : order;
  return {
    kind,
    title: pointTitle(kind, slot.index),
    name: slot.point.name,
    leg,
    departure: isDestination ? undefined : legs[leg],
    arrival: isDestination ? legs[leg] : undefined,
  };
}
