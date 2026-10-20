import { describe, expect, test } from "vitest";
import type { Stop } from "@/lib/types";
import { hintedStopUid } from "./stop-hint";

const stops: Stop[] = [
  { uid: "s1", name: "板橋車站", seq: 1, position: [121.4647, 25.0144] },
  { uid: "s2", name: "新埔", seq: 2, position: [121.4683, 25.0236] },
  { uid: "s3", name: "板橋車站", seq: 3, position: [121.47, 25.03] },
];

describe("hintedStopUid", () => {
  test("picks the stop with the same name nearest to the hinted pole", () => {
    expect(hintedStopUid(stops, { name: "板橋車站", position: [121.4648, 25.0145] })).toBe("s1");
    expect(hintedStopUid(stops, { name: "板橋車站", position: [121.4699, 25.0299] })).toBe("s3");
  });

  test("returns null when no stop has that name", () => {
    expect(hintedStopUid(stops, { name: "江子翠", position: [121.4683, 25.0236] })).toBeNull();
    expect(hintedStopUid([], { name: "新埔", position: [121.4683, 25.0236] })).toBeNull();
  });
});
