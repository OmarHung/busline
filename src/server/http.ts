import type { LngLat } from "@/lib/types";
import { TdxError } from "./tdx/client";
import { ConfigError, RouteNotFoundError } from "./tdx/service";

export interface CachePolicy {
  /** CDN 快取秒數 */
  sMaxAge: number;
  /** 過期後仍可先回舊資料、背景更新的秒數 */
  staleWhileRevalidate: number;
}

export function cachedJson(data: unknown, { sMaxAge, staleWhileRevalidate }: CachePolicy): Response {
  return Response.json(data, {
    headers: {
      "cache-control": `public, max-age=0, s-maxage=${sMaxAge}, stale-while-revalidate=${staleWhileRevalidate}`,
    },
  });
}

const noStore = { "cache-control": "no-store" };

/** 把服務層錯誤轉成給前端看的訊息；細節只記在伺服器端 */
export function errorResponse(error: unknown, context: string): Response {
  if (error instanceof RouteNotFoundError) {
    // 查無路線也讓 CDN 快取一陣子，亂數 uid 才不會每次都打到 TDX
    return Response.json(
      { error: "找不到這條路線" },
      { status: 404, headers: { "cache-control": "public, max-age=0, s-maxage=600" } },
    );
  }
  if (error instanceof ConfigError) {
    console.error(`[${context}]`, error.message);
    return Response.json({ error: "伺服器尚未設定 TDX 金鑰" }, { status: 503, headers: noStore });
  }

  if (error instanceof TdxError && error.status === 429) {
    // 限流是預期內的狀況，不印 stack
    console.warn(`[${context}]`, error.message);
    return Response.json(
      { error: "資料來源的呼叫次數暫時用完了，請稍候一分鐘再試" },
      { status: 503, headers: { ...noStore, "retry-after": "60" } },
    );
  }

  console.error(`[${context}]`, error);
  const message = error instanceof TdxError ? "交通部 TDX 資料暫時無法取得，請稍後再試" : "伺服器發生錯誤";
  return Response.json({ error: message }, { status: 502, headers: noStore });
}

/** 台灣（含離島）的經緯度範圍，用來擋掉不合理的座標參數 */
const TAIWAN_BOUNDS = { minLng: 118, maxLng: 123, minLat: 21, maxLat: 27 };

/** 解析 "經度,緯度"；格式錯誤或不在台灣範圍內回傳 null */
export function parseLngLat(text: string | null): LngLat | null {
  const parts = text?.split(",") ?? [];
  if (parts.length !== 2) return null;
  const [lng, lat] = parts.map(Number);
  const { minLng, maxLng, minLat, maxLat } = TAIWAN_BOUNDS;
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
  if (lng < minLng || lng > maxLng || lat < minLat || lat > maxLat) return null;
  return [lng, lat];
}

export function badRequest(message: string): Response {
  return Response.json({ error: message }, { status: 400, headers: noStore });
}
