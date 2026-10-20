import { describe, expect, test } from "vitest";
import { formatEta } from "./eta";
import type { StopEta } from "./types";

const eta = (patch: Partial<StopEta>): StopEta => ({
  estimateSec: null,
  status: 0,
  nextBusTime: null,
  isLastBus: false,
  ...patch,
});

describe("formatEta", () => {
  test("shows arriving when the bus is within a minute", () => {
    expect(formatEta(eta({ estimateSec: 30 }))).toEqual({ label: "進站中", tone: "arriving" });
  });

  test("shows soon when the bus is within three minutes", () => {
    expect(formatEta(eta({ estimateSec: 150 }))).toEqual({ label: "即將到站", tone: "soon" });
  });

  test("shows whole minutes otherwise", () => {
    expect(formatEta(eta({ estimateSec: 7 * 60 + 59 }))).toEqual({ label: "7 分", tone: "normal", minutes: 7 });
  });

  test("marks the last bus", () => {
    expect(formatEta(eta({ estimateSec: 600, isLastBus: true })).label).toBe("10 分・末班");
  });

  test("shows the next departure time in Taipei time when not yet departed", () => {
    const result = formatEta(eta({ status: 1, nextBusTime: "2026-10-20T14:05:00+08:00" }));
    expect(result).toEqual({ label: "14:05 發車", tone: "muted" });
  });

  test("falls back to not departed when there is no next bus time", () => {
    expect(formatEta(eta({ status: 1 })).label).toBe("尚未發車");
  });

  test.each([
    [2, "交管不停靠"],
    [3, "末班已過"],
    [4, "今日未營運"],
  ])("maps status %i to %s", (status, label) => {
    expect(formatEta(eta({ status }))).toEqual({ label, tone: "muted" });
  });

  test("shows a dash when there is no data", () => {
    expect(formatEta(undefined)).toEqual({ label: "—", tone: "muted" });
    expect(formatEta(eta({}))).toEqual({ label: "—", tone: "muted" });
  });
});
