import { describe, expect, test, vi } from "vitest";
import { z } from "zod";
import { TdxClient, TdxError } from "./client";

const ItemSchema = z.object({ id: z.number() });

const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" }, ...init });

const tokenResponse = (token = "tok", expiresIn = 86400) => json({ access_token: token, expires_in: expiresIn });

function setup(responses: Array<Response | ((url: string) => Response)>) {
  let now = 0;
  const fetchMock = vi.fn<typeof fetch>(async (input) => {
    const next = responses.shift();
    if (!next) throw new Error(`unexpected fetch ${String(input)}`);
    return typeof next === "function" ? next(String(input)) : next;
  });
  const client = new TdxClient({
    clientId: "id",
    clientSecret: "secret",
    fetch: fetchMock,
    now: () => now,
    sleep: async () => {},
  });
  return { client, fetchMock, advance: (ms: number) => (now += ms) };
}

describe("TdxClient", () => {
  test("authenticates, then requests JSON with the bearer token and OData query", async () => {
    const { client, fetchMock } = setup([tokenResponse("abc"), json([{ id: 1 }])]);

    const items = await client.list("Bus/Route/City/Taipei", ItemSchema, {
      $filter: "RouteUID eq 'TPE1'",
    });

    expect(items).toEqual([{ id: 1 }]);
    const [authUrl, authInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(authUrl).toContain("/auth/realms/TDXConnect/protocol/openid-connect/token");
    expect(String(authInit.body)).toContain("grant_type=client_credentials");

    const [apiUrl, apiInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(apiUrl).toBe(
      "https://tdx.transportdata.tw/api/basic/v2/Bus/Route/City/Taipei?$format=JSON&$filter=RouteUID%20eq%20'TPE1'",
    );
    expect(new Headers(apiInit.headers).get("authorization")).toBe("Bearer abc");
  });

  test("reuses the token until shortly before it expires", async () => {
    const { client, fetchMock, advance } = setup([
      tokenResponse("t1", 3600),
      json([]),
      json([]),
      tokenResponse("t2", 3600),
      json([]),
    ]);

    await client.list("A", ItemSchema);
    advance(60_000);
    await client.list("A", ItemSchema);
    advance(3600_000);
    await client.list("A", ItemSchema);

    const authCalls = fetchMock.mock.calls.filter(([url]) => String(url).includes("/auth/"));
    expect(authCalls).toHaveLength(2);
  });

  test("drops list items that fail validation instead of failing the whole list", async () => {
    const { client } = setup([tokenResponse(), json([{ id: 1 }, { id: "bad" }, { id: 3 }])]);
    expect(await client.list("A", ItemSchema)).toEqual([{ id: 1 }, { id: 3 }]);
  });

  test("retries 5xx responses", async () => {
    const { client, fetchMock } = setup([
      tokenResponse(),
      new Response("oops", { status: 502 }),
      new Response("oops", { status: 503 }),
      json([{ id: 7 }]),
    ]);

    expect(await client.list("A", ItemSchema)).toEqual([{ id: 7 }]);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  test("does not retry 429 and pauses all calls until the rate limit resets", async () => {
    const { client, fetchMock, advance } = setup([
      tokenResponse(),
      new Response("slow down", { status: 429, headers: { "retry-after": "20" } }),
      json([{ id: 1 }]),
    ]);

    await expect(client.list("A", ItemSchema)).rejects.toMatchObject({ name: "TdxError", status: 429 });
    advance(19_000);
    await expect(client.list("B", ItemSchema)).rejects.toMatchObject({ status: 429 });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    advance(1_000);
    expect(await client.list("C", ItemSchema)).toEqual([{ id: 1 }]);
  });

  test("falls back to RateLimit-Reset, then to a full minute, when Retry-After is missing", async () => {
    const { client, advance } = setup([
      tokenResponse(),
      new Response("x", { status: 429, headers: { "ratelimit-reset": "5" } }),
      new Response("x", { status: 429 }),
      json([]),
    ]);

    await expect(client.list("A", ItemSchema)).rejects.toMatchObject({ status: 429 });
    advance(5_000);
    await expect(client.list("A", ItemSchema)).rejects.toMatchObject({ status: 429 });
    advance(59_000);
    await expect(client.list("A", ItemSchema)).rejects.toMatchObject({ status: 429 });
    advance(1_000);
    expect(await client.list("A", ItemSchema)).toEqual([]);
  });

  test("refreshes the token once on 401", async () => {
    const { client, fetchMock } = setup([
      tokenResponse("old"),
      new Response("expired", { status: 401 }),
      tokenResponse("new"),
      json([{ id: 1 }]),
    ]);

    expect(await client.list("A", ItemSchema)).toEqual([{ id: 1 }]);
    const [, lastInit] = fetchMock.mock.calls[3] as [string, RequestInit];
    expect(new Headers(lastInit.headers).get("authorization")).toBe("Bearer new");
  });

  test("throws TdxError with the status after retries run out", async () => {
    const { client } = setup([
      tokenResponse(),
      new Response("x", { status: 500 }),
      new Response("x", { status: 500 }),
      new Response("x", { status: 500 }),
    ]);

    await expect(client.list("A", ItemSchema)).rejects.toMatchObject({ name: "TdxError", status: 500 });
  });

  test("throws TdxError when authentication fails", async () => {
    const { client } = setup([new Response("bad credentials", { status: 401 })]);
    const error = await client.list("A", ItemSchema).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(TdxError);
    expect((error as TdxError).message).toContain("認證");
  });

  test("retries network errors and timeouts", async () => {
    const { client } = setup([
      tokenResponse(),
      () => {
        throw new TypeError("fetch failed");
      },
      json([{ id: 2 }]),
    ]);
    expect(await client.list("A", ItemSchema)).toEqual([{ id: 2 }]);
  });

  test("maps a persistent network failure to TdxError", async () => {
    const offline = () => {
      throw new DOMException("The operation timed out.", "TimeoutError");
    };
    const { client } = setup([tokenResponse(), offline, offline, offline]);

    const error = await client.list("A", ItemSchema).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(TdxError);
    expect((error as TdxError).message).toContain("無法連線到 TDX");
  });

  test("maps an unreachable auth server to TdxError", async () => {
    const { client } = setup([
      () => {
        throw new TypeError("fetch failed");
      },
    ]);
    await expect(client.list("A", ItemSchema)).rejects.toBeInstanceOf(TdxError);
  });

  test("maps invalid JSON to TdxError", async () => {
    const { client } = setup([tokenResponse(), new Response("<html>", { status: 200 })]);
    await expect(client.list("A", ItemSchema)).rejects.toBeInstanceOf(TdxError);
  });

  test("never runs more than four requests at once", async () => {
    let active = 0;
    let peak = 0;
    const releases: Array<() => void> = [];
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      if (String(input).includes("/auth/")) return tokenResponse();
      active++;
      peak = Math.max(peak, active);
      await new Promise<void>((resolve) => releases.push(resolve));
      active--;
      return json([]);
    });
    const client = new TdxClient({ clientId: "id", clientSecret: "secret", fetch: fetchMock });

    const all = Promise.all(Array.from({ length: 10 }, () => client.list("A", ItemSchema)));
    while (fetchMock.mock.calls.length < 11) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      releases.shift()?.();
    }
    for (let i = 0; i < 10; i++) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      releases.splice(0).forEach((release) => release());
    }
    await all;

    expect(peak).toBeLessThanOrEqual(4);
  });

  test("throws TdxError when the response is not a list", async () => {
    const { client } = setup([tokenResponse(), json({ message: "nope" })]);
    await expect(client.list("A", ItemSchema)).rejects.toBeInstanceOf(TdxError);
  });
});
