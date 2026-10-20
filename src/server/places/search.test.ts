import { describe, expect, test, vi } from "vitest";
import type { LngLat, Place } from "@/lib/types";
import { TtlCache } from "../cache";
import { StopNetwork } from "../planner/network";
import { createPlaceSearch } from "./search";

const network = new StopNetwork({
  generatedAt: "",
  stops: [
    ["國父紀念館", 121.5577, 25.0412],
    ["臺北101", 121.5651, 25.0341],
  ],
  patterns: [["TPE1", 0, [0, 1]]],
});

const osm = (name: string, position: LngLat): Place => ({
  id: `osm:${name}`,
  name,
  detail: "",
  position,
  kind: "place",
});

function setup(photonResult: Place[] | Error = []) {
  const photon = vi.fn(async () => {
    if (photonResult instanceof Error) throw photonResult;
    return photonResult;
  });
  const onError = vi.fn();
  const search = createPlaceSearch({ network, photon, cache: new TtlCache(), onError });
  return { search, photon, onError };
}

describe("createPlaceSearch", () => {
  test("lists matching bus stops first, then OpenStreetMap places", async () => {
    const { search } = setup([osm("國父紀念館站", [121.5579, 25.0414]), osm("國父紀念館", [121.56, 25.04])]);

    const places = await search("國父紀念館");

    expect(places.map((p) => [p.kind, p.name])).toEqual([
      ["stop", "國父紀念館"],
      ["place", "國父紀念館站"],
    ]);
  });

  test("still answers with bus stops when Photon fails", async () => {
    const { search, onError } = setup(new Error("photon down"));

    const places = await search("台北101");

    expect(places.map((p) => p.name)).toEqual(["臺北101"]);
    expect(onError).toHaveBeenCalledOnce();
  });

  test("caches Photon answers per query and nearby area", async () => {
    const { search, photon } = setup([osm("師大夜市", [121.529, 25.024])]);

    await search("師大夜市", [121.5301, 25.0201]);
    await search(" 師大夜市 ", [121.5302, 25.0202]);
    await search("師大夜市", [120.3, 22.6]);

    expect(photon).toHaveBeenCalledTimes(2);
  });

  test("does not ask Photon about single characters", async () => {
    const { search, photon } = setup();
    await search("國");
    expect(photon).not.toHaveBeenCalled();
  });
});
