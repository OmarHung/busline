import { describe, expect, test } from "vitest";
import type { LngLat } from "@/lib/types";
import { NETWORK_INDEX, NETWORK_ROUTES } from "./fixtures";
import { StopNetwork } from "./network";
import { planDirect } from "./plan";

const network = new StopNetwork(NETWORK_INDEX);
const routes = new Map(NETWORK_ROUTES.map((r) => [r.uid, r]));
const plan = (from: LngLat, to: LngLat, limit?: number) => planDirect(network, routes, from, to, { limit });

const A: LngLat = [121.5, 25];
const D: LngLat = [121.52, 25];
const E: LngLat = [121.53, 25];

describe("planDirect", () => {
  test("finds a direct route going the right way", () => {
    const { options } = plan(A, E);

    expect(options).toHaveLength(1);
    expect(options[0]).toMatchObject({ board: { name: "A" }, alight: { name: "E" } });
    expect(options[0].rides).toHaveLength(1);
    expect(options[0].rides[0]).toMatchObject({ route: { uid: "TPE1" }, direction: 0, headsign: "往 E", stopCount: 4 });
    expect(options[0].rides[0].path).toEqual([A, [121.505, 25], [121.51, 25], D, E]);
  });

  test("uses the opposite direction for the return trip and never rides backwards", () => {
    const { options } = plan(E, A);
    expect(options.flatMap((o) => o.rides.map((r) => [r.route.uid, r.direction]))).toEqual([["TPE1", 1]]);
  });

  test("groups routes sharing the same boarding and alighting stops into one option, fastest first", () => {
    const { options } = plan([121.504, 25], D);

    expect(options).toHaveLength(1);
    expect(options[0]).toMatchObject({ board: { name: "B" }, alight: { name: "D" } });
    expect(options[0].rides.map((r) => [r.route.uid, r.stopCount])).toEqual([
      ["TPE2", 1],
      ["TPE1", 2],
    ]);
    expect(options[0].board.walkMeters).toBeGreaterThan(90);
    expect(options[0].board.walkMeters).toBeLessThan(110);
  });

  test("estimates whole minutes from walking and riding", () => {
    const [ride] = plan(A, E).options[0].rides;
    // 約 3 公里車程＋4 站停靠，幾乎不用走路
    expect(Number.isInteger(ride.estimatedMinutes)).toBe(true);
    expect(ride.estimatedMinutes).toBeGreaterThanOrEqual(10);
    expect(ride.estimatedMinutes).toBeLessThanOrEqual(15);
    expect(ride.rideMeters).toBeGreaterThan(3000);
  });

  test("widens the walking radius when nothing is close enough", () => {
    // 離 A 約 650 公尺
    const { options } = plan([121.4935, 25], E);
    expect(options.map((o) => o.board.name)).toEqual(["A"]);
  });

  test("returns no options, with the straight distance, when no route connects the two points", () => {
    const result = plan(A, [121.7, 25.2]);
    expect(result.options).toEqual([]);
    expect(result.directMeters).toBeGreaterThan(20_000);
  });

  test("orders options by their fastest ride and caps how many are returned", () => {
    // 從 B 附近到 E 附近：B→E（TPE1）比 B→D 再走路快
    const { options } = plan([121.505, 25], [121.525, 25]);
    const minutes = options.map((o) => o.rides[0].estimatedMinutes);
    expect(minutes).toEqual([...minutes].sort((a, b) => a - b));
    expect(plan([121.505, 25], [121.525, 25], 1).options).toHaveLength(1);
  });
});
