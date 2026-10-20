import { CITIES, type City } from "@/lib/cities";
import { TdxError } from "./client";

/** TDX 免費額度每分鐘 5 次，被限流時等一下再試 */
const RATE_LIMIT_WAIT_MS = 15_000;
const ERROR_WAIT_MS = 5_000;
/** 限流最多等約 3 分鐘；其他錯誤重試 3 次 */
const MAX_RATE_LIMITED_ATTEMPTS = 12;
const MAX_FAILED_ATTEMPTS = 3;

export interface CityProgress {
  city: string;
  done: number;
  total: number;
  /** 這個縣市抓到幾筆，給進度訊息用 */
  count: number;
}

export interface FetchAllCitiesOptions {
  sleep?: (ms: number) => Promise<void>;
  onProgress?: (progress: CityProgress) => void;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function withRetries<T>(city: City, load: () => Promise<T>, sleep: (ms: number) => Promise<void>) {
  let rateLimited = 0;
  let failed = 0;
  for (;;) {
    try {
      return await load();
    } catch (error) {
      const isRateLimited = error instanceof TdxError && error.status === 429;
      if (isRateLimited ? ++rateLimited >= MAX_RATE_LIMITED_ATTEMPTS : ++failed >= MAX_FAILED_ATTEMPTS) {
        throw new Error(`無法取得${city.name}的資料`, { cause: error });
      }
      await sleep(isRateLimited ? RATE_LIMIT_WAIT_MS : ERROR_WAIT_MS);
    }
  }
}

/**
 * 依序（不平行）抓全台每個縣市與公路客運的資料，被限流就等待重試。
 * 給 scripts/ 的資料產生腳本用；網站執行時不要呼叫。
 */
export async function fetchAllCities<T>(
  load: (city: City) => Promise<T[]>,
  { sleep = defaultSleep, onProgress }: FetchAllCitiesOptions = {},
): Promise<Array<{ city: City; items: T[] }>> {
  const results: Array<{ city: City; items: T[] }> = [];
  for (const [i, city] of CITIES.entries()) {
    const items = await withRetries(city, () => load(city), sleep);
    results.push({ city, items });
    onProgress?.({ city: city.name, done: i + 1, total: CITIES.length, count: items.length });
  }
  return results;
}
