import stopIndex from "@/data/stop-index.json";
import type { RouteSummary } from "@/lib/types";
import { TtlCache } from "./cache";
import { createPlaceSearch } from "./places/search";
import { StopNetwork } from "./planner/network";
import { ROUTE_INDEX } from "./route-index/data";
import type { StopIndex } from "./stop-index/types";

// 站序資料約 4 MB，第一次用到才建索引（冷啟動約幾十毫秒）
let network: StopNetwork | null = null;
let routesByUid: Map<string, RouteSummary> | null = null;
let placeSearch: ReturnType<typeof createPlaceSearch> | null = null;

export function getStopNetwork(): StopNetwork {
  network ??= new StopNetwork(stopIndex as StopIndex);
  return network;
}

export function getRoutesByUid(): ReadonlyMap<string, RouteSummary> {
  routesByUid ??= new Map(ROUTE_INDEX.routes.map((route) => [route.uid, route]));
  return routesByUid;
}

export function getPlaceSearch() {
  placeSearch ??= createPlaceSearch({
    network: getStopNetwork(),
    cache: new TtlCache({ maxEntries: 5000 }),
    onError: (error) => console.warn("[places] Photon 查詢失敗，只回傳公車站", error),
  });
  return placeSearch;
}
