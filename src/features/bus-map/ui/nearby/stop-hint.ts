import { distanceMeters } from "@/lib/geo/nearest";
import type { LngLat, Stop } from "@/lib/types";

/** 從附近站牌點進路線時，要選取的是哪一站；站牌 uid 要等路線詳情載入後才比對得出來 */
export interface StopHint {
  uid: string;
  direction: number;
  name: string;
  position: LngLat;
}

/** 路線詳情裡對應的站：同名站牌中離提示位置最近的一支；沒有同名的站時回傳 null */
export function hintedStopUid(stops: readonly Stop[], hint: Pick<StopHint, "name" | "position">): string | null {
  let best: string | null = null;
  let bestDistance = Infinity;
  for (const stop of stops) {
    if (stop.name !== hint.name) continue;
    const meters = distanceMeters(stop.position, hint.position);
    if (meters < bestDistance) {
      best = stop.uid;
      bestDistance = meters;
    }
  }
  return best;
}
