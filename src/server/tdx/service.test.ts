import { describe, expect, test, vi } from "vitest";
import type { z } from "zod";
import type { RouteSummary } from "@/lib/types";
import { TtlCache } from "../cache";
import { TdxError } from "./client";
import { createBusService, RouteNotFoundError, type TdxLister } from "./service";

type Handler = (query: Record<string, string>) => unknown[];

/** 依 path 回應的假 TDX client；未定義的 path 會丟錯 */
function fakeClient(handlers: Record<string, Handler>) {
  const list = vi.fn(async (path: string, schema: z.ZodType<unknown>, query: Record<string, string> = {}) => {
    const handler = handlers[path];
    if (!handler) throw new TdxError(`no handler for ${path}`, 500);
    return handler(query).map((item) => schema.parse(item));
  });
  return { list } as unknown as TdxLister & { list: typeof list };
}

/** 預先產生的路線清單（取代執行時向 TDX 查路線） */
const ROUTES: RouteSummary[] = [
  { uid: "TPE16111", name: "307", cityCode: "TPE", from: "板橋", to: "撫遠街" },
  { uid: "TPE1", name: "紅5(副)", cityCode: "TPE", from: "甲", to: "乙" },
  { uid: "THB1610", name: "1610", cityCode: "THB", from: "臺北", to: "高雄" },
];

const liveHandlers: Record<string, Handler> = {
  "Bus/EstimatedTimeOfArrival/City/Taipei/307": () => [
    { RouteUID: "TPE16111", StopUID: "s1", Direction: 0, EstimateTime: 240, StopStatus: 0 },
  ],
  "Bus/RealTimeByFrequency/City/Taipei/307": () => [
    {
      PlateNumb: "EAL-0001",
      RouteUID: "TPE16111",
      Direction: 0,
      BusPosition: { PositionLon: 121.52, PositionLat: 25 },
      Azimuth: 80,
    },
  ],
};

/** 拿掉某一類 API，模擬該 API 失敗 */
const without = (handlers: Record<string, Handler>, prefix: string) =>
  Object.fromEntries(Object.entries(handlers).filter(([path]) => !path.startsWith(prefix)));

const setup = (handlers: Record<string, Handler>) => {
  const client = fakeClient(handlers);
  const service = createBusService({
    client,
    routes: ROUTES,
    cache: new TtlCache(),
    now: () => new Date("2026-10-20T03:00:00Z"),
  });
  return { client, service };
};

describe("getRouteLive", () => {
  test("combines ETAs and bus positions", async () => {
    const { service } = setup(liveHandlers);

    const live = await service.getRouteLive("TPE16111");

    expect(live.etas["0:s1"]?.estimateSec).toBe(240);
    expect(live.buses.map((b) => b.plate)).toEqual(["EAL-0001"]);
    expect(live.fetchedAt).toBe("2026-10-20T03:00:00.000Z");
  });

  test("queries by route name, filtered to the uid, taking the name from the static index", async () => {
    const { service, client } = setup(liveHandlers);

    await service.getRouteLive("TPE16111");

    expect(client.list.mock.calls.map(([path]) => path).sort()).toEqual([
      "Bus/EstimatedTimeOfArrival/City/Taipei/307",
      "Bus/RealTimeByFrequency/City/Taipei/307",
    ]);
    expect(client.list.mock.calls[0][2]).toEqual({ $filter: "RouteUID eq 'TPE16111'" });
  });

  test("uses the InterCity path for highway buses", async () => {
    const { service, client } = setup({
      "Bus/EstimatedTimeOfArrival/InterCity/1610": () => [],
      "Bus/RealTimeByFrequency/InterCity/1610": () => [],
    });

    await service.getRouteLive("THB1610");

    expect(client.list).toHaveBeenCalledTimes(2);
  });

  test("url-encodes route names in the path, including parentheses", async () => {
    const { service, client } = setup({
      "Bus/EstimatedTimeOfArrival/City/Taipei/%E7%B4%855%28%E5%89%AF%29": () => [],
      "Bus/RealTimeByFrequency/City/Taipei/%E7%B4%855%28%E5%89%AF%29": () => [],
    });

    const live = await service.getRouteLive("TPE1");

    expect(client.list).toHaveBeenCalledTimes(2);
    expect(live.unavailable).toEqual([]);
  });

  test("still returns ETAs when bus positions fail, flagging the missing part", async () => {
    const { service } = setup(without(liveHandlers, "Bus/RealTimeByFrequency"));

    const live = await service.getRouteLive("TPE16111");

    expect(live.buses).toEqual([]);
    expect(live.unavailable).toEqual(["buses"]);
    expect(Object.keys(live.etas)).toEqual(["0:s1"]);
  });

  test("throws when both live sources fail", async () => {
    const { service } = setup({});
    await expect(service.getRouteLive("TPE16111")).rejects.toBeInstanceOf(TdxError);
  });

  test("caches live data", async () => {
    const { service, client } = setup(liveHandlers);
    await service.getRouteLive("TPE16111");
    const calls = client.list.mock.calls.length;
    await service.getRouteLive("TPE16111");
    expect(client.list.mock.calls.length).toBe(calls);
  });

  test.each(["TPE404", "TPE16111' or 1 eq 1"])("rejects %j without calling TDX", async (uid) => {
    const { service, client } = setup(liveHandlers);

    await expect(service.getRouteLive(uid)).rejects.toBeInstanceOf(RouteNotFoundError);

    expect(client.list).not.toHaveBeenCalled();
  });
});
