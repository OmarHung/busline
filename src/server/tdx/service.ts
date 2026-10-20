import { cityByCode, type City } from "@/lib/cities";
import type { RouteDetail, RouteLive, RouteSummary } from "@/lib/types";
import { TtlCache, type CacheOptions } from "../cache";
import { TdxClient } from "./client";
import { BusSchema, EtaSchema, ShapeSchema, StopOfRouteSchema } from "./schemas";
import { ROUTE_INDEX } from "../route-index/data";
import { buildRouteDetail, buildRouteLive } from "./transform";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/** 線型、站序很少變動；TDX 故障時舊資料可再撐一週 */
const STATIC_CACHE = { ttlMs: 12 * HOUR, maxStaleMs: 7 * 24 * HOUR };
/** TDX 偶爾回空陣列；空結果只短暫快取 */
const EMPTY_RESULT_TTL_MS = 5 * MINUTE;
/**
 * TDX 免費會員每分鐘只有 5 次；一條路線的即時資料要 2 次，30 秒更新一次剛好在額度內。
 * 超過兩分鐘的舊資料就不再拿出來用。
 */
const LIVE_CACHE = { ttlMs: 30_000, maxStaleMs: 2 * MINUTE };

export class RouteNotFoundError extends Error {
  override readonly name = "RouteNotFoundError";
}

export class ConfigError extends Error {
  override readonly name = "ConfigError";
}

export type TdxLister = Pick<TdxClient, "list">;

export interface BusService {
  getRouteDetail(uid: string): Promise<RouteDetail>;
  getRouteLive(uid: string): Promise<RouteLive>;
}

interface BusServiceDeps {
  client: TdxLister;
  /** 預先產生的全台路線清單；不在清單裡的 uid 一律視為不存在，不打 TDX */
  routes: readonly RouteSummary[];
  cache: TtlCache;
  now?: () => Date;
}

/** encodeURIComponent 不會編碼 !'()*，路線名稱放進 path 時一併處理 */
const encodePathSegment = (text: string) =>
  encodeURIComponent(text).replace(/[!'()*]/g, (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`);

const valueOf = <T>(result: PromiseSettledResult<T>): T | null => (result.status === "fulfilled" ? result.value : null);

export function createBusService({ client, routes, cache, now = () => new Date() }: BusServiceDeps): BusService {
  const routesByUid = new Map(routes.map((route) => [route.uid, route]));

  const resolve = (uid: string): { route: RouteSummary; city: City } => {
    const route = routesByUid.get(uid);
    const city = route && cityByCode(route.cityCode);
    if (!route || !city) throw new RouteNotFoundError(`找不到路線 ${uid}`);
    return { route, city };
  };

  // uid 來自路線清單（只有英數字），可以安全放進 OData 字串
  const byUid = (uid: string) => ({ $filter: `RouteUID eq '${uid}'` });

  /** TDX 依路線名稱查詢的 path，再用 RouteUID 篩掉同名或名稱相近的路線 */
  const routePath = (kind: string, city: City, route: RouteSummary) =>
    `Bus/${kind}/${city.tdxPath}/${encodePathSegment(route.name)}`;

  const detailCache: CacheOptions<RouteDetail> = {
    ...STATIC_CACHE,
    ttlMs: (detail) => (detail.directions.length > 0 ? STATIC_CACHE.ttlMs : EMPTY_RESULT_TTL_MS),
  };

  return {
    async getRouteDetail(uid) {
      const { route, city } = resolve(uid);
      return cache.getOrLoad(`detail:${uid}`, detailCache, async () => {
        const [shapes, stopOfRoutes] = await Promise.allSettled([
          client.list(routePath("Shape", city, route), ShapeSchema, byUid(uid)),
          client.list(routePath("StopOfRoute", city, route), StopOfRouteSchema, byUid(uid)),
        ]);
        // 站序是必要的；線型抓不到時改用站牌連線
        if (stopOfRoutes.status === "rejected") throw stopOfRoutes.reason;
        return buildRouteDetail(route, valueOf(shapes) ?? [], stopOfRoutes.value);
      });
    },

    async getRouteLive(uid) {
      const { route, city } = resolve(uid);
      return cache.getOrLoad(`live:${uid}`, LIVE_CACHE, async () => {
        const [etas, buses] = await Promise.allSettled([
          client.list(routePath("EstimatedTimeOfArrival", city, route), EtaSchema, byUid(uid)),
          client.list(routePath("RealTimeByFrequency", city, route), BusSchema, byUid(uid)),
        ]);
        if (etas.status === "rejected" && buses.status === "rejected") throw etas.reason;
        return buildRouteLive(uid, valueOf(etas), valueOf(buses), now());
      });
    },
  };
}

let instance: BusService | null = null;

/** 依環境變數建立的單例；缺少金鑰時丟出 ConfigError */
export function getBusService(): BusService {
  if (instance) return instance;

  const clientId = process.env.TDX_CLIENT_ID;
  const clientSecret = process.env.TDX_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new ConfigError("尚未設定 TDX_CLIENT_ID / TDX_CLIENT_SECRET");
  }

  instance = createBusService({
    client: new TdxClient({ clientId, clientSecret }),
    routes: ROUTE_INDEX.routes,
    cache: new TtlCache({
      onError: (key, error) => console.error(`[cache] 背景更新 ${key} 失敗`, error),
    }),
  });
  return instance;
}
