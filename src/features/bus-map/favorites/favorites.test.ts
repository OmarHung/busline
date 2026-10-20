import { describe, expect, test } from "vitest";
import type { RouteSummary } from "@/lib/types";
import {
  decodeShared,
  encodeShared,
  favoriteKey,
  mergeFavorites,
  MAX_FAVORITES,
  parseStored,
  resolveShared,
  serializeStored,
  toggleFavorite,
  type Favorite,
} from "./favorites";

const r307: RouteSummary = { uid: "TPE16111", name: "307", cityCode: "TPE", from: "板橋", to: "撫遠街" };
const red5: RouteSummary = { uid: "TPE10132", name: "紅5", cityCode: "TPE", from: "捷運北投站", to: "新北投" };

const routeFav: Favorite = { kind: "route", route: r307 };
const stopFav: Favorite = {
  kind: "stop",
  route: r307,
  direction: 1,
  headsign: "往 板橋",
  stop: { name: "板橋車站", position: [121.4647, 25.0144] },
};

describe("favoriteKey", () => {
  test("tells a route apart from a stop on that route, and directions apart", () => {
    expect(favoriteKey(routeFav)).toBe("route:TPE16111");
    expect(favoriteKey(stopFav)).toBe("stop:TPE16111:1:板橋車站");
    expect(favoriteKey({ ...stopFav, direction: 0 })).not.toBe(favoriteKey(stopFav));
  });
});

describe("toggleFavorite", () => {
  test("adds to the front, and removes when it is already there", () => {
    const added = toggleFavorite([routeFav], stopFav);
    expect(added).toEqual([stopFav, routeFav]);
    expect(toggleFavorite(added, routeFav)).toEqual([stopFav]);
  });

  test("keeps at most the limit, dropping the oldest", () => {
    const many = Array.from({ length: MAX_FAVORITES }, (_, i): Favorite => ({
      kind: "route",
      route: { ...r307, uid: `TPE${i}` },
    }));
    const result = toggleFavorite(many, stopFav);
    expect(result).toHaveLength(MAX_FAVORITES);
    expect(result[0]).toEqual(stopFav);
    expect(result.at(-1)).toEqual(many.at(-2));
  });
});

describe("stored favorites", () => {
  test("round-trip through localStorage text", () => {
    expect(parseStored(serializeStored([stopFav, routeFav]))).toEqual([stopFav, routeFav]);
  });

  test("ignore missing, broken or foreign data instead of crashing", () => {
    expect(parseStored(null)).toEqual([]);
    expect(parseStored("{not json")).toEqual([]);
    expect(parseStored(JSON.stringify({ v: 99, items: [routeFav] }))).toEqual([]);
    expect(parseStored(JSON.stringify({ v: 1, items: [{ kind: "route" }] }))).toEqual([]);
  });

  test("drop only the broken items", () => {
    const text = JSON.stringify({ v: 1, items: [routeFav, { kind: "stop", route: r307 }, stopFav] });
    expect(parseStored(text)).toEqual([routeFav, stopFav]);
  });
});

describe("shared links", () => {
  test("encode favorites into a URL-safe string and back", () => {
    const encoded = encodeShared([stopFav, routeFav]);
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeShared(encoded)).toEqual([
      {
        kind: "stop",
        uid: "TPE16111",
        direction: 1,
        headsign: "往 板橋",
        stopName: "板橋車站",
        position: [121.4647, 25.0144],
      },
      { kind: "route", uid: "TPE16111" },
    ]);
  });

  test("reject garbage", () => {
    expect(decodeShared("")).toBeNull();
    expect(decodeShared("@@@")).toBeNull();
    expect(decodeShared(btoa("[1,2,3]"))).toBeNull();
  });

  test("resolve routes from the route list, skipping ones that no longer exist", () => {
    const shared = decodeShared(encodeShared([stopFav, { kind: "route", route: red5 }, routeFav]));
    const index = new Map([[r307.uid, r307]]);
    expect(resolveShared(shared ?? [], index)).toEqual([stopFav, routeFav]);
  });
});

describe("mergeFavorites", () => {
  test("adds imported favorites after the existing ones, skipping duplicates", () => {
    const red5Fav: Favorite = { kind: "route", route: red5 };
    expect(mergeFavorites([routeFav], [stopFav, routeFav, red5Fav])).toEqual([routeFav, stopFav, red5Fav]);
  });
});
