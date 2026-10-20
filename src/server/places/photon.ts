import { z } from "zod";
import type { LngLat, Place } from "@/lib/types";

// Photon：以 OpenStreetMap 為資料的地點搜尋，免費但屬公益服務，請求一律經過後端快取
const PHOTON_URL = "https://photon.komoot.io/api/";
const TAIWAN_BBOX = "119.3,21.8,122.1,26.5";
const USER_AGENT = "busline/0.1 (bus route map; server-side cached)";
const TIMEOUT_MS = 5_000;
const RESULT_LIMIT = 6;
/** 兩個結果相距小於這個距離（度，約 50 公尺）且同名，視為重複 */
const DUPLICATE_DEGREES = 0.0005;

const PhotonSchema = z.object({
  features: z.array(
    z.object({
      geometry: z.object({ coordinates: z.tuple([z.number(), z.number()]) }),
      properties: z.object({
        osm_type: z.string().optional(),
        osm_id: z.number().optional(),
        name: z.string().optional(),
        street: z.string().optional(),
        housenumber: z.string().optional(),
        district: z.string().optional(),
        city: z.string().optional(),
        county: z.string().optional(),
        state: z.string().optional(),
      }),
    }),
  ),
});

type PhotonFeature = z.infer<typeof PhotonSchema>["features"][number];

interface PhotonOptions {
  near?: LngLat;
  fetch?: typeof fetch;
}

function toPlace({ geometry, properties: p }: PhotonFeature): Place | null {
  const address = p.street && p.housenumber ? `${p.street}${p.housenumber}號` : undefined;
  const name = p.name ?? address;
  if (!name) return null;

  const area = [p.city ?? p.county ?? p.state, p.district, p.name ? p.street : undefined];
  return {
    id: `osm:${p.osm_type ?? ""}${p.osm_id ?? `${geometry.coordinates.join(",")}`}`,
    name,
    detail: [...new Set(area.filter(Boolean))].join(" "),
    position: geometry.coordinates,
    kind: "place",
  };
}

const isDuplicate = (a: Place, b: Place) =>
  a.name === b.name &&
  Math.abs(a.position[0] - b.position[0]) < DUPLICATE_DEGREES &&
  Math.abs(a.position[1] - b.position[1]) < DUPLICATE_DEGREES;

export async function searchPhoton(query: string, { near, fetch: fetchImpl = fetch }: PhotonOptions = {}) {
  const url = new URL(PHOTON_URL);
  url.searchParams.set("q", query);
  url.searchParams.set("limit", String(RESULT_LIMIT));
  url.searchParams.set("bbox", TAIWAN_BBOX);
  if (near) {
    url.searchParams.set("lon", String(near[0]));
    url.searchParams.set("lat", String(near[1]));
  }

  const res = await fetchImpl(url, {
    headers: { "user-agent": USER_AGENT, accept: "application/json" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Photon 查詢失敗（HTTP ${res.status}）`);

  const { features } = PhotonSchema.parse(await res.json());
  return features
    .map(toPlace)
    .filter((place): place is Place => place !== null)
    .filter((place, i, all) => all.findIndex((other) => isDuplicate(place, other)) === i);
}
