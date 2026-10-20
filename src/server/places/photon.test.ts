import { describe, expect, test, vi } from "vitest";
import { searchPhoton } from "./photon";

const feature = (name: string | undefined, coords: [number, number], props: Record<string, unknown> = {}) => ({
  type: "Feature",
  geometry: { type: "Point", coordinates: coords },
  properties: { osm_type: "N", osm_id: Math.round(coords[0] * 1000), name, ...props },
});

const respond = (features: unknown[]) =>
  vi.fn<typeof fetch>(async () => Response.json({ type: "FeatureCollection", features }));

describe("searchPhoton", () => {
  test("queries Photon within Taiwan, biased towards the user, and maps results to places", async () => {
    const fetchMock = respond([
      feature("台北101", [121.5645, 25.0338], { city: "臺北市", district: "信義區", street: "信義路五段" }),
    ]);

    const places = await searchPhoton("台北101", { near: [121.5, 25], fetch: fetchMock });

    const url = new URL(String(fetchMock.mock.calls[0][0]));
    expect(url.origin + url.pathname).toBe("https://photon.komoot.io/api/");
    expect(url.searchParams.get("q")).toBe("台北101");
    expect(url.searchParams.get("bbox")).toBe("119.3,21.8,122.1,26.5");
    expect(url.searchParams.get("lon")).toBe("121.5");
    expect(url.searchParams.get("lat")).toBe("25");
    expect(new Headers(fetchMock.mock.calls[0][1]?.headers).get("user-agent")).toContain("busline");
    expect(places).toEqual([
      {
        id: "osm:N121565",
        name: "台北101",
        detail: "臺北市 信義區 信義路五段",
        position: [121.5645, 25.0338],
        kind: "place",
      },
    ]);
  });

  test("names unnamed addresses by street and house number, and drops results with neither", async () => {
    const places = await searchPhoton("和平東路", {
      fetch: respond([
        feature(undefined, [121.53, 25.02], { street: "和平東路一段", housenumber: "162", city: "臺北市" }),
        feature(undefined, [121.54, 25.02], {}),
      ]),
    });
    expect(places.map((p) => p.name)).toEqual(["和平東路一段162號"]);
  });

  test("drops duplicate results at the same spot", async () => {
    const places = await searchPhoton("師大夜市", {
      fetch: respond([feature("師大夜市", [121.5291, 25.0241]), feature("師大夜市", [121.52911, 25.02412])]),
    });
    expect(places).toHaveLength(1);
  });

  test("throws when Photon answers with an error", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response("busy", { status: 503 }));
    await expect(searchPhoton("x", { fetch: fetchMock })).rejects.toThrow("503");
  });
});
