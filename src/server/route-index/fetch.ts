import type { RouteIndex } from "@/lib/types";
import { fetchAllCities, type FetchAllCitiesOptions } from "../tdx/fetch-all-cities";
import { RouteSchema } from "../tdx/schemas";
import type { TdxLister } from "../tdx/service";
import { toRouteSummaries } from "../tdx/transform";

const ROUTE_INDEX_FIELDS = "RouteUID,RouteName,DepartureStopNameZh,DestinationStopNameZh";

const byName = new Intl.Collator("zh-Hant-TW", { numeric: true });

/**
 * 依序抓全台各縣市與公路客運的路線清單。給 scripts/build-route-index.mts 用，
 * 網站執行時不會呼叫（全台要 23 次，免費額度要好幾分鐘）。
 */
export async function fetchRouteIndex(
  client: TdxLister,
  { now = () => new Date(), ...options }: FetchAllCitiesOptions & { now?: () => Date } = {},
): Promise<RouteIndex> {
  const cities = await fetchAllCities(async (city) => {
    const routes = await client.list(`Bus/Route/${city.tdxPath}`, RouteSchema, { $select: ROUTE_INDEX_FIELDS });
    return toRouteSummaries(routes, city.code).sort(
      (a, b) => byName.compare(a.name, b.name) || a.uid.localeCompare(b.uid),
    );
  }, options);

  return { generatedAt: now().toISOString(), routes: cities.flatMap(({ items }) => items) };
}
