import { parseStored, serializeStored, type Favorite } from "./favorites";

export const FAVORITES_STORAGE_KEY = "busline:favorites";

type StorageLike = Pick<Storage, "getItem" | "setItem">;

export interface FavoriteStore {
  get(): readonly Favorite[];
  set(list: readonly Favorite[]): void;
  subscribe(onChange: () => void): () => void;
}

/**
 * 收藏存在 localStorage；無痕模式或空間滿而讀寫失敗時，退回只存在記憶體（這次瀏覽仍可用）。
 * 傳入 window 時，其他分頁改了收藏也會同步過來。
 */
export function createFavoriteStore(storage: StorageLike | null, target: EventTarget | null): FavoriteStore {
  const read = (): readonly Favorite[] => {
    try {
      return parseStored(storage?.getItem(FAVORITES_STORAGE_KEY) ?? null);
    } catch {
      return [];
    }
  };
  let current = read();
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((listener) => listener());

  target?.addEventListener("storage", (event) => {
    if ((event as StorageEvent).key !== FAVORITES_STORAGE_KEY) return;
    current = read();
    notify();
  });

  return {
    get: () => current,
    set(list) {
      current = list;
      try {
        storage?.setItem(FAVORITES_STORAGE_KEY, serializeStored(list));
      } catch {
        // 存不進去（無痕模式、空間滿）就只留在記憶體
      }
      notify();
    },
    subscribe(onChange) {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
  };
}
