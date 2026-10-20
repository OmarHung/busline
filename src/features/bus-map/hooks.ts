"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import useSWR from "swr";
import type { LngLat, Place, PlanResult, RouteDetail, RouteIndex, RouteLive } from "@/lib/types";

/** 即時資料更新間隔，配合伺服器端 30 秒快取（TDX 免費額度每分鐘 5 次） */
const LIVE_REFRESH_MS = 30_000;

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const message = (body as { error?: unknown } | null)?.error;
    throw new Error(typeof message === "string" ? message : `載入失敗（HTTP ${res.status}）`);
  }
  return body as T;
}

const STATIC_OPTIONS = { revalidateOnFocus: false, revalidateIfStale: false, errorRetryCount: 2 } as const;

export function useRouteIndex() {
  return useSWR<RouteIndex, Error>("/api/routes", fetchJson, STATIC_OPTIONS);
}

export function useRouteDetail(uid: string | null) {
  return useSWR<RouteDetail, Error>(uid ? `/api/routes/${uid}` : null, fetchJson, STATIC_OPTIONS);
}

/**
 * 背景分頁不更新（SWR 預設），回到前景會立即重抓。
 * SWR 在有錯誤時會跳過定時更新，所以失敗後要自己持續重試，否則短暫故障後就再也不會更新。
 */
export function useRouteLive(uid: string | null) {
  return useSWR<RouteLive, Error>(uid ? `/api/routes/${uid}/live` : null, fetchJson, {
    refreshInterval: LIVE_REFRESH_MS,
    onErrorRetry: (_error, _key, _config, revalidate, { retryCount }) => {
      setTimeout(() => void revalidate({ retryCount }), LIVE_REFRESH_MS);
    },
  });
}

/** 座標轉成 API 參數；小數 5 位約 1 公尺 */
const coord = ([lng, lat]: LngLat, digits = 5) => `${lng.toFixed(digits)},${lat.toFixed(digits)}`;

/** 地點搜尋；near 只取到小數 3 位（約 100 公尺），讓快取比較容易命中 */
export function usePlaces(query: string, near: LngLat | null) {
  const q = query.trim();
  const key = q ? `/api/places?q=${encodeURIComponent(q)}${near ? `&near=${coord(near, 3)}` : ""}` : null;
  return useSWR<{ places: Place[] }, Error>(key, fetchJson, { ...STATIC_OPTIONS, keepPreviousData: true });
}

export function usePlan(from: LngLat | null, to: LngLat | null) {
  const key = from && to ? `/api/plan?from=${coord(from)}&to=${coord(to)}` : null;
  return useSWR<PlanResult, Error>(key, fetchJson, STATIC_OPTIONS);
}

export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}

export type LocateStatus = "idle" | "locating" | "ready" | "denied" | "unavailable";

const LOCATE_TIMEOUT_MS = 10_000;
/** 一分鐘內定位過的結果可以直接用 */
const LOCATE_MAX_AGE_MS = 60_000;

/** 瀏覽器定位；只有呼叫 locate() 才會詢問使用者權限 */
export function useCurrentPosition() {
  const [state, setState] = useState<{ status: LocateStatus; position: LngLat | null }>({
    status: "idle",
    position: null,
  });

  const locate = useCallback((): Promise<LngLat | null> => {
    if (!("geolocation" in navigator)) {
      setState({ status: "unavailable", position: null });
      return Promise.resolve(null);
    }
    setState((prev) => ({ ...prev, status: "locating" }));
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        ({ coords }) => {
          const position: LngLat = [coords.longitude, coords.latitude];
          setState({ status: "ready", position });
          resolve(position);
        },
        (error) => {
          setState({ status: error.code === error.PERMISSION_DENIED ? "denied" : "unavailable", position: null });
          resolve(null);
        },
        { enableHighAccuracy: true, timeout: LOCATE_TIMEOUT_MS, maximumAge: LOCATE_MAX_AGE_MS },
      );
    });
  }, []);

  return { ...state, locate };
}

export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}

const subscribeResize = (onChange: () => void) => {
  window.addEventListener("resize", onChange);
  return () => window.removeEventListener("resize", onChange);
};

export function useWindowHeight(): number {
  return useSyncExternalStore(
    subscribeResize,
    () => window.innerHeight,
    () => 0,
  );
}

/** 每隔 intervalMs 重新渲染，用來顯示「幾秒前更新」 */
export function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
