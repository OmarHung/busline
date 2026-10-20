import { describe, expect, test } from "vitest";
import { CITIES, cityByCode, cityFromRouteUid, isValidRouteUid } from "./cities";

describe("cityFromRouteUid", () => {
  test("resolves city bus uid to its TDX path", () => {
    const city = cityFromRouteUid("TPE16111");
    expect(city?.code).toBe("TPE");
    expect(city?.tdxPath).toBe("City/Taipei");
    expect(city?.name).toBe("臺北市");
  });

  test("resolves intercity uid to the InterCity path", () => {
    expect(cityFromRouteUid("THB1610")?.tdxPath).toBe("InterCity");
  });

  test("returns undefined for an unknown prefix", () => {
    expect(cityFromRouteUid("XYZ123")).toBeUndefined();
  });
});

describe("isValidRouteUid", () => {
  test.each(["TPE16111", "THB1610", "NWT157462", "KHH100A"])("accepts %s", (uid) => {
    expect(isValidRouteUid(uid)).toBe(true);
  });

  test.each(["", "TPE", "tpe16111", "TPE16111'", "TPE 1", "XYZ123", `TPE${"1".repeat(40)}`])("rejects %j", (uid) => {
    expect(isValidRouteUid(uid)).toBe(false);
  });
});

describe("CITIES", () => {
  test("codes are unique and lookups round-trip", () => {
    const codes = CITIES.map((c) => c.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const city of CITIES) expect(cityByCode(city.code)).toBe(city);
  });
});
