import { fetchAllCities, type FetchAllCitiesOptions } from "../tdx/fetch-all-cities";
import { StopOfRouteSchema, type TdxStopOfRoute } from "../tdx/schemas";
import type { TdxLister } from "../tdx/service";
import { mainStopsByDirection } from "../tdx/transform";
import type { StopIndex } from "./types";

const STOP_OF_ROUTE_FIELDS = "RouteUID,SubRouteUID,Direction,Stops";
/** 座標存到小數 5 位（約 1 公尺） */
const COORD_DECIMALS = 5;

const round = (value: number) => Number(value.toFixed(COORD_DECIMALS));

/**
 * 把各縣市的 TDX 站序整理成路線規劃用的精簡格式：
 * 每條路線每個方向只取主線，同名同位置的站只存一份。
 */
export function buildStopIndex(cities: ReadonlyArray<readonly TdxStopOfRoute[]>, now: Date): StopIndex {
  const stops: StopIndex["stops"] = [];
  const stopIds = new Map<string, number>();
  const patterns: StopIndex["patterns"] = [];

  const stopId = (name: string, lng: number, lat: number) => {
    const key = `${name}|${round(lng)}|${round(lat)}`;
    let id = stopIds.get(key);
    if (id === undefined) {
      id = stops.length;
      stopIds.set(key, id);
      stops.push([name, round(lng), round(lat)]);
    }
    return id;
  };

  for (const items of cities) {
    const routeUids = [...new Set(items.map((item) => item.RouteUID))].sort();
    for (const uid of routeUids) {
      const byDirection = [...mainStopsByDirection(uid, items).entries()].sort(([a], [b]) => a - b);
      for (const [direction, routeStops] of byDirection) {
        const ids = routeStops.map(({ name, position: [lng, lat] }) => stopId(name, lng, lat));
        patterns.push([uid, direction, ids]);
      }
    }
  }

  return { generatedAt: now.toISOString(), stops, patterns };
}

/** 抓全台站序（23 次呼叫）；給 scripts/build-stop-index.mts 用 */
export async function fetchStopIndex(
  client: TdxLister,
  { now = () => new Date(), ...options }: FetchAllCitiesOptions & { now?: () => Date } = {},
): Promise<StopIndex> {
  const cities = await fetchAllCities(
    (city) => client.list(`Bus/StopOfRoute/${city.tdxPath}`, StopOfRouteSchema, { $select: STOP_OF_ROUTE_FIELDS }),
    options,
  );
  return buildStopIndex(
    cities.map(({ items }) => items),
    now(),
  );
}
