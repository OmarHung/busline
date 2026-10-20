# 公車路線圖（busline）

在地圖上用線條畫出全台市區公車與公路客運的行駛路線（標出起訖站與行駛方向），並顯示站牌、預估到站時間與公車即時位置。

也能做**路線規劃**：輸入目的地（地點、地標、地址或站名），起點預設為目前位置，列出不用轉乘的直達公車，地圖上畫出步行與乘車路段，並顯示上車站的下一班時間。中間可以加最多 3 個順路經過的地點（可拖曳調整順序），每一段（起點 → 經過點 → … → 終點）各自列出直達公車。

資料來源：[交通部 TDX 運輸資料流通服務](https://tdx.transportdata.tw/)。底圖：[OpenFreeMap](https://openfreemap.org/)（OpenStreetMap 資料）。

## 開發

```bash
pnpm install          # 會順便把 MapLibre worker 複製到 public/vendor/
cp .env.example .env.local
# 在 .env.local 填入 TDX 會員中心的 Client ID / Secret
pnpm dev
```

| 指令                 | 用途                                                                           |
| -------------------- | ------------------------------------------------------------------------------ |
| `pnpm test`          | 單元與整合測試（Vitest）                                                       |
| `pnpm test:coverage` | 測試覆蓋率（門檻 80%）                                                         |
| `pnpm test:e2e`      | E2E 測試（Playwright，API 用假資料，不需 TDX 金鑰）                            |
| `pnpm lint`          | ESLint                                                                         |
| `pnpm typecheck`     | 型別檢查（先用 `next typegen` 產生路由型別再跑 tsc）                           |
| `pnpm format`        | Prettier                                                                       |
| `pnpm data:routes`   | 重新產生全台路線清單 `src/data/route-index.json`                               |
| `pnpm data:stops`    | 重新產生全台站序 `src/data/stop-index.json` 與各路線詳情 `public/data/routes/` |
| `pnpm data`          | 全部資料一起更新（約 15 分鐘）                                                 |

第一次執行 E2E 前要先安裝瀏覽器：`npx playwright install chromium`。

## 架構

```
瀏覽器 ──SWR──▶ /api/routes               ← src/data/route-index.json（預先產生，不打 TDX）
           ├──▶ /data/routes/{uid}.json   ← 靜態檔：預先產生的線型＋站序（不打 TDX）
           └──▶ /api/routes/{uid}/live    ──▶ TDX API（程序內 TTL 快取＋CDN Cache-Control，金鑰只在伺服器端）
```

| API                           | 內容                                                                   | 快取                           |
| ----------------------------- | ---------------------------------------------------------------------- | ------------------------------ |
| `GET /api/routes`             | 全台路線清單（搜尋用）                                                 | 靜態檔，建置時輸出             |
| `GET /data/routes/{uid}.json` | 單一路線的線型、各方向站序                                             | 靜態檔，`pnpm data:stops` 產生 |
| `GET /api/routes/{uid}/live`  | 各站預估到站、公車即時位置                                             | 30 秒（前端 30 秒輪詢）        |
| `GET /api/places?q=`          | 地點搜尋：公車站名＋OSM                                                | 1 小時                         |
| `GET /api/plan?points=`       | 各段直達方案（`起點;經過點…;終點`，座標為 經度,緯度，最多 3 個經過點） | 1 小時                         |

路線規劃只用預先產生的站序計算，不呼叫 TDX：找起終點步行 600 公尺內（找不到再放寬到 1 公里）的站，挑同一條路線、方向正確的組合，依「步行＋乘車」估計時間排序，上下車站相同的路線合併成一個方案。有經過點時每一段各自這樣規劃（在經過點下車，再搭下一段）。選取方案時線型讀靜態檔；上車站的下一班要呼叫 TDX，使用者按「查看下一班」才查。地點搜尋先比對公車站名，再查 [Photon](https://photon.komoot.io/)（OpenStreetMap，免費公益服務，經後端快取）。

`uid` 是 TDX 的 RouteUID，例如臺北市 307 是 `TPE16111`；前三碼是縣市代碼，公路客運為 `THB`。網址 `/?r=TPE16111` 可以直接開啟該路線。

```
src/
├── app/                 頁面與 API Route Handlers
├── features/bus-map/    地圖畫面（MapLibre 圖層、搜尋、路線面板）
├── lib/                 前後端共用：型別、縣市對照、搜尋、到站時間格式、幾何
├── server/              TDX client（認證、重試、併發限制）、快取、資料轉換、路線規劃、地點搜尋
└── data/                預先產生的路線清單與站序（pnpm data）
public/data/routes/      預先產生的各路線詳情（pnpm data:stops）
```

## 部署（Vercel）

1. 在專案設定加上環境變數 `TDX_CLIENT_ID`、`TDX_CLIENT_SECRET`。
2. Serverless 環境的程序內快取不一定會被重用，主要靠 API 回應的 `s-maxage` 讓 CDN 快取，避免每個使用者都直接打 TDX。
3. 建議在 Vercel Firewall 對 `/api/routes/*` 設定每個 IP 的速率限制；查無路線雖然也會快取 10 分鐘，但無法擋住大量不同的亂數 uid。

4. 每次推送都會跑 GitHub Actions（`.github/workflows/ci.yml`：格式、lint、型別、單元測試與覆蓋率、E2E）。在 Vercel 專案的 Settings → Deployment Checks 勾選這些檢查，正式版就會等 CI 通過才上線。

開發時不要在 `pnpm dev` 執行中另外跑 `pnpm build`，dev server 可能會卡在舊的編譯結果，需要重啟。

## 已知限制

- **TDX 免費的基礎會員，每把金鑰每分鐘只能呼叫 5 次。** 線型與站序是預先產生的靜態檔，開路線不用呼叫 TDX；即時資料每條路線每 30 秒 2 次，大約只夠同時看一條路線。超過額度時 server 會暫停呼叫，直到 TDX 告知的重設時間。
- 路線規劃每一段只有公車直達，不含轉乘與捷運／台鐵；時間是依距離估算，不含等車、塞車與在經過點停留。
- 經過點依排列的順序規劃（可拖曳調整），不會自動排成最順路的順序。
- 全台路線清單、站序與路線詳情是預先產生的檔案，新開或改號的路線要重新執行 `pnpm data` 並部署後才會出現。清單外的路線沒有詳情檔，即時資料 API 也一律回 404，不會打 TDX。
- 路線詳情的線型有簡化（誤差 2 公尺內）；一條路線一個檔，全台約 3,600 個，跟著 git 一起部署。

- TDX 沒有線型（Shape）資料的路線，會用站牌連線代替，並在面板上標示。
- 公車所在站是依 GPS 位置找最近的站牌推算，僅供參考。
