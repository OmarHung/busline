import { describe, expect, test } from "vitest";
import { buildRouteDetail, buildRouteLive, toRouteSummaries } from "./transform";
import type { RouteSummary } from "@/lib/types";
import type { TdxBus, TdxEta, TdxRoute, TdxShape, TdxStopOfRoute } from "./schemas";

const ROUTE: TdxRoute = {
  RouteUID: "TPE16111",
  RouteName: { Zh_tw: "307" },
  DepartureStopNameZh: "板橋",
  DestinationStopNameZh: "撫遠街",
};

const SUMMARY: RouteSummary = { uid: "TPE16111", name: "307", cityCode: "TPE", from: "板橋", to: "撫遠街" };

const stop = (uid: string, name: string, seq: number, lng: number) => ({
  StopUID: uid,
  StopName: { Zh_tw: name },
  StopSequence: seq,
  StopPosition: { PositionLon: lng, PositionLat: 25 },
});

const STOPS_OUT: TdxStopOfRoute = {
  RouteUID: "TPE16111",
  SubRouteUID: "TPE161110",
  Direction: 0,
  Stops: [stop("s2", "中站", 2, 121.51), stop("s1", "板橋", 1, 121.5), stop("s3", "撫遠街", 3, 121.52)],
};
const STOPS_OUT_SHORT: TdxStopOfRoute = {
  RouteUID: "TPE16111",
  SubRouteUID: "TPE161111",
  Direction: 0,
  Stops: [stop("s1", "板橋", 1, 121.5)],
};
const STOPS_BACK: TdxStopOfRoute = {
  RouteUID: "TPE16111",
  Direction: 1,
  Stops: [stop("r1", "撫遠街", 1, 121.52), stop("r2", "板橋", 2, 121.5)],
};
const OTHER_ROUTE_STOPS: TdxStopOfRoute = { ...STOPS_OUT, RouteUID: "TPE99999" };

describe("toRouteSummaries", () => {
  test("maps TDX routes to compact summaries and skips nameless routes", () => {
    const summaries = toRouteSummaries([ROUTE, { RouteUID: "TPE2", RouteName: {} }, ROUTE], "TPE");
    expect(summaries).toEqual([{ uid: "TPE16111", name: "307", cityCode: "TPE", from: "板橋", to: "撫遠街" }]);
  });
});

describe("buildRouteDetail", () => {
  const shapes: TdxShape[] = [
    { RouteUID: "TPE16111", Direction: 0, Geometry: "LINESTRING(121.5 25,121.52 25)" },
    { RouteUID: "TPE16111", Direction: 0, Geometry: "LINESTRING(121.5 25,121.51 25,121.52 25)" },
  ];

  test("builds one direction per TDX direction with stops sorted by sequence", () => {
    const detail = buildRouteDetail(SUMMARY, shapes, [STOPS_BACK, STOPS_OUT, OTHER_ROUTE_STOPS]);

    expect(detail.directions.map((d) => d.direction)).toEqual([0, 1]);
    expect(detail.directions[0].stops.map((s) => s.uid)).toEqual(["s1", "s2", "s3"]);
    expect(detail.directions[0].stops[0]).toEqual({ uid: "s1", name: "板橋", seq: 1, position: [121.5, 25] });
  });

  test("uses the sub-route with the most stops for each direction", () => {
    const detail = buildRouteDetail(SUMMARY, [], [STOPS_OUT_SHORT, STOPS_OUT]);
    expect(detail.directions[0].stops).toHaveLength(3);
  });

  test("names each direction after the route's terminals, not TDX's last stop", () => {
    const detail = buildRouteDetail({ ...SUMMARY, from: "板橋", to: "撫遠街" }, shapes, [
      { ...STOPS_OUT, Stops: [...STOPS_OUT.Stops, stop("s4", "莊敬里", 4, 121.53)] },
      STOPS_BACK,
    ]);
    expect(detail.directions.map((d) => d.headsign)).toEqual(["往 撫遠街", "往 板橋"]);
  });

  test("falls back to the last stop for loop routes and routes without terminals", () => {
    const loop = buildRouteDetail({ ...SUMMARY, from: "基隆火車站", to: "基隆火車站" }, shapes, [STOPS_OUT]);
    const unnamed = buildRouteDetail({ ...SUMMARY, from: "", to: "" }, shapes, [STOPS_OUT]);
    expect(loop.directions[0].headsign).toBe("往 撫遠街");
    expect(unnamed.directions[0].headsign).toBe("往 撫遠街");
  });

  test("picks the most detailed shape for a direction", () => {
    const detail = buildRouteDetail(SUMMARY, shapes, [STOPS_OUT]);
    expect(detail.directions[0].lines[0]).toHaveLength(3);
    expect(detail.directions[0].isApproximate).toBe(false);
  });

  test("falls back to a shape without direction", () => {
    const detail = buildRouteDetail(
      SUMMARY,
      [{ RouteUID: "TPE16111", Geometry: "LINESTRING(1 2,3 4)" }],
      [STOPS_OUT, STOPS_BACK],
    );
    expect(detail.directions.every((d) => d.lines.length === 1 && !d.isApproximate)).toBe(true);
  });

  test("connects the stops when there is no usable shape", () => {
    const detail = buildRouteDetail(SUMMARY, [{ RouteUID: "TPE16111", Direction: 1 }], [STOPS_BACK]);
    expect(detail.directions[0]).toMatchObject({
      isApproximate: true,
      lines: [
        [
          [121.52, 25],
          [121.5, 25],
        ],
      ],
    });
  });

  test("copies route metadata", () => {
    expect(buildRouteDetail(SUMMARY, [], [])).toEqual({
      uid: "TPE16111",
      name: "307",
      cityCode: "TPE",
      from: "板橋",
      to: "撫遠街",
      directions: [],
    });
  });
});

