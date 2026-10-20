// 產生全台站序 src/data/stop-index.json（路線規劃用）與各路線詳情 public/data/routes/{uid}.json（線型＋站序，前端直接讀），
// 網站執行時都不打 TDX。
// 用法：pnpm data:stops（路線詳情依 route-index.json 產生，路線清單有更新要先跑 pnpm data:routes；
// 需要 .env.local 的 TDX 金鑰；站序與線型共 46 次呼叫，免費額度每分鐘 5 次，約 10 分鐘）
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isValidRouteUid } from "@/lib/cities";
import { buildRouteDetails, fetchShapes } from "@/server/route-details/build";
import { ROUTE_INDEX } from "@/server/route-index/data";
import { buildStopIndex, fetchStopOfRoutes } from "@/server/stop-index/build";
import { TdxClient } from "@/server/tdx/client";

const ROOT = join(import.meta.dirname, "..");
const STOP_INDEX_OUTPUT = join(ROOT, "src", "data", "stop-index.json");
const ROUTE_DETAILS_DIR = join(ROOT, "public", "data", "routes");
/** 整個縣市的站序、線型資料很大，逾時要給長一點 */
const REQUEST_TIMEOUT_MS = 180_000;

if (existsSync(".env.local")) process.loadEnvFile(".env.local");
const { TDX_CLIENT_ID: clientId, TDX_CLIENT_SECRET: clientSecret } = process.env;
if (!clientId || !clientSecret) {
  console.error("缺少 TDX_CLIENT_ID / TDX_CLIENT_SECRET（.env.local 或環境變數）");
  process.exit(1);
}

const client = new TdxClient({ clientId, clientSecret, requestTimeoutMs: REQUEST_TIMEOUT_MS });
const stopOfRoutes = await fetchStopOfRoutes(client, {
  onProgress: ({ city, done, total, count }) => console.log(`[站序 ${done}/${total}] ${city}：${count} 筆`),
});
const shapes = await fetchShapes(client, {
  onProgress: ({ city, done, total, count }) => console.log(`[線型 ${done}/${total}] ${city}：${count} 筆`),
});

const index = buildStopIndex(stopOfRoutes, new Date());
// 一個站或一條路線一行，更新時的 git diff 比較好讀
const rows = (items: unknown[]) => items.map((item) => `    ${JSON.stringify(item)}`).join(",\n");
writeFileSync(
  STOP_INDEX_OUTPUT,
  `{\n  "generatedAt": ${JSON.stringify(index.generatedAt)},\n  "stops": [\n${rows(index.stops)}\n  ],\n  "patterns": [\n${rows(index.patterns)}\n  ]\n}\n`,
);
console.log(`站序：${index.stops.length} 個站、${index.patterns.length} 個路線方向 → ${STOP_INDEX_OUTPUT}`);

// 一條路線一個檔，內容不含產生時間，沒變的路線重新產生也不會有 diff；先清空，停駛路線的舊檔才不會留著
const details = buildRouteDetails(ROUTE_INDEX.routes, stopOfRoutes.flat(), shapes.flat()).filter((detail) =>
  isValidRouteUid(detail.uid),
);
rmSync(ROUTE_DETAILS_DIR, { recursive: true, force: true });
mkdirSync(ROUTE_DETAILS_DIR, { recursive: true });
for (const detail of details) writeFileSync(join(ROUTE_DETAILS_DIR, `${detail.uid}.json`), JSON.stringify(detail));

const withoutStops = details.filter((detail) => detail.directions.length === 0).length;
const approximate = details.filter((detail) => detail.directions.some((d) => d.isApproximate)).length;
console.log(
  `路線詳情：${details.length} 條（${withoutStops} 條沒有站序、${approximate} 條沒有線型）→ ${ROUTE_DETAILS_DIR}`,
);
