import { describe, expect, test, vi } from "vitest";
import type { Favorite } from "./favorites";
import { createFavoriteStore, FAVORITES_STORAGE_KEY } from "./store";

const fav: Favorite = {
  kind: "route",
  route: { uid: "TPE16111", name: "307", cityCode: "TPE", from: "板橋", to: "撫遠街" },
};

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    data,
  };
}

describe("createFavoriteStore", () => {
  test("saves to storage and tells subscribers", () => {
    const storage = memoryStorage();
    const store = createFavoriteStore(storage, null);
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    store.set([fav]);

    expect(store.get()).toEqual([fav]);
    expect(createFavoriteStore(storage, null).get()).toEqual([fav]);
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    store.set([]);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  test("keeps working in memory when storage is unavailable or full", () => {
    const failing = {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    };
    const store = createFavoriteStore(failing, null);

    expect(store.get()).toEqual([]);
    store.set([fav]);
    expect(store.get()).toEqual([fav]);
    expect(createFavoriteStore(null, null).get()).toEqual([]);
  });

  test("picks up changes made in another tab", () => {
    const storage = memoryStorage();
    const target = new EventTarget();
    const store = createFavoriteStore(storage, target);
    const listener = vi.fn();
    store.subscribe(listener);

    createFavoriteStore(storage, null).set([fav]);
    target.dispatchEvent(Object.assign(new Event("storage"), { key: "unrelated" }));
    expect(listener).not.toHaveBeenCalled();
    target.dispatchEvent(Object.assign(new Event("storage"), { key: FAVORITES_STORAGE_KEY }));

    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.get()).toEqual([fav]);
  });
});
