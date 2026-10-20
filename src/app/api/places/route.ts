import type { NextRequest } from "next/server";
import { badRequest, cachedJson, errorResponse, parseLngLat } from "@/server/http";
import { getPlaceSearch } from "@/server/planning";

const MAX_QUERY_LENGTH = 50;

/** GET /api/places?q=關鍵字[&near=經度,緯度] → 公車站名＋OpenStreetMap 地點 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const query = params.get("q")?.trim() ?? "";
  if (!query || query.length > MAX_QUERY_LENGTH) return badRequest(`請輸入 1～${MAX_QUERY_LENGTH} 個字`);
  const near = parseLngLat(params.get("near")) ?? undefined;

  try {
    const places = await getPlaceSearch()(query, near);
    return cachedJson({ places }, { sMaxAge: 3600, staleWhileRevalidate: 86_400 });
  } catch (error) {
    return errorResponse(error, "GET /api/places");
  }
}
