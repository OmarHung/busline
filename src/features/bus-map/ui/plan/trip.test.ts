import { describe, expect, test } from "vitest";
import type { LngLat, PlanOption, PlanResult, RouteDetail, RouteLive, TripPlan } from "@/lib/types";
import { boardEtaOf, buildLegs, legSelectionKey, pointBusInfo, pointKind, tripMinutes, tripOverlay } from "./trip";
import type { PlanPoint } from "./types";

const A: PlanPoint = { name: "甲", position: [121.5, 25] };
const B: PlanPoint = { name: "乙", position: [121.51, 25] };
const C: PlanPoint = { name: "丙", position: [121.52, 25] };

const ROUTE = { uid: "TPE1", name: "1", cityCode: "TPE", from: "甲", to: "丙" };
const BOARD: LngLat = [121.501, 25];
const ALIGHT: LngLat = [121.509, 25];

const option = (minutes: number, board = BOARD, alight = ALIGHT): PlanOption => ({
  board: { name: "上車站", position: board, walkMeters: 50 },
  alight: { name: "下車站", position: alight, walkMeters: 60 },
  rides: [
    {
      route: ROUTE,
      direction: 0,
      headsign: "往 丙",
      stopCount: 2,
      rideMeters: 800,
      path: [board, alight],
      estimatedMinutes: minutes,
    },
  ],
});
const result = (...options: PlanOption[]): PlanResult => ({ options, directMeters: 1000 });

const TRIP: TripPlan = { legs: [result(option(10), option(12)), result()] };

// 線型稍微偏離上下車站，用來確認有切出實際路段
const SHAPE: LngLat[] = [
  [121.5, 25],
  [121.501, 25.0001],
  [121.505, 25.001],
  [121.509, 25.0001],
  [121.51, 25],
];
const DETAIL: RouteDetail = {
  ...ROUTE,
  directions: [
    {
      direction: 0,
      headsign: "往 丙",
      lines: [SHAPE],
      isApproximate: false,
      stops: [
        { uid: "s1", name: "上車站", seq: 1, position: BOARD },
        { uid: "s2", name: "下車站", seq: 2, position: ALIGHT },
      ],
    },
  ],
};
const LIVE: RouteLive = {
  etas: { "0:s1": { estimateSec: 120, status: 0, nextBusTime: null, isLastBus: false } },
  buses: [],
  unavailable: [],
  fetchedAt: "2026-10-20T06:00:00.000Z",
};

describe("pointKind", () => {
  test("names the first point the origin, the last the destination, and the rest waypoints", () => {
    expect([0, 1, 2, 3].map((i) => pointKind(i, 4))).toEqual(["origin", "via", "via", "destination"]);
    expect([0, 1].map((i) => pointKind(i, 2))).toEqual(["origin", "destination"]);
  });
});

describe("buildLegs", () => {
  test("splits the trip into legs between consecutive points, choosing the first option by default", () => {
    const legs = buildLegs([A, B, C], TRIP, {}, null);

    expect(legs.map((leg) => [leg.from.name, leg.to.name])).toEqual([
      ["甲", "乙"],
      ["乙", "丙"],
    ]);
    expect(legs[0].selection).toEqual({ option: 0, ride: 0 });
    expect(legs[0].ride?.estimatedMinutes).toBe(10);
    // 第二段沒有直達公車
    expect(legs[1].selection).toBeNull();
    expect(legs[1].ride).toBeUndefined();
  });

  test("has no results before the plan arrives", () => {
    const [leg] = buildLegs([A, B], undefined, {}, null);

    expect(leg.result).toBeUndefined();
    expect(leg.selection).toBeNull();
  });

  test("keeps a leg's choice only while its endpoints stay the same", () => {
    const [first] = buildLegs([A, B, C], TRIP, {}, null);
    const choices = { [first.key]: { option: 1, ride: 0 } };

    expect(buildLegs([A, B, C], TRIP, choices, null)[0].ride?.estimatedMinutes).toBe(12);
    expect(buildLegs([A, C], { legs: [TRIP.legs[0]] }, choices, null)[0].selection).toEqual({ option: 0, ride: 0 });
  });

  test("asks for live data only for the ride that was requested", () => {
    const [first] = buildLegs([A, B, C], TRIP, {}, null);
    const liveKey = legSelectionKey(first);

    expect(buildLegs([A, B, C], TRIP, {}, liveKey).map((leg) => leg.isLiveRequested)).toEqual([true, false]);
    const switched = buildLegs([A, B, C], TRIP, { [first.key]: { option: 1, ride: 0 } }, liveKey);
    expect(switched[0].isLiveRequested).toBe(false);
  });
});

