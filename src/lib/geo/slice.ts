import type { LngLat } from "../types";
import { distanceMeters } from "./nearest";

const samePoint = (a: LngLat, b: LngLat) => a[0] === b[0] && a[1] === b[1];

function nearestIndex(line: readonly LngLat[], point: LngLat, from: number): number {
  let best = -1;
  let bestDistance = Infinity;
  for (let i = from; i < line.length; i++) {
    const d = distanceMeters(line[i], point);
    if (d < bestDistance) {
      best = i;
      bestDistance = d;
    }
  }
  return best;
}

/**
 * 從路線線型中切出 start 到 end 之間的那一段（只畫實際坐到的部分）。
 * end 只往 start 之後找，循環線也不會切反；找不到合理的一段時回傳 null。
 */
export function sliceLineBetween(lines: readonly LngLat[][], start: LngLat, end: LngLat): LngLat[] | null {
  const line = lines.flat();
  const startIndex = nearestIndex(line, start, 0);
  if (startIndex < 0) return null;
  const endIndex = nearestIndex(line, end, startIndex + 1);
  if (endIndex <= startIndex) return null;
  const sliced = [start, ...line.slice(startIndex, endIndex + 1), end];
  return sliced.filter((point, i) => i === 0 || !samePoint(point, sliced[i - 1]));
}
