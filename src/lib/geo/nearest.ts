import type { LngLat, Stop } from "../types";

const EARTH_RADIUS_M = 6_371_000;
/** 公車離最近站牌超過這個距離，就不歸到任何站 */
const MAX_DISTANCE_M = 800;

export function distanceMeters([lng1, lat1]: LngLat, [lng2, lat2]: LngLat): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a));
}

/** 找出離公車最近的站牌索引；太遠或沒有站牌時回傳 -1 */
export function nearestStopIndex(stops: readonly Stop[], position: LngLat): number {
  let best = -1;
  let bestDistance = MAX_DISTANCE_M;
  stops.forEach((stop, index) => {
    const d = distanceMeters(stop.position, position);
    if (d < bestDistance) {
      best = index;
      bestDistance = d;
    }
  });
  return best;
}
