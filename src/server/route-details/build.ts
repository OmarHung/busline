import { simplifyLine } from "@/lib/geo/simplify";
import type { LngLat, RouteDetail, RouteSummary } from "@/lib/types";
import { fetchAllCities, type FetchAllCitiesOptions } from "../tdx/fetch-all-cities";
import { ShapeSchema, type TdxShape, type TdxStopOfRoute } from "../tdx/schemas";
import type { TdxLister } from "../tdx/service";
import { buildRouteDetail } from "../tdx/transform";

const SHAPE_FIELDS = "RouteUID,SubRouteUID,Direction,Geometry";
/** 線型簡化的容許誤差；地圖放到最大也看不出差別，檔案約小四成 */
const SIMPLIFY_TOLERANCE_METERS = 2;
/** 座標存到小數 5 位（約 1 公尺） */
const COORD_DECIMALS = 5;

const round = (value: number) => Number(value.toFixed(COORD_DECIMALS));
const roundPoint = ([lng, lat]: LngLat): LngLat => [round(lng), round(lat)];

function groupByRoute<T extends { RouteUID: string }>(items: readonly T[]): Map<string, T[]> {
  const result = new Map<string, T[]>();
  for (const item of items) {
    const bucket = result.get(item.RouteUID);
    if (bucket) bucket.push(item);
    else result.set(item.RouteUID, [item]);
  }
  return result;
}

/** 縮小檔案：座標取到約 1 公尺、線型簡化 */
function compact(detail: RouteDetail): RouteDetail {
  return {
    ...detail,
    directions: detail.directions.map((direction) => ({
      ...direction,
      lines: direction.lines.map((line) => simplifyLine(line.map(roundPoint), SIMPLIFY_TOLERANCE_METERS)),
      stops: direction.stops.map((stop) => ({ ...stop, position: roundPoint(stop.position) })),
    })),
  };
}

/**
 * 把全台的站序與線型整理成每條路線的詳情（前端直接讀的靜態檔）。
 * 路線清單裡每條路線都會有一份，TDX 沒有站序的路線 directions 為空。
 */
export function buildRouteDetails(
  routes: readonly RouteSummary[],
  stopOfRoutes: readonly TdxStopOfRoute[],
  shapes: readonly TdxShape[],
): RouteDetail[] {
  const stopsByRoute = groupByRoute(stopOfRoutes);
  const shapesByRoute = groupByRoute(shapes);
  return routes.map((route) =>
    compact(buildRouteDetail(route, shapesByRoute.get(route.uid) ?? [], stopsByRoute.get(route.uid) ?? [])),
  );
}

/** 抓全台線型（23 次呼叫），依縣市分組；給 scripts/build-stop-data.mts 用 */
export async function fetchShapes(client: TdxLister, options: FetchAllCitiesOptions = {}): Promise<TdxShape[][]> {
  const cities = await fetchAllCities(
    (city) => client.list(`Bus/Shape/${city.tdxPath}`, ShapeSchema, { $select: SHAPE_FIELDS }),
    options,
  );
  return cities.map(({ items }) => items);
}
