/**
 * 預先產生的全台站序（路線規劃用），由 scripts/build-stop-data.mts 產生。
 * 為了控制檔案大小，用陣列而不是物件。
 */
export interface StopIndex {
  generatedAt: string;
  /** [站名, 經度, 緯度] */
  stops: Array<[name: string, lng: number, lat: number]>;
  /** [RouteUID, 方向, 依序經過的 stops 索引] */
  patterns: Array<[routeUid: string, direction: number, stops: number[]]>;
}
