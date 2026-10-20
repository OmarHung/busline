import { describe, expect, test, vi } from "vitest";
import type { z } from "zod";
import { CITIES } from "@/lib/cities";
import type { RouteSummary } from "@/lib/types";
import type { TdxShape, TdxStopOfRoute } from "../tdx/schemas";
import type { TdxLister } from "../tdx/service";
import { buildRouteDetails, fetchShapes } from "./build";

const ROUTES: RouteSummary[] = [
  { uid: "TPE1", name: "307", cityCode: "TPE", from: "板橋", to: "撫遠街" },
  { uid: "TPE2", name: "紅5", cityCode: "TPE", from: "甲", to: "乙" },
];

const stop = (uid: string, name: string, seq: number, lng: number, lat = 25) => ({
  StopUID: uid,
  StopName: { Zh_tw: name },
  StopSequence: seq,
  StopPosition: { PositionLon: lng, PositionLat: lat },
});

const STOPS_307: TdxStopOfRoute[] = [
  { RouteUID: "TPE1", Direction: 0, Stops: [stop("a", "板橋", 1, 121.5), stop("b", "撫遠街", 2, 121.6)] },
];

describe("buildRouteDetails", () => {
  test("builds one detail per route in the index, even when TDX has no stops for it", () => {
    const details = buildRouteDetails(ROUTES, STOPS_307, []);

    expect(details.map((d) => d.uid)).toEqual(["TPE1", "TPE2"]);
    expect(details[0]).toMatchObject({ name: "307", cityCode: "TPE", from: "板橋", to: "撫遠街" });
    expect(details[0].directions[0].headsign).toBe("往 撫遠街");
    expect(details[0].directions[0].stops.map((s) => s.uid)).toEqual(["a", "b"]);
    expect(details[1].directions).toEqual([]);
  });

  test("uses each route's own shape, simplified", () => {
    const shapes: TdxShape[] = [
      { RouteUID: "TPE2", Direction: 0, Geometry: "LINESTRING(120 23,120.1 23)" },
      // 中間的點只偏離直線約 0.1 公尺
      { RouteUID: "TPE1", Direction: 0, Geometry: "LINESTRING(121.5 25,121.55 25.000001,121.6 25)" },
    ];

    const [detail] = buildRouteDetails(ROUTES, STOPS_307, shapes);

    expect(detail.directions[0].isApproximate).toBe(false);
    expect(detail.directions[0].lines).toEqual([
      [
        [121.5, 25],
        [121.6, 25],
      ],
    ]);
  });

  test("rounds stop and shape coordinates to 5 decimals (about 1 meter)", () => {
    const stopOfRoutes: TdxStopOfRoute[] = [
      { RouteUID: "TPE1", Direction: 0, Stops: [stop("a", "板橋", 1, 121.500004, 25.000006)] },
    ];
    const shapes: TdxShape[] = [
      { RouteUID: "TPE1", Direction: 0, Geometry: "LINESTRING(121.500004 25,121.6 25.000006)" },
    ];

    const [detail] = buildRouteDetails(ROUTES, stopOfRoutes, shapes);

    expect(detail.directions[0].stops[0].position).toEqual([121.5, 25.00001]);
    expect(detail.directions[0].lines).toEqual([
      [
        [121.5, 25],
        [121.6, 25.00001],
      ],
    ]);
  });

  test("falls back to connecting the stops when the route has no shape", () => {
    const [detail] = buildRouteDetails(ROUTES, STOPS_307, []);

    expect(detail.directions[0].isApproximate).toBe(true);
    expect(detail.directions[0].lines).toEqual([
      [
        [121.5, 25],
        [121.6, 25],
      ],
    ]);
  });
});

describe("fetchShapes", () => {
  test("asks TDX for the shapes of every city, with only the needed fields", async () => {
    const list = vi.fn(
      async (...[, schema]: [path: string, schema: z.ZodType<unknown>, query?: Record<string, string>]) =>
        [{ RouteUID: "TPE1", Direction: 0, Geometry: "LINESTRING(121.5 25,121.6 25)" }].map((x) => schema.parse(x)),
    );

    const cities = await fetchShapes({ list } as unknown as TdxLister, { sleep: async () => {} });

    expect(list).toHaveBeenCalledTimes(CITIES.length);
    expect(list.mock.calls[0][0]).toBe("Bus/Shape/City/Taipei");
    expect(list.mock.calls[0][2]).toEqual({ $select: "RouteUID,SubRouteUID,Direction,Geometry" });
    expect(cities).toHaveLength(CITIES.length);
    expect(cities[0][0].RouteUID).toBe("TPE1");
  });
});
