interface Entry {
  value: unknown;
  storedAt: number;
  ttlMs: number;
  /** 背景更新失敗後，到這個時間前不再重試 */
  retryAt: number;
}

export interface CacheOptions<T> {
  /** 新鮮期限；可依載入結果決定，例如空結果只快取很短時間 */
  ttlMs: number | ((value: T) => number);
  /** 過期後仍可先回舊值、背景更新的時間；超過就必須等新資料 */
  maxStaleMs?: number;
}

interface TtlCacheOptions {
  maxEntries?: number;
  now?: () => number;
  /** 背景更新失敗時呼叫（失敗不會傳給呼叫端） */
  onError?: (key: string, error: unknown) => void;
}

/** 背景更新失敗後，多久內不再重試 */
const FAILURE_BACKOFF_MS = 30_000;

/**
 * 程序內 TTL 快取：同一個 key 同時只會載入一次；
 * 過期但仍在 maxStaleMs 內的值會先回傳、背景更新，TDX 故障時不會每個請求都卡在逾時。
 */
export class TtlCache {
  private readonly entries = new Map<string, Entry>();
  private readonly inflight = new Map<string, Promise<unknown>>();
  private readonly maxEntries: number;
  private readonly now: () => number;
  private readonly onError: (key: string, error: unknown) => void;

  constructor({ maxEntries = 1000, now = Date.now, onError = () => {} }: TtlCacheOptions = {}) {
    this.maxEntries = maxEntries;
    this.now = now;
    this.onError = onError;
  }

  async getOrLoad<T>(key: string, options: CacheOptions<T>, loader: () => Promise<T>): Promise<T> {
    const entry = this.entries.get(key);
    const now = this.now();
    if (!entry) return this.load(key, options, loader);

    const age = now - entry.storedAt;
    if (age < entry.ttlMs) return entry.value as T;
    if (age > entry.ttlMs + (options.maxStaleMs ?? 0)) return this.load(key, options, loader);

    if (now >= entry.retryAt) this.refreshInBackground(key, entry, options, loader);
    return entry.value as T;
  }

  private refreshInBackground<T>(key: string, entry: Entry, options: CacheOptions<T>, loader: () => Promise<T>) {
    if (this.inflight.has(key)) return;
    this.load(key, options, loader).catch((error: unknown) => {
      if (this.entries.get(key) === entry) {
        this.entries.set(key, { ...entry, retryAt: this.now() + FAILURE_BACKOFF_MS });
      }
      this.onError(key, error);
    });
  }

  private load<T>(key: string, options: CacheOptions<T>, loader: () => Promise<T>): Promise<T> {
    const pending = this.inflight.get(key);
    if (pending) return pending as Promise<T>;

    const load = loader()
      .then((value) => {
        const ttlMs = typeof options.ttlMs === "function" ? options.ttlMs(value) : options.ttlMs;
        this.set(key, { value, storedAt: this.now(), ttlMs, retryAt: 0 });
        return value;
      })
      .finally(() => this.inflight.delete(key));

    this.inflight.set(key, load);
    return load;
  }

  private set(key: string, entry: Entry): void {
    this.entries.delete(key);
    this.entries.set(key, entry);
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
  }
}
