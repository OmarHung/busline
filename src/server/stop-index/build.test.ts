import { describe, expect, test, vi } from "vitest";
import type { z } from "zod";
import { CITIES } from "@/lib/cities";
import type { TdxStopOfRoute } from "../tdx/schemas";
import type { TdxLister } from "../tdx/service";
import { buildStopIndex, fetchStopIndex } from "./build";

const stop = (uid: string, name: string, seq: number, lng: number, lat = 25) => ({
  StopUID: uid,
  StopName: { Zh_tw: name },
  StopSequence: seq,
  StopPosition: { PositionLon: lng, PositionLat: lat },
});

const NOW = new Date("2026-10-20T05:00:00Z");

describe("buildStopIndex", () => {
  test("stores each route direction as an ordered list of shared stop indexes", () => {
    const items: TdxStopOfRoute[] = [
      { RouteUID: "TPE2", Direction: 0, Stops: [stop("b1", "乙站", 1, 121.6), stop("b2", "甲站", 2, 121.500001)] },
      {
        RouteUID: "TPE1",
        Direction: 0,
        Stops: [stop("a2", "丙站", 2, 121.7), stop("a1", "甲站", 1, 121.5)],
      },
    ];

    const index = buildStopIndex([items], NOW);

    expect(index.generatedAt).toBe(NOW.toISOString());
    // 甲站兩條路線座標只差 0.000001 度（約 10 公分），視為同一個站
    expect(index.stops).toEqual([
      ["甲站", 121.5, 25],
      ["丙站", 121.7, 25],
      ["乙站", 121.6, 25],
    ]);
    expect(index.patterns).toEqual([
      ["TPE1", 0, [0, 1]],
      ["TPE2", 0, [2, 0]],
    ]);
  });

  test("keeps only the main sub-route per direction", () => {
    const items: TdxStopOfRoute[] = [
      { RouteUID: "TPE1", SubRouteUID: "TPE11", Direction: 0, Stops: [stop("x", "甲", 1, 121.5)] },
      {
        RouteUID: "TPE1",
        SubRouteUID: "TPE10",
        Direction: 0,
        Stops: [stop("x", "甲", 1, 121.5), stop("y", "乙", 2, 121.6)],
      },
      { RouteUID: "TPE1", Direction: 1, Stops: [stop("z", "乙", 1, 121.61)] },
    ];

    const { patterns } = buildStopIndex([items], NOW);

    expect(patterns.map(([uid, dir, stops]) => [uid, dir, stops.length])).toEqual([
      ["TPE1", 0, 2],
      ["TPE1", 1, 1],
    ]);
  });
});

describe("fetchStopIndex", () => {
  test("asks TDX for the stop sequences of every city, with only the needed fields", async () => {
    const list = vi.fn(
      async (...[, schema]: [path: string, schema: z.ZodType<unknown>, query?: Record<string, string>]) =>
        [{ RouteUID: "TPE1", Direction: 0, Stops: [stop("a", "甲", 1, 121.5)] }].map((x) => schema.parse(x)),
    );

    const index = await fetchStopIndex({ list } as unknown as TdxLister, { sleep: async () => {}, now: () => NOW });

    expect(list).toHaveBeenCalledTimes(CITIES.length);
    expect(list.mock.calls[0][0]).toBe("Bus/StopOfRoute/City/Taipei");
    expect(list.mock.calls[0][2]).toEqual({ $select: "RouteUID,SubRouteUID,Direction,Stops" });
    expect(index.stops).toHaveLength(1);
  });
});
