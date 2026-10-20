import { distanceMeters } from "@/lib/geo/nearest";
import type { LngLat } from "@/lib/types";
import type { StopIndex } from "../stop-index/types";

/** 空間格子大小（度）；約 1 公里，步行範圍只需查相鄰格 */
const CELL_DEGREES = 0.01;
/** 經度 1 度在台灣約 101 公里，緯度約 111 公里；用來決定要查幾格 */
const METERS_PER_DEGREE = 100_000;

export interface NearbyStop {
  stop: number;
  meters: number;
}

export interface Occurrence {
  /** patterns 的索引 */
  pattern: number;
  /** 在該路線方向中的第幾站（0 起算） */
  position: number;
}

const cellKey = (x: number, y: number) => `${x},${y}`;

/** 建索引時資料量大（全台十幾萬站），直接 push 避免反覆複製陣列 */
function pushTo<K>(map: Map<K, number[]>, key: K, value: number): void {
  const bucket = map.get(key);
  if (bucket) bucket.push(value);
  else map.set(key, [value]);
}
const cellOf = ([lng, lat]: LngLat): [number, number] => [
  Math.floor(lng / CELL_DEGREES),
  Math.floor(lat / CELL_DEGREES),
];

/** 從預先產生的站序建立查詢用的索引：附近有哪些站、每個站有哪些路線經過 */
export class StopNetwork {
  private readonly grid = new Map<string, number[]>();
  private readonly occurrencesByStop: Occurrence[][];
  private readonly cumulativeMeters = new Map<number, Float64Array>();
  private readonly idsByName = new Map<string, number[]>();

  constructor(private readonly index: StopIndex) {
    index.stops.forEach(([name, lng, lat], id) => {
      const [x, y] = cellOf([lng, lat]);
      const key = cellKey(x, y);
      pushTo(this.grid, key, id);
      pushTo(this.idsByName, name, id);
    });

    this.occurrencesByStop = index.stops.map(() => []);
    index.patterns.forEach(([, , stops], pattern) => {
      stops.forEach((stop, position) => this.occurrencesByStop[stop].push({ pattern, position }));
    });
  }

  get stopCount(): number {
    return this.index.stops.length;
  }

  stop(id: number): { name: string; position: LngLat } {
    const [name, lng, lat] = this.index.stops[id];
    return { name, position: [lng, lat] };
  }

  pattern(id: number): { routeUid: string; direction: number; stops: readonly number[] } {
    const [routeUid, direction, stops] = this.index.patterns[id];
    return { routeUid, direction, stops };
  }

  /** 半徑內的站，近的在前 */
  stopsNear(point: LngLat, radiusMeters: number): NearbyStop[] {
    const [cx, cy] = cellOf(point);
    const reach = Math.ceil(radiusMeters / METERS_PER_DEGREE / CELL_DEGREES);
    const result: NearbyStop[] = [];
    for (let x = cx - reach; x <= cx + reach; x++) {
      for (let y = cy - reach; y <= cy + reach; y++) {
        for (const stop of this.grid.get(cellKey(x, y)) ?? []) {
          const meters = distanceMeters(point, this.stop(stop).position);
          if (meters <= radiusMeters) result.push({ stop, meters });
        }
      }
    }
    return result.sort((a, b) => a.meters - b.meters);
  }

  occurrences(stop: number): readonly Occurrence[] {
    return this.occurrencesByStop[stop] ?? [];
  }

  /** 同一路線方向中，第 from 站到第 to 站沿站牌的距離 */
  rideMeters(pattern: number, from: number, to: number): number {
    const cumulative = this.cumulative(pattern);
    return cumulative[to] - cumulative[from];
  }

  /** 站所屬的縣市代碼（取第一條經過的路線） */
  stopCity(stop: number): string | undefined {
    const first = this.occurrencesByStop[stop]?.[0];
    return first ? this.index.patterns[first.pattern][0].slice(0, 3) : undefined;
  }

  stopIdsByName(name: string): readonly number[] {
    return this.idsByName.get(name) ?? [];
  }

  /** 所有站名，給地點搜尋比對用 */
  names(): IterableIterator<string> {
    return this.idsByName.keys();
  }

  private cumulative(pattern: number): Float64Array {
    const cached = this.cumulativeMeters.get(pattern);
    if (cached) return cached;

    const stops = this.index.patterns[pattern][2];
    const cumulative = new Float64Array(stops.length);
    for (let i = 1; i < stops.length; i++) {
      cumulative[i] =
        cumulative[i - 1] + distanceMeters(this.stop(stops[i - 1]).position, this.stop(stops[i]).position);
    }
    this.cumulativeMeters.set(pattern, cumulative);
    return cumulative;
  }
}
