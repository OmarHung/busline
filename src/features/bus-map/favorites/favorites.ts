import { z } from "zod";
import type { LngLat, RouteSummary } from "@/lib/types";

/** 收藏太多列表就沒用了，也避免分享連結長到貼不上 */
export const MAX_FAVORITES = 50;
/** localStorage 裡的格式版本；改格式時加一，舊資料就會被略過 */
const STORAGE_VERSION = 1;
/** 分享連結的座標只留小數 5 位（約 1 公尺） */
const SHARE_COORD_DIGITS = 5;

/** 整條路線 */
export interface FavoriteRoute {
  kind: "route";
  route: RouteSummary;
}

/** 某條路線某個方向的某一站，例如「307 往 撫遠街・板橋車站」 */
export interface FavoriteStop {
  kind: "stop";
  route: RouteSummary;
  direction: number;
  headsign: string;
  /** 站牌 uid 不穩定（路線詳情重新產生後可能改變），用站名＋位置來找 */
  stop: { name: string; position: LngLat };
}

export type Favorite = FavoriteRoute | FavoriteStop;

/** 分享連結只放路線 uid，名稱、起訖站等匯入時再從路線清單補上 */
export type SharedFavorite =
  | { kind: "route"; uid: string }
  | { kind: "stop"; uid: string; direction: number; headsign: string; stopName: string; position: LngLat };

const lngLatSchema = z.tuple([z.number(), z.number()]);
const routeSchema = z.object({
  uid: z.string().min(1),
  name: z.string(),
  cityCode: z.string(),
  from: z.string(),
  to: z.string(),
});
const favoriteSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("route"), route: routeSchema }),
  z.object({
    kind: z.literal("stop"),
    route: routeSchema,
    direction: z.number().int(),
    headsign: z.string(),
    stop: z.object({ name: z.string().min(1), position: lngLatSchema }),
  }),
]);
const storedSchema = z.object({ v: z.literal(STORAGE_VERSION), items: z.array(z.unknown()) });
const sharedSchema = z
  .array(
    z.union([
      z.tuple([z.literal("r"), z.string().min(1)]),
      z.tuple([
        z.literal("s"),
        z.string().min(1),
        z.number().int(),
        z.string(),
        z.string().min(1),
        z.number(),
        z.number(),
      ]),
    ]),
  )
  .min(1)
  .max(MAX_FAVORITES);

export function favoriteKey(favorite: Favorite): string {
  return favorite.kind === "route"
    ? `route:${favorite.route.uid}`
    : `stop:${favorite.route.uid}:${favorite.direction}:${favorite.stop.name}`;
}

/** 沒收藏的加到最前面，已收藏的移除 */
export function toggleFavorite(list: readonly Favorite[], favorite: Favorite): Favorite[] {
  const key = favoriteKey(favorite);
  if (list.some((f) => favoriteKey(f) === key)) return list.filter((f) => favoriteKey(f) !== key);
  return [favorite, ...list].slice(0, MAX_FAVORITES);
}

/** 匯入的收藏接在原本的後面，已經有的略過 */
export function mergeFavorites(existing: readonly Favorite[], incoming: readonly Favorite[]): Favorite[] {
  const keys = new Set(existing.map(favoriteKey));
  const added: Favorite[] = [];
  for (const favorite of incoming) {
    const key = favoriteKey(favorite);
    if (keys.has(key)) continue;
    keys.add(key);
    added.push(favorite);
  }
  return [...existing, ...added].slice(0, MAX_FAVORITES);
}

export function serializeStored(list: readonly Favorite[]): string {
  return JSON.stringify({ v: STORAGE_VERSION, items: list });
}

/** localStorage 的內容可能被改壞或是舊格式：整份不對就當作沒有，個別壞掉的項目略過 */
export function parseStored(text: string | null): Favorite[] {
  if (!text) return [];
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return [];
  }
  const stored = storedSchema.safeParse(raw);
  if (!stored.success) return [];
  return stored.data.items.flatMap((item) => {
    const parsed = favoriteSchema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
}

function toBase64Url(text: string): string {
  let binary = "";
  for (const byte of new TextEncoder().encode(text)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(encoded: string): string {
  const binary = atob(encoded.replace(/-/g, "+").replace(/_/g, "/"));
  return new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
}

const roundCoord = (value: number) => Number(value.toFixed(SHARE_COORD_DIGITS));

/** 收藏編成網址可以放的字串（JSON → base64url） */
export function encodeShared(list: readonly Favorite[]): string {
  const tuples = list.map((f) =>
    f.kind === "route"
      ? ["r", f.route.uid]
      : [
          "s",
          f.route.uid,
          f.direction,
          f.headsign,
          f.stop.name,
          roundCoord(f.stop.position[0]),
          roundCoord(f.stop.position[1]),
        ],
  );
  return toBase64Url(JSON.stringify(tuples));
}

/** 解開分享連結；格式不對回傳 null */
export function decodeShared(encoded: string): SharedFavorite[] | null {
  if (!encoded) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(fromBase64Url(encoded));
  } catch {
    return null;
  }
  const parsed = sharedSchema.safeParse(raw);
  if (!parsed.success) return null;
  return parsed.data.map((t) =>
    t[0] === "r"
      ? { kind: "route", uid: t[1] }
      : { kind: "stop", uid: t[1], direction: t[2], headsign: t[3], stopName: t[4], position: [t[5], t[6]] },
  );
}

/** 分享的收藏補上路線資料；路線清單裡已經沒有的（停駛、改號）略過 */
export function resolveShared(
  shared: readonly SharedFavorite[],
  routesByUid: ReadonlyMap<string, RouteSummary>,
): Favorite[] {
  return shared.flatMap((s): Favorite[] => {
    const route = routesByUid.get(s.uid);
    if (!route) return [];
    if (s.kind === "route") return [{ kind: "route", route }];
    const { direction, headsign, stopName, position } = s;
    return [{ kind: "stop", route, direction, headsign, stop: { name: stopName, position } }];
  });
}
