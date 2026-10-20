// 產生全台站序 src/data/stop-index.json（路線規劃用，網站執行時不打 TDX）
// 用法：pnpm data:stops（需要 .env.local 的 TDX 金鑰；免費額度每分鐘 5 次，約 5 分鐘）
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fetchStopIndex } from "@/server/stop-index/build";
import { TdxClient } from "@/server/tdx/client";

const OUTPUT = join(import.meta.dirname, "..", "src", "data", "stop-index.json");
/** 整個縣市的站序資料很大，逾時要給長一點 */
const REQUEST_TIMEOUT_MS = 180_000;

if (existsSync(".env.local")) process.loadEnvFile(".env.local");
const { TDX_CLIENT_ID: clientId, TDX_CLIENT_SECRET: clientSecret } = process.env;
if (!clientId || !clientSecret) {
  console.error("缺少 TDX_CLIENT_ID / TDX_CLIENT_SECRET（.env.local 或環境變數）");
  process.exit(1);
}

const index = await fetchStopIndex(new TdxClient({ clientId, clientSecret, requestTimeoutMs: REQUEST_TIMEOUT_MS }), {
  onProgress: ({ city, done, total, count }) => console.log(`[${done}/${total}] ${city}：${count} 筆站序`),
});

// 一個站或一條路線一行，更新時的 git diff 比較好讀
const rows = (items: unknown[]) => items.map((item) => `    ${JSON.stringify(item)}`).join(",\n");
writeFileSync(
  OUTPUT,
  `{\n  "generatedAt": ${JSON.stringify(index.generatedAt)},\n  "stops": [\n${rows(index.stops)}\n  ],\n  "patterns": [\n${rows(index.patterns)}\n  ]\n}\n`,
);
console.log(`完成：${index.stops.length} 個站、${index.patterns.length} 個路線方向 → ${OUTPUT}`);