describe("tripOverlay", () => {
  test("marks each chosen point with its role, numbering waypoints by their field", () => {
    const overlay = tripOverlay([A, null, B, C], [], {});

    expect(overlay.points).toEqual([
      { kind: "origin", label: "起", position: A.position },
      { kind: "via", label: "2", position: B.position },
      { kind: "destination", label: "終", position: C.position },
    ]);
  });

  test("draws the chosen option of each leg along the route's exact shape, skipping legs without a bus", () => {
    const legs = buildLegs([A, B, C], TRIP, {}, null);

    const overlay = tripOverlay([A, B, C], legs, { TPE1: DETAIL });

    expect(overlay.legs).toEqual([
      { from: A.position, to: B.position, board: BOARD, alight: ALIGHT, ride: [BOARD, ...SHAPE.slice(1, 4), ALIGHT] },
    ]);
  });

  test("connects the stops when the shape is not loaded or not available", () => {
    const legs = buildLegs([A, B], TRIP, {}, null);

    expect(tripOverlay([A, B], legs, {}).legs[0].ride).toEqual([BOARD, ALIGHT]);
    expect(tripOverlay([A, B], legs, { TPE1: null }).legs[0].ride).toEqual([BOARD, ALIGHT]);
  });
});

describe("boardEtaOf", () => {
  const [leg] = buildLegs([A, B], TRIP, {}, null);
  const requested = buildLegs([A, B], TRIP, {}, legSelectionKey(leg))[0];

  test("stays idle until the user asks", () => {
    expect(boardEtaOf(leg, { data: LIVE }, { TPE1: DETAIL })).toEqual({ status: "idle" });
  });

  test("shows the arrival at the boarding stop", () => {
    expect(boardEtaOf(requested, { data: LIVE }, { TPE1: DETAIL })).toEqual({
      status: "ready",
      eta: LIVE.etas["0:s1"],
    });
  });

  test("waits for both the live data and the route's stops", () => {
    expect(boardEtaOf(requested, {}, { TPE1: DETAIL })).toEqual({ status: "loading" });
    expect(boardEtaOf(requested, { data: LIVE }, undefined)).toEqual({ status: "loading" });
  });

  test("reports failures instead of showing an empty arrival", () => {
    expect(boardEtaOf(requested, { error: new Error("x") }, { TPE1: DETAIL })).toEqual({ status: "error" });
    expect(boardEtaOf(requested, { data: LIVE }, { TPE1: null })).toEqual({ status: "error" });
    expect(boardEtaOf(requested, { data: { ...LIVE, unavailable: ["etas"] } }, { TPE1: DETAIL })).toEqual({
      status: "error",
    });
  });
});

describe("tripMinutes", () => {
  test("adds up the chosen ride of every leg", () => {
    const trip: TripPlan = { legs: [result(option(10)), result(option(7))] };
    expect(tripMinutes(buildLegs([A, B, C], trip, {}, null))).toBe(17);
  });

  test("is unknown when a leg has no direct bus", () => {
    expect(tripMinutes(buildLegs([A, B, C], TRIP, {}, null))).toBeNull();
  });
});

describe("pointBusInfo", () => {
  const legs = buildLegs([A, B, C], TRIP, {}, null);

  test("shows the bus leaving from the origin and from each waypoint", () => {
    expect(pointBusInfo([A, B, C], legs, 0)).toMatchObject({ kind: "origin", title: "起點", name: "甲", leg: 0 });
    expect(pointBusInfo([A, B, C], legs, 0)?.departure).toBe(legs[0]);
    expect(pointBusInfo([A, B, C], legs, 1)).toMatchObject({ kind: "via", title: "經過點 1", name: "乙", leg: 1 });
    expect(pointBusInfo([A, B, C], legs, 1)?.departure).toBe(legs[1]);
  });

  test("shows the bus arriving at the destination", () => {
    const info = pointBusInfo([A, B, C], legs, 2);
    expect(info).toMatchObject({ kind: "destination", title: "終點", name: "丙", leg: 1 });
    expect(info?.departure).toBeUndefined();
    expect(info?.arrival).toBe(legs[1]);
  });

  test("counts only chosen points, keeping the waypoint number of its field", () => {
    expect(pointBusInfo([A, null, B, C], legs, 1)).toMatchObject({ kind: "via", title: "經過點 2", name: "乙" });
  });

  test("has no bus before the trip is planned, and nothing for an unknown point", () => {
    expect(pointBusInfo([A, null], [], 0)?.departure).toBeUndefined();
    expect(pointBusInfo([A, B, C], legs, 5)).toBeNull();
  });
});
