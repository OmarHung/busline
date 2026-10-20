import { afterEach, describe, expect, test, vi } from "vitest";
import { badRequest, cachedJson, errorResponse, parseLngLat, parseLngLatList } from "./http";
import { TdxError } from "./tdx/client";
import { ConfigError, RouteNotFoundError } from "./tdx/service";

afterEach(() => vi.restoreAllMocks());

describe("cachedJson", () => {
  test("sets a CDN cache policy", async () => {
    const res = cachedJson({ ok: 1 }, { sMaxAge: 10, staleWhileRevalidate: 20 });
    expect(res.headers.get("cache-control")).toBe("public, max-age=0, s-maxage=10, stale-while-revalidate=20");
    expect(await res.json()).toEqual({ ok: 1 });
  });
});

describe("errorResponse", () => {
  test("lets the CDN cache not-found responses briefly", async () => {
    const res = errorResponse(new RouteNotFoundError("x"), "test");
    expect(res.status).toBe(404);
    expect(res.headers.get("cache-control")).toBe("public, max-age=0, s-maxage=600");
    expect(await res.json()).toEqual({ error: "找不到這條路線" });
  });

  test("asks the user to wait when TDX rate-limits us", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const res = errorResponse(new TdxError("x", 429), "test");
    expect(res.status).toBe(503);
    expect(res.headers.get("retry-after")).toBe("60");
    expect(await res.json()).toEqual({ error: "資料來源的呼叫次數暫時用完了，請稍候一分鐘再試" });
  });

  test.each([
    [new ConfigError("x"), 503, "伺服器尚未設定 TDX 金鑰"],
    [new TdxError("x", 500), 502, "交通部 TDX 資料暫時無法取得，請稍後再試"],
    [new Error("secret detail"), 502, "伺服器發生錯誤"],
  ])("maps %o to HTTP %i without leaking details", async (error, status, message) => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    const res = errorResponse(error, "test");

    expect(res.status).toBe(status);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({ error: message });
  });
});

describe("parseLngLat", () => {
  test("parses longitude,latitude inside Taiwan", () => {
    expect(parseLngLat("121.5654,25.033")).toEqual([121.5654, 25.033]);
  });

  test.each([null, "", "121.5", "abc,25", "121,25,1", "25.03,121.56", "139.69,35.68"])("rejects %j", (text) => {
    expect(parseLngLat(text)).toBeNull();
  });
});

describe("parseLngLatList", () => {
  test("parses points separated by semicolons, in order", () => {
    expect(parseLngLatList("121.5,25;121.6,25.1;121.7,25.2")).toEqual([
      [121.5, 25],
      [121.6, 25.1],
      [121.7, 25.2],
    ]);
  });

  test.each([null, "", "121.5,25;", "121.5,25;abc,25", "121.5,25;139.69,35.68"])("rejects %j", (text) => {
    expect(parseLngLatList(text)).toBeNull();
  });
});

describe("badRequest", () => {
  test("returns a 400 with the message", async () => {
    const res = badRequest("參數錯誤");
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "參數錯誤" });
  });
});
