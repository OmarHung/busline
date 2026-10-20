"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import {
  AttributionControl,
  GeolocateControl,
  Map as MapLibreMap,
  NavigationControl,
  Popup,
  setWorkerUrl,
  type MapGeoJSONFeature,
} from "maplibre-gl";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { LiveBus, LngLat, RouteDetail } from "@/lib/types";
import {
  boundsOf,
  busesFeatures,
  nearbyBounds,
  nearbyFeatures,
  planBounds,
  planLineFeatures,
  planPointFeatures,
  routeLineFeatures,
  stopFeatures,
  type NearbyOverlay,
  type PlanOverlay,
} from "./geojson";
import {
  installRouteLayers,
  MAP_STYLE_URLS,
  NEARBY_STOP_LAYER,
  PLAN_POINT_LAYER,
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
/** 附近站牌都在步行範圍內，可以放得比路線大 */
const NEARBY_MAX_ZOOM = 16.5;
/** 資訊卡離標記中心的距離（標記半徑 11px） */
const POPUP_OFFSET = 16;

export type Insets = { top: number; bottom: number; left: number; right: number };

/** 地圖目前的中心（扣掉面板遮住的範圍）與縮放等級 */
export type Viewport = { center: LngLat; zoom: number };

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
  /** hover（手機為點一下）規劃地點時資訊卡的內容；order 是 plan.points 的位置 */
  renderPlanPoint?: (order: number) => ReactNode;
  /** 附近站牌模式要畫的目前位置與各站站牌 */
  nearby: NearbyOverlay | null;
  selectedNearbyId: string | null;
  onNearbyStationClick: (id: string) => void;
  /** 每次地圖停止移動時回報；isUserMove 表示是使用者拖曳或縮放的，不是程式自動縮放 */
  onViewChange: (viewport: Viewport, isUserMove: boolean) => void;
  scheme: ColorScheme;
};

/** 標記的位置可能因規劃改變而換人，記下當時的地點組合，對不上就不顯示 */
type HoveredPoint = { order: number; pointsKey: string };

const pointsKeyOf = (plan: PlanOverlay | null) => plan?.points.map((p) => p.position.join(",")).join(";") ?? "";

