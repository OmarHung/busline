import type { Page } from "@playwright/test";
import type { LngLat, Place, PlanResult, RouteDetail, RouteIndex, RouteLive, Stop } from "../src/lib/types";

const OUTBOUND: Array<[string, LngLat]> = [
  ["板橋", [121.4626, 25.0136]],
  ["板橋車站", [121.4647, 25.0144]],
  ["新埔", [121.4683, 25.0236]],
  ["江子翠", [121.4724, 25.0302]],
  ["萬華車站", [121.4996, 25.0335]],
  ["西門", [121.5078, 25.0421]],
  ["臺大醫院", [121.5182, 25.0414]],
  ["忠孝新生", [121.5329, 25.0422]],
  ["忠孝復興", [121.5436, 25.0415]],
  ["國父紀念館", [121.5577, 25.0412]],
  ["撫遠街", [121.5592, 25.0548]],
];

const stops = (prefix: string, list: Array<[string, LngLat]>): Stop[] =>
  list.map(([name, position], i) => ({ uid: `${prefix}${i + 1}`, name, seq: i + 1, position }));

const outboundStops = stops("TPE-o", OUTBOUND);
const inboundStops = stops("TPE-i", [...OUTBOUND].reverse());

export const ROUTE_INDEX: RouteIndex = {
  routes: [
    { uid: "TPE16111", name: "307", cityCode: "TPE", from: "板橋", to: "撫遠街" },
    { uid: "TPE16112", name: "307西藏三民", cityCode: "TPE", from: "板橋", to: "撫遠街" },
    { uid: "TXG3070", name: "307", cityCode: "TXG", from: "梧棲觀光漁港", to: "新民高中" },
    { uid: "TPE10132", name: "紅5", cityCode: "TPE", from: "捷運北投站", to: "新北投" },
  ],
  generatedAt: "2026-10-20T04:00:00.000Z",
};

export const ROUTE_DETAIL: RouteDetail = {
  uid: "TPE16111",
  name: "307",
  cityCode: "TPE",
  from: "板橋",
  to: "撫遠街",
  directions: [
    {
      direction: 0,
      headsign: "往 撫遠街",
      lines: [outboundStops.map((s) => s.position)],
      isApproximate: false,
      stops: outboundStops,
    },
    {
      direction: 1,
      headsign: "往 板橋",
      lines: [inboundStops.map((s) => s.position)],
      isApproximate: false,
      stops: inboundStops,
    },
  ],
};

export const ROUTE_LIVE: RouteLive = {
  etas: {
    "0:TPE-o1": { estimateSec: null, status: 1, nextBusTime: "2026-10-20T14:05:00+08:00", isLastBus: false },
    "0:TPE-o2": { estimateSec: 20, status: 0, nextBusTime: null, isLastBus: false },
    "0:TPE-o3": { estimateSec: 140, status: 0, nextBusTime: null, isLastBus: false },
    "0:TPE-o4": { estimateSec: 420, status: 0, nextBusTime: null, isLastBus: false },
    "0:TPE-o5": { estimateSec: 780, status: 0, nextBusTime: null, isLastBus: false },
    "0:TPE-o6": { estimateSec: 60 * 18, status: 0, nextBusTime: null, isLastBus: true },
    "0:TPE-o7": { estimateSec: null, status: 2, nextBusTime: null, isLastBus: false },
    "1:TPE-i1": { estimateSec: 300, status: 0, nextBusTime: null, isLastBus: false },
  },
  buses: [
    { plate: "EAL-0307", direction: 0, position: [121.4648, 25.0146], azimuth: 30, speed: 25, gpsTime: "" },
    { plate: "EAL-1307", direction: 0, position: [121.5075, 25.0418], azimuth: 85, speed: 18, gpsTime: "" },
    { plate: "EAL-2307", direction: 1, position: [121.543, 25.0416], azimuth: 270, speed: 30, gpsTime: "" },
  ],
  unavailable: [],
  fetchedAt: new Date().toISOString(),
};

export const BANQIAO: LngLat = [121.4637, 25.0145];

export const PLACES: Place[] = [
  { id: "osm:N1", name: "台北101", detail: "臺北市 信義區 信義路五段", position: [121.5645, 25.0338], kind: "place" },
  {
    id: "stop:1",
    name: "捷運台北101/世貿站",
    detail: "公車站・12 條路線",
    position: [121.5636, 25.0345],
    kind: "stop",
  },
];

const ride307 = {
  route: ROUTE_INDEX.routes[0],
  direction: 0,
  headsign: "往 撫遠街",
  stopCount: 8,
  rideMeters: 9800,
  path: outboundStops.slice(1, 10).map((s) => s.position),
  estimatedMinutes: 38,
};

export const PLAN_RESULT: PlanResult = {
  directMeters: 10400,
  options: [
    {
      board: { name: "板橋車站", position: outboundStops[1].position, walkMeters: 120 },
      alight: { name: "國父紀念館", position: outboundStops[9].position, walkMeters: 650 },
      rides: [ride307, { ...ride307, route: ROUTE_INDEX.routes[1], estimatedMinutes: 41 }],
    },
    {
      board: { name: "新埔", position: outboundStops[2].position, walkMeters: 480 },
      alight: { name: "撫遠街", position: outboundStops[10].position, walkMeters: 900 },
      rides: [{ ...ride307, stopCount: 8, estimatedMinutes: 52 }],
    },
  ],
};

/** 攔截 API 與預先產生的路線詳情靜態檔，回傳固定資料；fixture 以外的路線沒有詳情檔（404） */
export async function mockApi(
  page: Page,
  overrides: { indexStatus?: number; live?: Partial<RouteLive>; plan?: PlanResult } = {},
) {
  await page.route("**/api/places?**", (route) => route.fulfill({ json: { places: PLACES } }));
  // 每一段都回同一份方案；段數依 points（起點;經過點…;終點）決定
  await page.route("**/api/plan?**", (route) => {
    const points = new URL(route.request().url()).searchParams.get("points")?.split(";") ?? [];
    return route.fulfill({ json: { legs: points.slice(1).map(() => overrides.plan ?? PLAN_RESULT) } });
  });
  await page.route("**/api/routes", (route) =>
    overrides.indexStatus
      ? route.fulfill({ status: overrides.indexStatus, json: { error: "交通部 TDX 資料暫時無法取得，請稍後再試" } })
      : route.fulfill({ json: ROUTE_INDEX }),
  );
  await page.route("**/data/routes/*.json", (route) =>
    route.request().url().endsWith("/TPE16111.json")
      ? route.fulfill({ json: ROUTE_DETAIL })
      : route.fulfill({ status: 404, body: "Not Found" }),
  );
  await page.route("**/api/routes/TPE16111/live", (route) =>
    route.fulfill({ json: { ...ROUTE_LIVE, fetchedAt: new Date().toISOString(), ...overrides.live } }),
  );
}
