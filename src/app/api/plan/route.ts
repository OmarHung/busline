import type { NextRequest } from "next/server";
import { MAX_WAYPOINTS } from "@/lib/types";
import { badRequest, cachedJson, errorResponse, parseLngLatList } from "@/server/http";
import { planTrip } from "@/server/planner/plan";
import { getRoutesByUid, getStopNetwork } from "@/server/planning";

/**
 * GET /api/plan?points=經度,緯度;經度,緯度[;…] → 起點、經過點、終點之間各段的直達方案
 * （只用預先產生的站序，不打 TDX）
 */
export function GET(request: NextRequest) {
  const points = parseLngLatList(request.nextUrl.searchParams.get("points"));
  if (!points || points.length < 2) return badRequest("起點、經過點或終點的座標不正確");
  if (points.length > MAX_WAYPOINTS + 2) return badRequest(`經過點最多 ${MAX_WAYPOINTS} 個`);

  try {
    const trip = planTrip(getStopNetwork(), getRoutesByUid(), points);
    return cachedJson(trip, { sMaxAge: 3600, staleWhileRevalidate: 86_400 });
  } catch (error) {
    return errorResponse(error, "GET /api/plan");
  }
}
