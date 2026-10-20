import { describe, expect, test } from "vitest";
import type { LngLat } from "../types";
import { simplifyLine } from "./simplify";

// 緯度 0.00001 度約 1.1 公尺
describe("simplifyLine", () => {
  test("drops points that are within the tolerance of the straight line", () => {
    const line: LngLat[] = [
      [121.5, 25],
      [121.5005, 25.00001],
      [121.501, 25],
    ];

    expect(simplifyLine(line, 2)).toEqual([
      [121.5, 25],
      [121.501, 25],
    ]);
  });

  test("keeps corners farther than the tolerance", () => {
    const line: LngLat[] = [
      [121.5, 25],
      [121.5005, 25.0001],
      [121.501, 25],
    ];

    expect(simplifyLine(line, 2)).toEqual(line);
  });

  test("keeps the corner of an L-shaped line and drops the points along each leg", () => {
    const line: LngLat[] = [
      [121.5, 25],
      [121.5005, 25],
      [121.501, 25],
      [121.501, 25.0005],
      [121.501, 25.001],
    ];

    expect(simplifyLine(line, 2)).toEqual([
      [121.5, 25],
      [121.501, 25],
      [121.501, 25.001],
    ]);
  });

  test("keeps the far side of a loop that starts and ends at the same point", () => {
    const line: LngLat[] = [
      [121.5, 25],
      [121.501, 25],
      [121.501, 25.001],
      [121.5, 25],
    ];

    expect(simplifyLine(line, 2)).toContainEqual([121.501, 25.001]);
  });

  test("returns lines with fewer than three points unchanged, without mutating the input", () => {
    const line: LngLat[] = [
      [121.5, 25],
      [121.501, 25],
    ];
    const copy = structuredClone(line);

    const result = simplifyLine(line, 2);

    expect(result).toEqual(copy);
    expect(result).not.toBe(line);
    expect(line).toEqual(copy);
  });
});
