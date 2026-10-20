// 前後端共用的 API 資料型別（/api/routes*）

export type LngLat = [lng: number, lat: number];

/** 搜尋用的路線摘要 */
export interface RouteSummary {
  uid: string;
  name: string;
  /** TDX 縣市代碼，如 TPE、NWT；公路客運為 THB */
  cityCode: string;
  from: string;
  to: string;
}

/** 全台路線清單；由 scripts/build-route-index.mts 預先產生 */
export interface RouteIndex {
  generatedAt: string;
  routes: RouteSummary[];
}

export interface Stop {
  uid: string;
  name: string;
  seq: number;
  position: LngLat;
}

export interface RouteDirection {
  /** TDX Direction：0 去程、1 返程、2 迴圈 */
  direction: number;
  /** 顯示用的方向名稱，如「往 撫遠街」 */
  headsign: string;
  /** 行駛路線線型；可能有多段 */
  lines: LngLat[][];
  /** 線型是否由站牌連線推估（TDX 無 Shape 資料時） */
  isApproximate: boolean;
  stops: Stop[];
}

export interface RouteDetail {
  uid: string;
  name: string;
  cityCode: string;
  from: string;
  to: string;
  directions: RouteDirection[];
}

export interface StopEta {
  /** 預估到站秒數 */
  estimateSec: number | null;
  /** TDX StopStatus：0 正常、1 尚未發車、2 交管不停靠、3 末班車已過、4 今日未營運 */
  status: number;
  /** 下一班發車時間（ISO 8601） */
  nextBusTime: string | null;
  isLastBus: boolean;
}

export interface LiveBus {
  plate: string;
  direction: number;
  position: LngLat;
  /** 行進方位角（度，正北為 0） */
  azimuth: number;
  speed: number;
  gpsTime: string;
}

export type LivePart = "etas" | "buses";

export interface RouteLive {
  /** key 為 `${direction}:${stopUid}` */
  etas: Record<string, StopEta>;
  buses: LiveBus[];
  /** 這次沒抓到的部分；畫面要標示，不能當成「沒有資料」 */
  unavailable: LivePart[];
  fetchedAt: string;
}

export const etaKey = (direction: number, stopUid: string) => `${direction}:${stopUid}`;

/** 地點搜尋結果；stop 為公車站名比對，place 為 OpenStreetMap 地點 */
export interface Place {
  id: string;
  name: string;
  /** 補充說明，例如「臺北市・公車站」「大安區 和平東路」 */
  detail: string;
  position: LngLat;
  kind: "stop" | "place";
}

export interface PlanStop {
  name: string;
  position: LngLat;
  /** 從起點走到上車站、或從下車站走到終點的直線距離 */
  walkMeters: number;
}

/** 一組上下車站之間可搭的一條路線 */
export interface PlanRide {
  route: RouteSummary;
  direction: number;
  headsign: string;
  /** 坐幾站 */
  stopCount: number;
  rideMeters: number;
  /** 上車到下車依序經過的站位置；沒有線型時拿來畫線 */
  path: LngLat[];
  /** 步行＋乘車的估計時間，不含等車 */
  estimatedMinutes: number;
}

/** 一個直達方案：走到上車站 → 搭其中任一條路線 → 下車走到終點 */
export interface PlanOption {
  board: PlanStop;
  alight: PlanStop;
  /** 快的在前；同一組站之間常有好幾條路線（212、212直…）都能搭 */
  rides: PlanRide[];
}

export interface PlanResult {
  options: PlanOption[];
  /** 起終點直線距離；很近時畫面會建議直接走路 */
  directMeters: number;
}
