import { describe, expect, test } from "vitest";
import { parseWktLines } from "./wkt";

describe("parseWktLines", () => {
  test("parses a LINESTRING into one line of [lng, lat]", () => {
    expect(parseWktLines("LINESTRING(121.5 25.03,121.51 25.04)")).toEqual([
      [
        [121.5, 25.03],
        [121.51, 25.04],
      ],
    ]);
  });

  test("tolerates spaces and lowercase keywords", () => {
    expect(parseWktLines("linestring ( 121.5 25.03 , 121.51 25.04 )")).toEqual([
      [
        [121.5, 25.03],
        [121.51, 25.04],
      ],
    ]);
  });

  test("parses a MULTILINESTRING into several lines", () => {
    const lines = parseWktLines("MULTILINESTRING((121 25,121.1 25.1),(121.2 25.2,121.3 25.3))");
    expect(lines).toHaveLength(2);
    expect(lines[1]).toEqual([
      [121.2, 25.2],
      [121.3, 25.3],
    ]);
  });

  test("drops non-numeric points and lines shorter than two points", () => {
    expect(parseWktLines("LINESTRING(121 25,abc def)")).toEqual([]);
  });

  test("returns an empty array for unsupported or empty input", () => {
    expect(parseWktLines("")).toEqual([]);
    expect(parseWktLines("POINT(121 25)")).toEqual([]);
  });
});
