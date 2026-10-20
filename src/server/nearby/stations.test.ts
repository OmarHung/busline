import { describe, expect, test } from "vitest";
import type { RouteSummary } from "@/lib/types";
import { NETWORK_INDEX, NETWORK_ROUTES } from "../planner/fixtures";
import { StopNetwork } from "../planner/network";
import type { StopIndex } from "../stop-index/types";
import { findNearbyStations } from "./stations";

const network = new StopNetwork(NETWORK_INDEX);
const routes = new Map(NETWORK_ROUTES.map((route) => [route.uid, route]));

const summary = (stations: ReturnType<typeof findNearbyStations>) =>
  stations.map((s) => ({ name: s.name, routes: s.routes.map((r) => `${r.route.name} ${r.headsign}`) }));

describe("findNearbyStations", () => {
  test("lists the routes that can be boarded at the nearest stop, in both directions", () => {
    const stations = findNearbyStations(network, routes, [121.505, 25]);

    expect(summary(stations)).toEqual([{ name: "B", routes: ["1 往 E", "1 往 A", "2 往 F"] }]);
    expect(stations[0].meters).toBe(0);
    expect(stations[0].positions).toEqual([[121.505, 25]]);
    expect(stations[0].routes[1]).toMatchObject({ direction: 1, position: [121.505, 25] });
  });

  test("leaves out directions that end at the stop, since nobody boards there", () => {
    expect(summary(findNearbyStations(network, routes, [121.54, 25]))).toEqual([{ name: "F", routes: ["3 往 E"] }]);
    expect(summary(findNearbyStations(network, routes, [121.53, 25]))).toEqual([{ name: "E", routes: ["1 往 A"] }]);
  });

  // C、D 之間偏北 220 公尺：兩站都在 500 公尺外、1 公里內，D 比較近
  const betweenCAndD: [number, number] = [121.5152, 25.002];

  test("widens the search to 1 km when nothing is within 500 m", () => {
    const stations = findNearbyStations(network, routes, betweenCAndD);

    expect(stations.map((s) => s.name)).toEqual(["D", "C"]);
    expect(stations[0].meters).toBeGreaterThan(500);
    expect(stations[0].meters).toBeLessThan(stations[1].meters);
  });

  test("returns nothing when there is no stop within 1 km", () => {
    expect(findNearbyStations(network, routes, [121.6, 25])).toEqual([]);
  });

  test("skips routes missing from the route list", () => {
    const onlyRoute2 = new Map([["TPE2", routes.get("TPE2") as RouteSummary]]);

    expect(summary(findNearbyStations(network, onlyRoute2, [121.505, 25]))).toEqual([
      { name: "B", routes: ["2 往 F"] },
    ]);
  });

  test("keeps at most the given number of stations, nearest first", () => {
    const stations = findNearbyStations(network, routes, betweenCAndD, { limit: 1 });

    expect(stations.map((s) => s.name)).toEqual(["D"]);
  });

  describe("stops with the same name", () => {
    // G 站在路口兩側各有一支站牌（相距約 30 公尺），往東、往西的車各停一側；
    // 另一個 G 站在 400 公尺外，是不同的站
    const index: StopIndex = {
      generatedAt: "2026-10-20T00:00:00.000Z",
      stops: [
        ["G", 121.5, 25],
        ["G", 121.5, 25.0003],
        ["H", 121.51, 25],
        ["G", 121.504, 25],
      ],
      patterns: [
        ["TPE7", 0, [0, 2]],
        ["TPE7", 1, [2, 1]],
        ["TPE8", 0, [1, 3, 2]],
        ["TPE9", 0, [3, 2]],
      ],
    };
    const sameNameRoutes = new Map<string, RouteSummary>([
      ["TPE7", { uid: "TPE7", name: "7", cityCode: "TPE", from: "G", to: "H" }],
      ["TPE8", { uid: "TPE8", name: "8", cityCode: "TPE", from: "G", to: "H" }],
      ["TPE9", { uid: "TPE9", name: "9", cityCode: "TPE", from: "G", to: "H" }],
    ]);
    const stations = findNearbyStations(new StopNetwork(index), sameNameRoutes, [121.5, 25]);

    test("merges poles on both sides of the road into one station", () => {
      expect(stations[0].name).toBe("G");
      expect(stations[0].positions).toEqual([
        [121.5, 25],
        [121.5, 25.0003],
      ]);
      // TPE7 返程在 G 是終點，不能上車
      expect(stations[0].routes.map((r) => [r.route.name, r.position])).toEqual([
        ["7", [121.5, 25]],
        ["8", [121.5, 25.0003]],
      ]);
    });

    test("keeps a far stop with the same name as its own station", () => {
      expect(summary(stations)).toEqual([
        { name: "G", routes: ["7 往 H", "8 往 H"] },
        { name: "G", routes: ["8 往 H", "9 往 H"] },
      ]);
      expect(new Set(stations.map((s) => s.id)).size).toBe(2);
    });
  });
});
