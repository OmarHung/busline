import type { LngLat } from "@/lib/types";

/** 起點或終點 */
export interface PlanPoint {
  name: string;
  position: LngLat;
  isCurrentLocation?: boolean;
}

export type PlanField = "origin" | "destination";

/** 直線距離換算步行分鐘（與後端估算方式相同：繞路 1.3 倍、每分鐘 75 公尺） */
export const walkMinutes = (meters: number) => Math.max(1, Math.round((meters * 1.3) / 75));
