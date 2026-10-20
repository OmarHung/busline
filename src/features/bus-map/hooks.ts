"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import useSWR from "swr";
import type { LngLat, NearbyStation, Place, RouteDetail, RouteIndex, RouteLive, TripPlan } from "@/lib/types";
import type { RouteDetails } from "./ui/plan/trip";

/** 即時資料更新間隔，配合伺服器端 30 秒快取（TDX 免費額度每分鐘 5 次） */
const LIVE_REFRESH_MS = 30_000;

async function fetchJson<T>(url: string, notFoundMessage?: string): Promise<T> {
  const res = await fetch(url);
  if (res.status === 404 && notFoundMessage) throw new Error(notFoundMessage);
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

/** 路線詳情（線型＋站序）是 pnpm data:stops 預先產生的靜態檔，開路線不用呼叫 TDX；清單外的路線沒有檔案 */
const routeDetailUrl = (uid: string) => `/data/routes/${uid}.json`;
const fetchRouteDetail = (url: string) => fetchJson<RouteDetail>(url, "找不到這條路線");

export function useRouteDetail(uid: string | null) {
  return useSWR<RouteDetail, Error>(uid ? routeDetailUrl(uid) : null, fetchRouteDetail, STATIC_OPTIONS);
}

async function fetchRouteDetails([, ...uids]: string[]): Promise<RouteDetails> {
  const entries = await Promise.all(
    uids.map(async (uid) => [uid, await fetchRouteDetail(routeDetailUrl(uid)).catch(() => null)] as const),
  );
  return Object.fromEntries(entries);
}

/**
 * 路線規劃各段選取路線的詳情（一樣是靜態檔）；抓不到的為 null，地圖改用站牌連線。
 * 換路線時先保留舊資料，沒換的段不會閃一下。
 */
export function useRouteDetails(uids: readonly string[]) {
  const key = uids.length > 0 ? ["route-details", ...[...new Set(uids)].sort()] : null;
  return useSWR<RouteDetails, Error>(key, fetchRouteDetails, { ...STATIC_OPTIONS, keepPreviousData: true });
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

/** 附近的站與可搭的路線；位置只取到小數 4 位（約 10 公尺），讓快取比較容易命中 */
export function useNearbyStations(position: LngLat | null) {
  const key = position ? `/api/nearby?at=${coord(position, 4)}` : null;
  return useSWR<{ stations: NearbyStation[] }, Error>(key, fetchJson, { ...STATIC_OPTIONS, keepPreviousData: true });
}

/** 起點、經過點…、終點之間各段的直達方案 */
export function useTripPlan(points: readonly LngLat[] | null) {
  const key = points && points.length >= 2 ? `/api/plan?points=${points.map((p) => coord(p)).join(";")}` : null;
  return useSWR<TripPlan, Error>(key, fetchJson, STATIC_OPTIONS);
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