const orderOf = (feature: MapGeoJSONFeature | undefined): number | null => {
  const order: unknown = feature?.properties?.order;
  return typeof order === "number" ? order : null;
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
  renderPlanPoint,
  nearby,
  selectedNearbyId,
  onNearbyStationClick,
  onViewChange,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const popupRef = useRef<Popup | null>(null);
  const schemeRef = useRef(scheme);
  const paddingRef = useRef(padding);
  const onStopClickRef = useRef(onStopClick);
  const onNearbyStationClickRef = useRef(onNearbyStationClick);
  const onViewChangeRef = useRef(onViewChange);
  const pointsKey = pointsKeyOf(plan);
  const pointsKeyRef = useRef(pointsKey);
  /** 每次底圖樣式載入完成就 +1，讓資料 effect 重新寫入圖層 */
  const [styleVersion, setStyleVersion] = useState(0);
  const [hoveredPoint, setHoveredPoint] = useState<HoveredPoint | null>(null);
  // 資訊卡的內容用 React 渲染進 MapLibre Popup 的 DOM（地點名稱來自外部資料，不拼 HTML 字串）
  const [popupNode] = useState(() => document.createElement("div"));

  useEffect(() => {
    paddingRef.current = padding;
    onStopClickRef.current = onStopClick;
    onNearbyStationClickRef.current = onNearbyStationClick;
    onViewChangeRef.current = onViewChange;
    pointsKeyRef.current = pointsKey;
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
    }
    map.on("click", NEARBY_STOP_LAYER, (e) => {
      const station = e.features?.[0]?.properties?.station;
      if (typeof station === "string") onNearbyStationClickRef.current(station);
    });
    for (const layer of [STOP_LAYER, TERMINAL_LAYER, NEARBY_STOP_LAYER]) {
      map.on("mouseenter", layer, () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", layer, () => {
        map.getCanvas().style.cursor = "";
      });
    }

    const showPoint = (order: number | null) =>
      setHoveredPoint(order === null ? null : { order, pointsKey: pointsKeyRef.current });
    map.on("mouseenter", PLAN_POINT_LAYER, (e) => {
      map.getCanvas().style.cursor = "pointer";
      showPoint(orderOf(e.features?.[0]));
    });
    map.on("mouseleave", PLAN_POINT_LAYER, () => {
      map.getCanvas().style.cursor = "";
      showPoint(null);
    });
    // 手機沒有 hover：點標記顯示，點地圖其他地方收起
    map.on("click", (e) => {
      const [feature] = map.getLayer(PLAN_POINT_LAYER)
        ? map.queryRenderedFeatures(e.point, { layers: [PLAN_POINT_LAYER] })
        : [];
      showPoint(orderOf(feature));
    });
    const reportView = (isUserMove: boolean) => {
      const { lng, lat } = map.getCenter();
      onViewChangeRef.current({ center: [lng, lat], zoom: map.getZoom() }, isUserMove);
    };
    // 使用者拖曳、縮放（含縮放按鈕）時事件才帶 originalEvent；fitBounds 等程式移動沒有
    map.on("moveend", (e) => reportView(e.originalEvent !== undefined));
    reportView(false);

    popupRef.current = new Popup({
      closeButton: false,
      closeOnClick: false,
      offset: POPUP_OFFSET,
      maxWidth: "none",
      className: "busline-popup",
    }).setDOMContent(popupNode);

    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      popupRef.current = null;
    };
  }, [popupNode]);

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

  useEffect(() => {
    const map = mapRef.current;
    if (!map || styleVersion === 0) return;
    setSourceData(map, SOURCE.nearby, nearbyFeatures(nearby, selectedNearbyId));
  }, [styleVersion, nearby, selectedNearbyId]);

  // 重新定位或附近的站改變時，縮放到目前位置與附近的站
  const nearbyBoundsKey = JSON.stringify(nearbyBounds(nearby));
  useEffect(() => {
    const map = mapRef.current;
    const bounds = JSON.parse(nearbyBoundsKey) as [LngLat, LngLat] | null;
    if (!map || !bounds) return;
    map.fitBounds(bounds, { maxZoom: NEARBY_MAX_ZOOM, duration: 900 });
  }, [nearbyBoundsKey]);

  // 在列表選了一站時，把地圖移到那一站最近的站牌
  const selectedNearbyPosition = nearby?.stations.find((s) => s.id === selectedNearbyId)?.positions[0];
  const selectedNearbyKey = selectedNearbyPosition?.join(",") ?? null;
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedNearbyKey) return;
    map.easeTo({
      center: selectedNearbyKey.split(",").map(Number) as LngLat,
      zoom: Math.max(map.getZoom(), STOP_FOCUS_ZOOM),
      duration: 600,
    });
  }, [selectedNearbyKey]);

  // 規劃的地點或選的方案改變、行程範圍跟著變時，縮放到整趟行程；
  // 只看範圍：按「查看下一班」之類不影響範圍的更新，不會把使用者移動過的視角拉回來
  const planBoundsKey = JSON.stringify(planBounds(plan));
  useEffect(() => {
    const map = mapRef.current;
    const bounds = JSON.parse(planBoundsKey) as [LngLat, LngLat] | null;
    if (!map || !bounds) return;
    map.fitBounds(bounds, { maxZoom: ROUTE_MAX_ZOOM, duration: 900 });
  }, [planBoundsKey]);

  const popupOrder = hoveredPoint?.pointsKey === pointsKey ? hoveredPoint.order : null;
  const popupPosition = popupOrder !== null ? plan?.points[popupOrder]?.position : undefined;
  useEffect(() => {
    const map = mapRef.current;
    const popup = popupRef.current;
    if (!map || !popup) return;
    if (popupPosition) popup.setLngLat(popupPosition).addTo(map);
    else popup.remove();
  }, [popupPosition]);

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
      {popupPosition && popupOrder !== null && renderPlanPoint && createPortal(renderPlanPoint(popupOrder), popupNode)}
    </div>
  );
}
