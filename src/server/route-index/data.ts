import type { RouteIndex } from "@/lib/types";
import routeIndex from "@/data/route-index.json";

/** 由 `pnpm data:routes`（scripts/build-route-index.mts）產生，跟著程式一起部署 */
export const ROUTE_INDEX: RouteIndex = routeIndex;
