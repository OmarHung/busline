"use client";

import { useSyncExternalStore } from "react";
import { favoriteKey, mergeFavorites, toggleFavorite, type Favorite } from "./favorites";
import { createFavoriteStore, type FavoriteStore } from "./store";

const NO_FAVORITES: readonly Favorite[] = [];

let store: FavoriteStore | null = null;

/** 第一次用到才建立；存取 localStorage 本身也可能丟錯（瀏覽器封鎖網站資料時） */
function getStore(): FavoriteStore {
  if (!store) {
    let storage: Storage | null = null;
    try {
      storage = window.localStorage;
    } catch {
      storage = null;
    }
    store = createFavoriteStore(storage, window);
  }
  return store;
}

const subscribe = (onChange: () => void) => getStore().subscribe(onChange);
const update = (next: (prev: readonly Favorite[]) => Favorite[]) => getStore().set(next(getStore().get()));

/** 收藏的路線與站牌；伺服器端渲染時沒有收藏，載入後才顯示 */
export function useFavorites() {
  const list = useSyncExternalStore(
    subscribe,
    () => getStore().get(),
    () => NO_FAVORITES,
  );
  return {
    list,
    has: (favorite: Favorite) => list.some((f) => favoriteKey(f) === favoriteKey(favorite)),
    toggle: (favorite: Favorite) => update((prev) => toggleFavorite(prev, favorite)),
    remove: (key: string) => update((prev) => prev.filter((f) => favoriteKey(f) !== key)),
    importMany: (incoming: readonly Favorite[]) => update((prev) => mergeFavorites(prev, incoming)),
  };
}
