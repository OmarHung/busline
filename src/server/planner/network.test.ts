import { describe, expect, test } from "vitest";
import { NETWORK_INDEX } from "./fixtures";
import { StopNetwork } from "./network";

const network = new StopNetwork(NETWORK_INDEX);

describe("StopNetwork", () => {
  test("finds stops within walking distance, nearest first", () => {
    const near = network.stopsNear([121.5049, 25], 600);
    expect(near.map((n) => network.stop(n.stop).name)).toEqual(["B", "A", "C"]);
    expect(near[0].meters).toBeLessThan(15);
  });

  test("finds stops across grid cell borders", () => {
    // 0.01 度一格；121.5099 與 121.51 在不同格
    expect(network.stopsNear([121.5099, 25], 50).map((n) => network.stop(n.stop).name)).toEqual(["C"]);
  });

  test("returns nothing when no stop is in range", () => {
    expect(network.stopsNear([121.7, 25.2], 800)).toEqual([]);
  });

  test("lists every route direction passing a stop, with the stop's position in it", () => {
    const d = network.stopsNear([121.52, 25], 10)[0].stop;
    expect(network.occurrences(d)).toEqual([
      { pattern: 0, position: 3 },
      { pattern: 1, position: 1 },
      { pattern: 2, position: 1 },
    ]);
  });

  test("measures the ride distance between two positions of a pattern", () => {
    // A→C：0.01 度經度，在緯度 25 約 1009 公尺
    expect(network.rideMeters(0, 0, 2)).toBeGreaterThan(1000);
    expect(network.rideMeters(0, 0, 2)).toBeLessThan(1020);
    expect(network.rideMeters(0, 2, 2)).toBe(0);
  });

  test("tells which city a stop belongs to from the routes serving it", () => {
    expect(network.stopCity(0)).toBe("TPE");
  });

  test("finds stops by name", () => {
    expect(network.stopIdsByName("C")).toEqual([2]);
    expect(network.stopIdsByName("Z")).toEqual([]);
  });
});
