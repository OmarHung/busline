import type { NextRequest } from "next/server";
import { badRequest, cachedJson, errorResponse, parseLngLat } from "@/server/http";
import { planDirect } from "@/server/planner/plan";
import { getRoutesByUid, getStopNetwork } from "@/server/planning";

/** GET /api/plan?from=經度,緯度&to=經度,緯度 → 直達方案（只用預先產生的站序，不打 TDX） */
export function GET(request: NextRequest) {
  const from = parseLngLat(request.nextUrl.searchParams.get("from"));
  const to = parseLngLat(request.nextUrl.searchParams.get("to"));
  if (!from || !to) return badRequest("起點或終點座標不正確");

  try {
    const result = planDirect(getStopNetwork(), getRoutesByUid(), from, to);
    return cachedJson(result, { sMaxAge: 3600, staleWhileRevalidate: 86_400 });
  } catch (error) {
    return errorResponse(error, "GET /api/plan");
  }
}
