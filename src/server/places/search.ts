import { distanceMeters } from "@/lib/geo/nearest";
import { normalizeText } from "@/lib/text";
import type { LngLat, Place } from "@/lib/types";
import type { TtlCache } from "../cache";
import type { StopNetwork } from "../planner/network";
import { searchPhoton } from "./photon";
import { searchStopPlaces } from "./stop-places";

const STOP_LIMIT = 4;
const TOTAL_LIMIT = 8;
/** 至少兩個字才查 Photon，單字結果沒意義又浪費公益服務 */
const PHOTON_MIN_LENGTH = 2;
const PHOTON_CACHE = { ttlMs: 24 * 60 * 60_000, maxStaleMs: 7 * 24 * 60 * 60_000 };
/** OSM 地點和公車站同名且在這距離內，只留公車站 */
const SAME_PLACE_METERS = 300;

interface Deps {
  network: StopNetwork;
  cache: TtlCache;
  photon?: (query: string, options: { near?: LngLat }) => Promise<Place[]>;
  onError?: (error: unknown) => void;
}

/** 快取 key 只看大約位置（小數兩位，約 1 公里），附近的使用者可以共用 */
const areaKey = (near: LngLat | undefined) => (near ? near.map((v) => v.toFixed(2)).join(",") : "-");

export function createPlaceSearch({ network, cache, photon = searchPhoton, onError = () => {} }: Deps) {
  const searchOsm = async (query: string, near: LngLat | undefined): Promise<Place[]> => {
    if (query.length < PHOTON_MIN_LENGTH) return [];
    try {
      return await cache.getOrLoad(`photon:${query}:${areaKey(near)}`, PHOTON_CACHE, () => photon(query, { near }));
    } catch (error) {
      onError(error);
      return [];
    }
  };

  return async function search(rawQuery: string, near?: LngLat): Promise<Place[]> {
    const query = normalizeText(rawQuery);
    if (!query) return [];

    const stops = searchStopPlaces(network, query, { near, limit: STOP_LIMIT });
    const places = await searchOsm(query, near);
    const isStop = (place: Place) =>
      stops.some(
        (stop) =>
          normalizeText(stop.name) === normalizeText(place.name) &&
          distanceMeters(stop.position, place.position) <= SAME_PLACE_METERS,
      );

    return [...stops, ...places.filter((place) => !isStop(place))].slice(0, TOTAL_LIMIT);
  };
}
