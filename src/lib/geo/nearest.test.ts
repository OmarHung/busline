import { describe, expect, test } from "vitest";
import { nearestStopIndex } from "./nearest";
import type { Stop } from "../types";

const stops: Stop[] = [
  { uid: "a", name: "A", seq: 1, position: [121.5, 25.0] },
  { uid: "b", name: "B", seq: 2, position: [121.51, 25.0] },
  { uid: "c", name: "C", seq: 3, position: [121.52, 25.0] },
];

describe("nearestStopIndex", () => {
  test("returns the index of the closest stop", () => {
    expect(nearestStopIndex(stops, [121.509, 25.0005])).toBe(1);
  });

  test("returns -1 when the bus is farther than the threshold", () => {
    expect(nearestStopIndex(stops, [121.7, 25.2])).toBe(-1);
  });

  test("returns -1 when there are no stops", () => {
    expect(nearestStopIndex([], [121.5, 25])).toBe(-1);
  });
});
