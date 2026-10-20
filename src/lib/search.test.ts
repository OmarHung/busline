import { describe, expect, test } from "vitest";
import { searchRoutes } from "./search";
import type { RouteSummary } from "./types";

const route = (uid: string, name: string, cityCode: string, from = "甲", to = "乙"): RouteSummary => ({
  uid,
  name,
  cityCode,
  from,
  to,
});

const INDEX: RouteSummary[] = [
  route("TPE1", "307", "TPE", "板橋", "撫遠街"),
  route("TPE2", "307西藏三民", "TPE", "板橋", "撫遠街"),
  route("TPE3", "1307", "TPE"),
  route("TXG1", "307", "TXG", "梧棲觀光漁港", "新民高中"),
  route("THB1", "7307", "THB", "梅山", "北港鎮公所"),
  route("TPE4", "紅5", "TPE", "捷運北投站", "新北投"),
];

describe("searchRoutes", () => {
  test("returns nothing for a blank query", () => {
    expect(searchRoutes(INDEX, "  ")).toEqual([]);
  });

  test("groups results by city in the fixed city order", () => {
    const groups = searchRoutes(INDEX, "307");
    expect(groups.map((g) => g.cityCode)).toEqual(["TPE", "TXG", "THB"]);
  });

  test("ranks exact matches first, then prefix, then substring", () => {
    const [taipei] = searchRoutes(INDEX, "307");
    expect(taipei.routes.map((r) => r.uid)).toEqual(["TPE1", "TPE2", "TPE3"]);
  });

  test("matches terminal stop names", () => {
    const groups = searchRoutes(INDEX, "北投");
    expect(groups.flatMap((g) => g.routes.map((r) => r.uid))).toEqual(["TPE4"]);
  });

  test("treats 臺 and 台 as the same character", () => {
    const groups = searchRoutes([route("THB1", "1610", "THB", "臺北轉運站", "建國客運站")], "台北轉運");
    expect(groups).toHaveLength(1);
  });

  test("ignores case and full-width digits", () => {
    expect(searchRoutes([route("X1", "F212", "TPE")], "ｆ２１２")).toHaveLength(1);
  });

  test("caps the number of results", () => {
    const many = Array.from({ length: 120 }, (_, i) => route(`TPE${i}`, `9${i}`, "TPE"));
    const total = searchRoutes(many, "9", 50).reduce((n, g) => n + g.routes.length, 0);
    expect(total).toBe(50);
  });
});
