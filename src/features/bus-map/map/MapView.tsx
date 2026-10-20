"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { AttributionControl, GeolocateControl, Map as MapLibreMap, NavigationControl, setWorkerUrl } from "maplibre-gl";
import { useEffect, useRef, useState } from "react";
import type { LiveBus, RouteDetail } from "@/lib/types";
import {
  boundsOf,
  busesFeatures,
  planBounds,
  planLineFeatures,
  planPointFeatures,
  routeLineFeatures,
  stopFeatures,
  type PlanOverlay,
} from "./geojson";
import {
  installRouteLayers,
  MAP_STYLE_URLS,
  setSourceData,
  SOURCE,
  STOP_LAYER,
  TERMINAL_LAYER,
  type ColorScheme,
} from "./layers";

// 由 scripts/copy-maplibre-worker.mjs 在安裝時複製到 public/
setWorkerUrl("/vendor/maplibre-gl-worker.mjs");

/** 地圖控制項的中文文字（螢幕報讀也會用到） */
const MAP_LOCALE = {
  "AttributionControl.ToggleAttribution": "顯示資料來源",
  "GeolocateControl.FindMyLocation": "定位目前位置",
  "GeolocateControl.LocationNotAvailable": "無法取得目前位置",
  "Map.Title": "地圖",
  "NavigationControl.ResetBearing": "重設方向",
  "NavigationControl.ZoomIn": "放大地圖",
  "NavigationControl.ZoomOut": "縮小地圖",
};

/** 臺灣本島＋澎湖，金馬另計 */
const TAIWAN_BOUNDS: [[number, number], [number, number]] = [
  [119.3, 21.85],
  [122.05, 25.35],
];
const ROUTE_MAX_ZOOM = 15.5;
const STOP_FOCUS_ZOOM = 15.5;

export type Insets = { top: number; bottom: number; left: number; right: number };

type Props = {
  detail: RouteDetail | null;
  direction: number;
  buses: readonly LiveBus[];
  selectedStopUid: string | null;
  onStopClick: (uid: string) => void;
  /** 地圖被面板遮住的範圍，縮放到路線時避開 */
  padding: Insets;
  /** 路線規劃模式要畫的起終點、步行與乘車段 */
  plan: PlanOverlay | null;
  scheme: ColorScheme;
};

export default function MapView({
  detail,
  direction,
  buses,
  selectedStopUid,
  onStopClick,
  padding,
  scheme,
  plan,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const schemeRef = useRef(scheme);
  const paddingRef = useRef(padding);
  const onStopClickRef = useRef(onStopClick);
  /** 每次底圖樣式載入完成就 +1，讓資料 effect 重新寫入圖層 */
  const [styleVersion, setStyleVersion] = useState(0);

  useEffect(() => {
    paddingRef.current = padding;
    onStopClickRef.current = onStopClick;
  });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const map = new MapLibreMap({
      container,
      style: MAP_STYLE_URLS[schemeRef.current],
      attributionControl: false,
      locale: MAP_LOCALE,
      localIdeographFontFamily: '"PingFang TC", "Noto Sans TC", "Microsoft JhengHei", sans-serif',
    });
    // padding 設在地圖本身，之後的 fitBounds / easeTo 都會自動避開面板（不要再各自傳 padding，會重複計算）
    map.setPadding(paddingRef.current);
    map.fitBounds(TAIWAN_BOUNDS, { duration: 0 });
    map.addControl(
      new AttributionControl({ compact: true, customAttribution: "公車資料：交通部 TDX" }),
      "bottom-right",
    );
    map.addControl(new NavigationControl({ showCompass: false }), "top-right");
    map.addControl(new GeolocateControl({ positionOptions: { enableHighAccuracy: true } }), "top-right");

    map.on("style.load", () => {
      installRouteLayers(map, schemeRef.current);
      setStyleVersion((v) => v + 1);
    });
    for (const layer of [STOP_LAYER, TERMINAL_LAYER]) {
      map.on("click", layer, (e) => {
        const uid = e.features?.[0]?.properties?.uid;
        if (typeof uid === "string") onStopClickRef.current(uid);
      });
      map.on("mouseenter", layer, () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", layer, () => {
        map.getCanvas().style.cursor = "";
      });
    }

    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  const { top, bottom, left, right } = padding;
  useEffect(() => {
    mapRef.current?.setPadding({ top, bottom, left, right });
  }, [top, bottom, left, right]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || schemeRef.current === scheme) return;
    schemeRef.current = scheme;
    map.setStyle(MAP_STYLE_URLS[scheme]);
  }, [scheme]);

  const activeDirection = detail?.directions.find((d) => d.direction === direction) ?? null;

  useEffect(() => {
    const map = mapRef.current;
    if (!map || styleVersion === 0) return;
    setSourceData(map, SOURCE.route, routeLineFeatures(detail, direction));
  }, [styleVersion, detail, direction]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || styleVersion === 0) return;
    setSourceData(map, SOURCE.stops, stopFeatures(activeDirection, selectedStopUid));
  }, [styleVersion, activeDirection, selectedStopUid]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || styleVersion === 0) return;
    setSourceData(map, SOURCE.buses, busesFeatures(buses, direction));
  }, [styleVersion, buses, direction]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || styleVersion === 0) return;
    setSourceData(map, SOURCE.planLines, planLineFeatures(plan));
    setSourceData(map, SOURCE.planPoints, planPointFeatures(plan));
  }, [styleVersion, plan]);

  // 規劃的起終點或選的方案改變時，縮放到整趟行程
  useEffect(() => {
    const map = mapRef.current;
    const bounds = planBounds(plan);
    if (!map || !bounds) return;
    map.fitBounds(bounds, { maxZoom: ROUTE_MAX_ZOOM, duration: 900 });
  }, [plan]);

  // 換路線或換方向時，縮放到整條路線
  useEffect(() => {
    const map = mapRef.current;
    const bounds = activeDirection ? boundsOf(activeDirection) : null;
    if (!map || !bounds) return;
    map.fitBounds(bounds, { maxZoom: ROUTE_MAX_ZOOM, duration: 900 });
  }, [activeDirection]);

  useEffect(() => {
    const map = mapRef.current;
    const stop = activeDirection?.stops.find((s) => s.uid === selectedStopUid);
    if (!map || !stop) return;
    map.easeTo({
      center: stop.position,
      zoom: Math.max(map.getZoom(), STOP_FOCUS_ZOOM),
      duration: 600,
    });
  }, [activeDirection, selectedStopUid]);

  // MapLibre 會替容器加上 position: relative，所以定位交給外層
  return (
    <div className="absolute inset-0">
      <div ref={containerRef} className="h-full w-full" role="region" aria-label="公車路線地圖" />
    </div>
  );
}