describe("buildRouteLive", () => {
  const now = new Date("2026-10-20T03:00:00Z");

  test("keys ETAs by direction and stop, keeping the soonest estimate", () => {
    const etas: TdxEta[] = [
      { RouteUID: "TPE16111", StopUID: "s1", Direction: 0, EstimateTime: 300, StopStatus: 0 },
      { RouteUID: "TPE16111", StopUID: "s1", Direction: 0, EstimateTime: 120, StopStatus: 0 },
      { RouteUID: "TPE16111", StopUID: "s2", Direction: 0, StopStatus: 1, NextBusTime: "2026-10-20T14:00:00+08:00" },
      { RouteUID: "TPE99999", StopUID: "s1", Direction: 0, EstimateTime: 5 },
    ];

    const live = buildRouteLive("TPE16111", etas, [], now);

    expect(live.etas).toEqual({
      "0:s1": { estimateSec: 120, status: 0, nextBusTime: null, isLastBus: false },
      "0:s2": { estimateSec: null, status: 1, nextBusTime: "2026-10-20T14:00:00+08:00", isLastBus: false },
    });
    expect(live.fetchedAt).toBe(now.toISOString());
    expect(live.unavailable).toEqual([]);
  });

  test("reports the parts that could not be fetched", () => {
    expect(buildRouteLive("TPE16111", null, [], now).unavailable).toEqual(["etas"]);
    expect(buildRouteLive("TPE16111", [], null, now).unavailable).toEqual(["buses"]);
  });

  test("keeps in-service buses of this route, latest report per plate", () => {
    const bus = (plate: string, gps: string, patch: Partial<TdxBus> = {}): TdxBus => ({
      PlateNumb: plate,
      RouteUID: "TPE16111",
      Direction: 0,
      BusPosition: { PositionLon: 121.5, PositionLat: 25 },
      Azimuth: 90,
      Speed: 30,
      DutyStatus: 0,
      GPSTime: gps,
      ...patch,
    });

    const live = buildRouteLive(
      "TPE16111",
      [],
      [
        bus("AAA-1", "2026-10-20T10:59:00+08:00"),
        bus("AAA-1", "2026-10-20T11:00:00+08:00", { BusPosition: { PositionLon: 121.6, PositionLat: 25 } }),
        bus("BBB-2", "2026-10-20T11:00:00+08:00", { DutyStatus: 2 }),
        bus("CCC-3", "2026-10-20T11:00:00+08:00", { RouteUID: "TPE99999" }),
      ],
      now,
    );

    expect(live.buses).toEqual([
      {
        plate: "AAA-1",
        direction: 0,
        position: [121.6, 25],
        azimuth: 90,
        speed: 30,
        gpsTime: "2026-10-20T11:00:00+08:00",
      },
    ]);
  });
});
