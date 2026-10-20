// MapLibre 6 在執行期用 import.meta.url 推算 worker 位置，打包後找不到檔案；
// 安裝時把 worker 複製到 public/，再由 MapView 以 setWorkerUrl 指定。
import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const distDir = dirname(require.resolve("maplibre-gl/dist/maplibre-gl.css"));
const target = join(import.meta.dirname, "..", "public", "vendor");

mkdirSync(target, { recursive: true });
copyFileSync(join(distDir, "maplibre-gl-worker.mjs"), join(target, "maplibre-gl-worker.mjs"));
