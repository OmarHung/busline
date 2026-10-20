import type { LngLat } from "../types";

const LINESTRING = /^\s*LINESTRING\s*\((.*)\)\s*$/i;
const MULTILINESTRING = /^\s*MULTILINESTRING\s*\((.*)\)\s*$/i;

function parsePoint(text: string): LngLat | null {
  const [lng, lat] = text.trim().split(/\s+/).map(Number);
  return Number.isFinite(lng) && Number.isFinite(lat) ? [lng, lat] : null;
}

function parseCoordinateList(text: string): LngLat[] {
  return text
    .split(",")
    .map(parsePoint)
    .filter((point): point is LngLat => point !== null);
}

/** 把 TDX Shape 的 WKT（LINESTRING / MULTILINESTRING）轉成線段陣列，無法解析時回傳空陣列 */
export function parseWktLines(wkt: string): LngLat[][] {
  const single = LINESTRING.exec(wkt);
  const multi = single ? null : MULTILINESTRING.exec(wkt);

  const rawLines = single ? [single[1]] : multi ? Array.from(multi[1].matchAll(/\(([^()]*)\)/g), (m) => m[1]) : [];

  return rawLines.map(parseCoordinateList).filter((line) => line.length >= 2);
}
