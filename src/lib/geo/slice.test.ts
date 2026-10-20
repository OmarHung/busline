import { describe, expect, test } from "vitest";
import type { LngLat } from "../types";
import { sliceLineBetween } from "./slice";

const LINE: LngLat[] = [
  [121.5, 25],
  [121.51, 25],
  [121.52, 25],
  [121.53, 25],
  [121.54, 25],
];

describe("sliceLineBetween", () => {
  test("keeps the part of the line between the two points, starting and ending exactly at them", () => {
    expect(sliceLineBetween([LINE], [121.5101, 25.0001], [121.5299, 24.9999])).toEqual([
      [121.5101, 25.0001],
      [121.51, 25],
      [121.52, 25],
      [121.53, 25],
      [121.5299, 24.9999],
    ]);
  });

  test("joins multi-part lines before slicing, without repeating shared points", () => {
    const parts: LngLat[][] = [LINE.slice(0, 3), LINE.slice(2)];
    expect(sliceLineBetween(parts, [121.52, 25], [121.54, 25])).toEqual([
      [121.52, 25],
      [121.53, 25],
      [121.54, 25],
    ]);
  });

  test("looks for the end point only after the start, so loop routes slice the right way round", () => {
    const loop: LngLat[] = [...LINE, [121.53, 25.001], [121.51, 25.001]];
    expect(sliceLineBetween([loop], [121.53, 25], [121.51, 25.001])).toEqual([
      [121.53, 25],
      [121.54, 25],
      [121.53, 25.001],
      [121.51, 25.001],
    ]);
  });

  test("returns null when the line cannot connect the points in order", () => {
    expect(sliceLineBetween([LINE], [121.54, 25], [121.5, 25])).toBeNull();
    expect(sliceLineBetween([], [121.5, 25], [121.54, 25])).toBeNull();
  });
});
