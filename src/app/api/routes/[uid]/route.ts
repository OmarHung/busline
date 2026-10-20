import { cachedJson, errorResponse } from "@/server/http";
import { getBusService } from "@/server/tdx/service";

export async function GET(_req: Request, ctx: RouteContext<"/api/routes/[uid]">) {
  const { uid } = await ctx.params;
  try {
    const detail = await getBusService().getRouteDetail(uid);
    // TDX 偶爾回空資料，這種結果只短暫快取
    const sMaxAge = detail.directions.length > 0 ? 43_200 : 300;
    return cachedJson(detail, { sMaxAge, staleWhileRevalidate: 604_800 });
  } catch (error) {
    return errorResponse(error, `GET /api/routes/${uid}`);
  }
}
