import { cachedJson, errorResponse } from "@/server/http";
import { getBusService } from "@/server/tdx/service";

export async function GET(_req: Request, ctx: RouteContext<"/api/routes/[uid]/live">) {
  const { uid } = await ctx.params;
  try {
    const live = await getBusService().getRouteLive(uid);
    return cachedJson(live, { sMaxAge: 30, staleWhileRevalidate: 30 });
  } catch (error) {
    return errorResponse(error, `GET /api/routes/${uid}/live`);
  }
}
