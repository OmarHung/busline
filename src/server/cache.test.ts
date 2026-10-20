import { describe, expect, test, vi } from "vitest";
import { TtlCache } from "./cache";

function setup(maxEntries = 10) {
  let now = 0;
  const onError = vi.fn();
  const cache = new TtlCache({ maxEntries, now: () => now, onError });
  return { cache, onError, advance: (ms: number) => (now += ms) };
}

/** 讓背景更新的 promise 跑完 */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("TtlCache", () => {
  test("returns the cached value until the ttl expires", async () => {
    const { cache, advance } = setup();
    const loader = vi.fn().mockResolvedValueOnce("a").mockResolvedValueOnce("b");

    expect(await cache.getOrLoad("k", { ttlMs: 1000 }, loader)).toBe("a");
    advance(999);
    expect(await cache.getOrLoad("k", { ttlMs: 1000 }, loader)).toBe("a");
    advance(2);
    expect(await cache.getOrLoad("k", { ttlMs: 1000 }, loader)).toBe("b");
    expect(loader).toHaveBeenCalledTimes(2);
  });

  test("shares one in-flight load between concurrent callers", async () => {
    const { cache } = setup();
    const loader = vi.fn().mockResolvedValue("v");

    const results = await Promise.all([1, 2, 3].map(() => cache.getOrLoad("k", { ttlMs: 1000 }, loader)));

    expect(results).toEqual(["v", "v", "v"]);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  test("does not cache failures", async () => {
    const { cache } = setup();
    const loader = vi.fn().mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce("ok");

    await expect(cache.getOrLoad("k", { ttlMs: 1000 }, loader)).rejects.toThrow("boom");
    expect(await cache.getOrLoad("k", { ttlMs: 1000 }, loader)).toBe("ok");
  });

  test("lets the ttl depend on the loaded value", async () => {
    const { cache, advance } = setup();
    const ttlMs = (value: string) => (value === "empty" ? 100 : 10_000);
    const loader = vi.fn().mockResolvedValueOnce("empty").mockResolvedValueOnce("full");

    await cache.getOrLoad("k", { ttlMs }, loader);
    advance(101);

    expect(await cache.getOrLoad("k", { ttlMs }, loader)).toBe("full");
  });

  describe("stale-while-revalidate", () => {
    test("returns the stale value at once and refreshes in the background", async () => {
      const { cache, advance } = setup();
      const options = { ttlMs: 1000, maxStaleMs: 60_000 };
      await cache.getOrLoad("k", options, async () => "old");
      advance(5000);

      const loader = vi.fn().mockResolvedValue("new");
      expect(await cache.getOrLoad("k", options, loader)).toBe("old");
      await flush();

      expect(loader).toHaveBeenCalledOnce();
      expect(await cache.getOrLoad("k", options, loader)).toBe("new");
    });

    test("backs off after a failed background refresh instead of retrying every request", async () => {
      const { cache, advance, onError } = setup();
      const options = { ttlMs: 1000, maxStaleMs: 60_000 };
      await cache.getOrLoad("k", options, async () => "old");
      advance(5000);

      const failing = vi.fn().mockRejectedValue(new Error("tdx down"));
      expect(await cache.getOrLoad("k", options, failing)).toBe("old");
      await flush();
      expect(await cache.getOrLoad("k", options, failing)).toBe("old");
      await flush();

      expect(failing).toHaveBeenCalledOnce();
      expect(onError).toHaveBeenCalledWith("k", expect.any(Error));
    });

    test("still expires the stale value during a long outage", async () => {
      const { cache, advance } = setup();
      const options = { ttlMs: 1000, maxStaleMs: 60_000 };
      const failing = async (): Promise<string> => {
        throw new Error("tdx down");
      };
      await cache.getOrLoad("k", options, async () => "old");

      for (let elapsed = 0; elapsed < 60_000; elapsed += 10_000) {
        advance(10_000);
        expect(await cache.getOrLoad("k", options, failing)).toBe("old");
        await flush();
      }
      advance(2000);

      await expect(cache.getOrLoad("k", options, failing)).rejects.toThrow("tdx down");
    });

    test("stops serving a value older than maxStaleMs", async () => {
      const { cache, advance } = setup();
      const options = { ttlMs: 1000, maxStaleMs: 2000 };
      await cache.getOrLoad("k", options, async () => "old");
      advance(3001);

      await expect(
        cache.getOrLoad("k", options, async () => {
          throw new Error("tdx down");
        }),
      ).rejects.toThrow("tdx down");
    });
  });

  test("evicts the oldest entry beyond maxEntries", async () => {
    const { cache } = setup(2);
    await cache.getOrLoad("a", { ttlMs: 1000 }, async () => 1);
    await cache.getOrLoad("b", { ttlMs: 1000 }, async () => 2);
    await cache.getOrLoad("c", { ttlMs: 1000 }, async () => 3);

    const loader = vi.fn().mockResolvedValue(10);
    expect(await cache.getOrLoad("a", { ttlMs: 1000 }, loader)).toBe(10);
    expect(loader).toHaveBeenCalledOnce();
  });
});
