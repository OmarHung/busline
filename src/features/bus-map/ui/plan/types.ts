import type { LngLat, StopEta } from "@/lib/types";

/** 起點、經過點或終點 */
export interface PlanPoint {
  name: string;
  position: LngLat;
  isCurrentLocation?: boolean;
}

/** 地點在行程中的角色：第一個是起點、最後一個是終點，中間都是經過點 */
export type PointKind = "origin" | "via" | "destination";

/** 一段行程中選取的方案與方案裡的哪一條路線 */
export interface PlanSelection {
  option: number;
  ride: number;
}

/** 選取路線在上車站的即時到站；要使用者按了才查（idle），避免耗用 TDX 額度 */
export type BoardEta =
  | { status: "idle" }
  | { status: "loading" }
  /** eta 為 undefined 表示這一站沒有到站資料 */
  | { status: "ready"; eta: StopEta | undefined }
  | { status: "error" };

/** 直線距離換算步行分鐘（與後端估算方式相同：繞路 1.3 倍、每分鐘 75 公尺） */
export const walkMinutes = (meters: number) => Math.max(1, Math.round((meters * 1.3) / 75));
