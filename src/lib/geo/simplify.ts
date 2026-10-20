import type { LngLat } from "../types";

const METERS_PER_DEGREE_LAT = 110_540;
const METERS_PER_DEGREE_LNG_AT_EQUATOR = 111_320;

type Xy = readonly [x: number, y: number];

/** 點到線段的距離平方（平面座標，公尺） */
function distanceToSegmentSq([px, py]: Xy, [ax, ay]: Xy, [bx, by]: Xy): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq === 0 ? 0 : Math.min(1, Math.max(0, ((px - ax) * dx + (py - ay) * dy) / lengthSq));
  return (ax + t * dx - px) ** 2 + (ay + t * dy - py) ** 2;
}

/**
 * Douglas–Peucker 線型簡化：拿掉離前後連線不到 toleranceMeters 的點，起訖點一定保留。
 * 一條公車路線的範圍不大，用起點緯度的等距投影近似平面距離就夠準。
 */
export function simplifyLine(line: readonly LngLat[], toleranceMeters: number): LngLat[] {
  if (line.length < 3) return [...line];

  const metersPerDegreeLng = METERS_PER_DEGREE_LNG_AT_EQUATOR * Math.cos((line[0][1] * Math.PI) / 180);
  const points: Xy[] = line.map(([lng, lat]) => [lng * metersPerDegreeLng, lat * METERS_PER_DEGREE_LAT]);
  const keep = line.map((_, i) => i === 0 || i === line.length - 1);
  const toleranceSq = toleranceMeters ** 2;

  // 用堆疊取代遞迴，很長的線型也不會超過呼叫深度
  const ranges: Array<[start: number, end: number]> = [[0, line.length - 1]];
  for (let range = ranges.pop(); range; range = ranges.pop()) {
    const [start, end] = range;
    let farthest = -1;
    let farthestSq = toleranceSq;
    for (let i = start + 1; i < end; i++) {
      const d = distanceToSegmentSq(points[i], points[start], points[end]);
      if (d > farthestSq) {
        farthest = i;
        farthestSq = d;
      }
    }
    if (farthest >= 0) {
      keep[farthest] = true;
      ranges.push([start, farthest], [farthest, end]);
    }
  }
  return line.filter((_, i) => keep[i]);
}
