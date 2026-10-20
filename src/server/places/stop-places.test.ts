import { describe, expect, test } from "vitest";
import { StopNetwork } from "../planner/network";
import type { StopIndex } from "../stop-index/types";
import { searchStopPlaces } from "./stop-places";

const INDEX: StopIndex = {
  generatedAt: "",
  stops: [
    // 臺北車站：相距不到 300 公尺的兩個站牌 → 合成一個地點
    ["臺北車站", 121.517, 25.0478],
    ["臺北車站", 121.5195, 25.0465],
    // 中山路口：台中與高雄各一個，距離很遠 → 兩個地點
    ["中山路口", 120.68, 24.14],
    ["中山路口", 120.3, 22.63],
    ["臺北車站(忠孝)", 121.518, 25.046],
    ["北車站前", 121.6, 25.1],
  ],
  patterns: [
    ["TPE1", 0, [0, 1, 4, 5]],
    ["NWT1", 0, [1]],
    ["TXG1", 0, [2]],
    ["KHH1", 0, [3]],
  ],
};

const network = new StopNetwork(INDEX);

describe("searchStopPlaces", () => {
  test("merges same-name stops close together into one place at their centre", () => {
    const [first] = searchStopPlaces(network, "臺北車站");
    expect(first).toMatchObject({ name: "臺北車站", detail: "公車站・2 條路線", kind: "stop" });
    expect(first.position[0]).toBeCloseTo(121.51825, 4);
  });

  test("treats 台 and 臺 alike and ranks exact, then prefix, then partial matches", () => {
    expect(searchStopPlaces(network, "台北車站").map((p) => p.name)).toEqual(["臺北車站", "臺北車站(忠孝)"]);
    expect(searchStopPlaces(network, "北車站").map((p) => p.name)).toEqual(["北車站前", "臺北車站", "臺北車站(忠孝)"]);
  });

  test("keeps distant same-name stops apart, nearest to the user first", () => {
    const places = searchStopPlaces(network, "中山路口", { near: [120.3, 22.6] });
    expect(places.map((p) => p.position[1])).toEqual([22.63, 24.14]);
  });

  test("gives every place a stable unique id", () => {
    const ids = searchStopPlaces(network, "中山路口").map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(searchStopPlaces(network, "中山路口").map((p) => p.id)).toEqual(ids);
  });

  test("returns nothing for a blank or unmatched query", () => {
    expect(searchStopPlaces(network, " ")).toEqual([]);
    expect(searchStopPlaces(network, "火星")).toEqual([]);
  });

  test("caps the number of places", () => {
    expect(searchStopPlaces(network, "車站", { limit: 1 })).toHaveLength(1);
  });
});
