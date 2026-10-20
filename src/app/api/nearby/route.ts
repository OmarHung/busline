import type { NextRequest } from "next/server";
import { badRequest, cachedJson, errorResponse, parseLngLat } from "@/server/http";
import { findNearbyStations } from "@/server/nearby/stations";
import { getRoutesByUid, getStopNetwork } from "@/server/planning";

/**
 * GET /api/nearby?at=經度,緯度 → 附近的公車站與各站可搭的路線
 * （只用預先產生的站序，不打 TDX）
 */
export function GET(request: NextRequest) {
  const at = parseLngLat(request.nextUrl.searchParams.get("at"));
  if (!at) return badRequest("位置座標不正確");

  try {
    const stations = findNearbyStations(getStopNetwork(), getRoutesByUid(), at);
    return cachedJson({ stations }, { sMaxAge: 3600, staleWhileRevalidate: 86_400 });
  } catch (error) {
    return errorResponse(error, "GET /api/nearby");
  }
}
