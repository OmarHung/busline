// 產生全台路線清單 src/data/route-index.json（網站執行時不再向 TDX 抓路線清單）
// 用法：pnpm data:routes（需要 .env.local 的 TDX 金鑰；免費額度每分鐘 5 次，約 5 分鐘）
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fetchRouteIndex } from "@/server/route-index/fetch";
import { TdxClient } from "@/server/tdx/client";

const OUTPUT = join(import.meta.dirname, "..", "src", "data", "route-index.json");

if (existsSync(".env.local")) process.loadEnvFile(".env.local");
const { TDX_CLIENT_ID: clientId, TDX_CLIENT_SECRET: clientSecret } = process.env;
if (!clientId || !clientSecret) {
  console.error("缺少 TDX_CLIENT_ID / TDX_CLIENT_SECRET（.env.local 或環境變數）");
  process.exit(1);
}

const index = await fetchRouteIndex(new TdxClient({ clientId, clientSecret }), {
  onProgress: ({ city, done, total, count }) => console.log(`[${done}/${total}] ${city}：${count} 條`),
});

// 一條路線一行，更新時的 git diff 比較好讀
const lines = index.routes.map((route) => `    ${JSON.stringify(route)}`).join(",\n");
writeFileSync(OUTPUT, `{\n  "generatedAt": ${JSON.stringify(index.generatedAt)},\n  "routes": [\n${lines}\n  ]\n}\n`);
console.log(`完成：${index.routes.length} 條路線 → ${OUTPUT}`);
