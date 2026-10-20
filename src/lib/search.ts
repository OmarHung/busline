import { CITIES } from "./cities";
import { normalizeText } from "./text";
import type { RouteSummary } from "./types";

export interface RouteGroup {
  cityCode: string;
  cityName: string;
  routes: RouteSummary[];
}

const DEFAULT_LIMIT = 60;
const CITY_ORDER = new Map(CITIES.map((city, index) => [city.code, index]));

/** 分數越小越前面；-1 表示不符合 */
function score(route: RouteSummary, query: string): number {
  const name = normalizeText(route.name);
  if (name === query) return 0;
  if (name.startsWith(query)) return 1;
  if (name.includes(query)) return 2;
  if (normalizeText(route.from).includes(query) || normalizeText(route.to).includes(query)) return 3;
  return -1;
}

export function searchRoutes(routes: readonly RouteSummary[], rawQuery: string, limit = DEFAULT_LIMIT): RouteGroup[] {
  const query = normalizeText(rawQuery);
  if (!query) return [];

  const matches = routes
    .map((route) => ({ route, score: score(route, query) }))
    .filter((m) => m.score >= 0)
    .sort(
      (a, b) =>
        a.score - b.score ||
        a.route.name.length - b.route.name.length ||
        a.route.name.localeCompare(b.route.name, "zh-Hant"),
    )
    .slice(0, limit);

  const groups = new Map<string, RouteSummary[]>();
  for (const { route } of matches) {
    groups.set(route.cityCode, [...(groups.get(route.cityCode) ?? []), route]);
  }

  return [...groups.entries()]
    .sort(([a], [b]) => (CITY_ORDER.get(a) ?? 99) - (CITY_ORDER.get(b) ?? 99))
    .map(([cityCode, list]) => ({
      cityCode,
      cityName: CITIES.find((c) => c.code === cityCode)?.name ?? cityCode,
      routes: list,
    }));
}
