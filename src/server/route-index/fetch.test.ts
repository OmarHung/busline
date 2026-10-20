import { describe, expect, test, vi } from "vitest";
import type { z } from "zod";
import { CITIES } from "@/lib/cities";
import { TdxError } from "../tdx/client";
import type { TdxLister } from "../tdx/service";
import { fetchRouteIndex } from "./fetch";

type Responder = (path: string, attempt: number) => unknown[];

function fakeClient(respond: Responder) {
  const attempts = new Map<string, number>();
  const list = vi.fn(async (path: string, schema: z.ZodType<unknown>) => {
    const attempt = (attempts.get(path) ?? 0) + 1;
    attempts.set(path, attempt);
    return respond(path, attempt).map((item) => schema.parse(item));
  });
  return { list } as unknown as TdxLister & { list: typeof list };
}

const route = (uid: string, name: string, from = "甲", to = "乙") => ({
  RouteUID: uid,
  RouteName: { Zh_tw: name },
  DepartureStopNameZh: from,
  DestinationStopNameZh: to,
});

const FIXED_NOW = () => new Date("2026-10-20T04:00:00Z");

describe("fetchRouteIndex", () => {
  test("fetches every city once, in city order, with routes sorted naturally by name", async () => {
    const client = fakeClient((path) => {
      if (path === "Bus/Route/City/Taipei") return [route("TPE3", "307"), route("TPE1", "30"), route("TPE2", "1")];
      if (path === "Bus/Route/InterCity") return [route("THB1", "1610", "臺北", "高雄")];
      return [];
    });

    const index = await fetchRouteIndex(client, { sleep: async () => {}, now: FIXED_NOW });

    expect(client.list).toHaveBeenCalledTimes(CITIES.length);
    expect(index.generatedAt).toBe("2026-10-20T04:00:00.000Z");
    expect(index.routes.map((r) => r.uid)).toEqual(["TPE2", "TPE1", "TPE3", "THB1"]);
    expect(index.routes.at(-1)).toEqual({ uid: "THB1", name: "1610", cityCode: "THB", from: "臺北", to: "高雄" });
  });

  test("waits and retries when TDX rate-limits a city", async () => {
    const sleep = vi.fn(async () => {});
    const client = fakeClient((path, attempt) => {
      if (path === "Bus/Route/City/Taipei" && attempt < 3) throw new TdxError("slow down", 429);
      return path === "Bus/Route/City/Taipei" ? [route("TPE1", "1")] : [];
    });

    const index = await fetchRouteIndex(client, { sleep, now: FIXED_NOW });

    expect(index.routes.map((r) => r.uid)).toEqual(["TPE1"]);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  test("gives up with an error naming the city when it keeps failing", async () => {
    const client = fakeClient((path) => {
      if (path === "Bus/Route/City/Keelung") throw new TdxError("down", 500);
      return [];
    });

    await expect(fetchRouteIndex(client, { sleep: async () => {}, now: FIXED_NOW })).rejects.toThrow("基隆市");
  });

  test("reports progress per city", async () => {
    const onProgress = vi.fn();
    const client = fakeClient(() => []);

    await fetchRouteIndex(client, { sleep: async () => {}, now: FIXED_NOW, onProgress });

    expect(onProgress).toHaveBeenCalledTimes(CITIES.length);
    expect(onProgress).toHaveBeenLastCalledWith(
      expect.objectContaining({ city: "公路客運", done: CITIES.length, count: 0 }),
    );
  });
});
