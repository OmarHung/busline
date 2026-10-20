import type {
  ExpressionSpecification,
  GeoJSONSource,
  GeoJSONSourceSpecification,
  Map as MapLibreMap,
} from "maplibre-gl";

export type ColorScheme = "light" | "dark";

export const MAP_STYLE_URLS: Record<ColorScheme, string> = {
  light: "https://tiles.openfreemap.org/styles/positron",
  dark: "https://tiles.openfreemap.org/styles/dark",
};

interface MapPalette {
  route: string;
  routeCasing: string;
  routeOther: string;
  stopFill: string;
  label: string;
  labelHalo: string;
  bus: string;
}

const PALETTES: Record<ColorScheme, MapPalette> = {
  light: {
    route: "#1f5eff",
    routeCasing: "#ffffff",
    routeOther: "#7b8597",
    stopFill: "#ffffff",
    label: "#1c2433",
    labelHalo: "#ffffff",
    bus: "#0b1a3a",
  },
  dark: {
    route: "#5b8cff",
    routeCasing: "#0c1220",
    routeOther: "#8b95a8",
    stopFill: "#0c1220",
    label: "#e8ecf4",
    labelHalo: "#0c1220",
    bus: "#f3f6ff",
  },
};

export const SOURCE = {
  route: "busline-route",
  stops: "busline-stops",
  buses: "busline-buses",
  planLines: "busline-plan-lines",
  planPoints: "busline-plan-points",
  nearby: "busline-nearby",
} as const;

export const STOP_LAYER = "busline-stops";
/** 深淺色各用一個圖示 id：切換樣式時 MapLibre 會沿用舊圖示，同一個 id 換不了顏色 */
const busImageId = (scheme: ColorScheme) => `busline-bus-${scheme}`;

const EMPTY = { type: "FeatureCollection", features: [] } as const;

const isActive: ExpressionSpecification = ["==", ["get", "active"], true];
const isSelected: ExpressionSpecification = ["==", ["get", "selected"], true];

/** 依縮放等級線性內插 */
const byZoom = (...stops: Array<number | ExpressionSpecification>): ExpressionSpecification =>
  ["interpolate", ["linear"], ["zoom"], ...stops] as ExpressionSpecification;

/** OpenFreeMap 預設顯示「拉丁＋原文」，改成只顯示中文名稱 */
function localizeLabels(map: MapLibreMap): void {
  const zhName: ExpressionSpecification = ["coalesce", ["get", "name:zh-Hant"], ["get", "name"]];
  for (const layer of map.getStyle().layers) {
    if (layer.type !== "symbol") continue;
    const textField = map.getLayoutProperty(layer.id, "text-field");
    if (textField && JSON.stringify(textField).includes('"name')) {
      map.setLayoutProperty(layer.id, "text-field", zhName);
    }
  }
}

/** 深淺色各用一個箭頭 id（路線顏色不同） */
const arrowImageId = (scheme: ColorScheme) => `busline-arrow-${scheme}`;

/**
 * 沿線的方向箭頭（朝右，symbol-placement: line 會順著線的方向旋轉）。
 * 路線色加白邊：箭頭比線寬，超出的部分落在底圖上也看得到。
 */
function drawArrowImage(color: string): ImageData {
  const size = 32;
  const ctx = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas 2D 不可用");
  ctx.canvas.width = size;
  ctx.canvas.height = size;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const chevron = () => {
    ctx.beginPath();
    ctx.moveTo(11, 8);
    ctx.lineTo(20, 16);
    ctx.lineTo(11, 24);
  };
  chevron();
  ctx.lineWidth = 9;
  ctx.strokeStyle = "#ffffff";
  ctx.stroke();
  chevron();
  ctx.lineWidth = 4.5;
  ctx.strokeStyle = color;
  ctx.stroke();
  return ctx.getImageData(0, 0, size, size);
}

const arrowLayout = (scheme: ColorScheme) =>
  ({
    "symbol-placement": "line",
    "symbol-spacing": 110,
    "icon-image": arrowImageId(scheme),
    "icon-size": byZoom(11, 1, 16, 1.35),
    "icon-allow-overlap": true,
    "icon-ignore-placement": true,
    "icon-rotation-alignment": "map",
  }) as const;

/** 公車圖示：實心圓＋白色箭頭，旋轉角度表示行進方向 */
function drawBusImage(color: string): ImageData {
  const size = 56;
  const ctx = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas 2D 不可用");
  ctx.canvas.width = size;
  ctx.canvas.height = size;

  const c = size / 2;
  ctx.shadowColor = "rgba(0,0,0,0.35)";
  ctx.shadowBlur = 6;
  ctx.shadowOffsetY = 2;
  ctx.beginPath();
  ctx.arc(c, c, 20, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();

  ctx.shadowColor = "transparent";
  ctx.lineWidth = 4;
  ctx.strokeStyle = "#ffffff";
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(c, c - 11);
  ctx.lineTo(c + 9, c + 8);
  ctx.lineTo(c, c + 3);
  ctx.lineTo(c - 9, c + 8);
  ctx.closePath();
  ctx.fillStyle = color === "#f3f6ff" ? "#0c1220" : "#ffffff";
  ctx.fill();

  return ctx.getImageData(0, 0, size, size);
}

/** 起點綠、終點紅，跟路線藍色區分 */
const ENDPOINT_COLORS = { origin: "#12a150", destination: "#e0352b" };
/** 路線規劃的經過點（與 globals.css 的 --waypoint 一致） */
const WAYPOINT_COLOR = "#475569";

/** OpenFreeMap 只提供 Noto Sans；不指定會去抓不存在的 Open Sans（404） */
const TEXT_FONT = ["Noto Sans Regular"];

const ofKind = (kind: string): ExpressionSpecification => ["==", ["get", "kind"], kind];

export const TERMINAL_LAYER = "busline-terminals";
/** 路線規劃的起點、經過點、終點標記（hover 顯示資訊卡） */
export const PLAN_POINT_LAYER = "busline-plan-endpoints";

const isTerminal: ExpressionSpecification = ["!=", ["get", "terminal"], ""];

/** 起站（綠「起」）與迄站（紅「迄」），任何縮放等級都顯示站名，一眼看出路線往哪走 */
function installTerminalLayers(map: MapLibreMap, palette: MapPalette): void {
  map.addLayer({
    id: TERMINAL_LAYER,
    type: "circle",
    source: SOURCE.stops,
    filter: isTerminal,
    paint: {
      "circle-radius": 11,
      "circle-color": [
        "case",
        ["==", ["get", "terminal"], "start"],
        ENDPOINT_COLORS.origin,
        ENDPOINT_COLORS.destination,
      ],
      "circle-stroke-color": "#ffffff",
      "circle-stroke-width": 2.5,
    },
  });
  map.addLayer({
    id: "busline-terminal-labels",
    type: "symbol",
    source: SOURCE.stops,
    filter: isTerminal,
    layout: { "text-field": ["get", "label"], "text-font": TEXT_FONT, "text-size": 12, "text-allow-overlap": true },
    paint: { "text-color": "#ffffff" },
  });
  map.addLayer({
    id: "busline-terminal-names",
    type: "symbol",
    source: SOURCE.stops,
    filter: ["all", isTerminal, ["!", isSelected]],
    layout: {
      "text-field": ["get", "name"],
      "text-font": TEXT_FONT,
      "text-size": 13,
      "text-anchor": "left",
      "text-offset": [1.3, 0],
      // 起訖站名一定要顯示，不讓其他標籤擠掉
      "text-allow-overlap": true,
    },
    paint: { "text-color": palette.label, "text-halo-color": palette.labelHalo, "text-halo-width": 2 },
  });
}

/** 路線規劃：步行虛線、實際坐到的那段公車、上下車站、起終點與經過點 */
function installPlanLayers(map: MapLibreMap, palette: MapPalette, scheme: ColorScheme): void {
  const lineLayout = { "line-join": "round", "line-cap": "round" } as const;
  map.addLayer({
    id: "busline-plan-walk",
    type: "line",
    source: SOURCE.planLines,
    filter: ofKind("walk"),
    layout: lineLayout,
    paint: { "line-color": palette.label, "line-opacity": 0.7, "line-width": 3, "line-dasharray": [0.6, 1.8] },
  });
  map.addLayer({
    id: "busline-plan-ride-casing",
    type: "line",
    source: SOURCE.planLines,
    filter: ofKind("ride"),
    layout: lineLayout,
    paint: { "line-color": palette.routeCasing, "line-width": byZoom(10, 7, 16, 14) },
  });
  map.addLayer({
    id: "busline-plan-ride",
    type: "line",
    source: SOURCE.planLines,
    filter: ofKind("ride"),
    layout: lineLayout,
    paint: { "line-color": palette.route, "line-width": byZoom(10, 4, 16, 8) },
  });
  map.addLayer({
    id: "busline-plan-ride-arrows",
    type: "symbol",
    source: SOURCE.planLines,
    filter: ofKind("ride"),
    minzoom: 11,
    layout: arrowLayout(scheme),
  });
  map.addLayer({
    id: "busline-plan-stops",
    type: "circle",
    source: SOURCE.planPoints,
    filter: ofKind("stop"),
    paint: {
      "circle-radius": 6,
      "circle-color": palette.stopFill,
      "circle-stroke-color": palette.route,
      "circle-stroke-width": 3,
    },
  });
  map.addLayer({
    id: PLAN_POINT_LAYER,
    type: "circle",
    source: SOURCE.planPoints,
    filter: ["!", ofKind("stop")],
    paint: {
      "circle-radius": 11,
      "circle-color": [
        "case",
        ofKind("origin"),
        ENDPOINT_COLORS.origin,
        ofKind("via"),
        WAYPOINT_COLOR,
        ENDPOINT_COLORS.destination,
      ],
      "circle-stroke-color": "#ffffff",
      "circle-stroke-width": 2.5,
    },
  });
  map.addLayer({
    id: "busline-plan-endpoint-labels",
    type: "symbol",
    source: SOURCE.planPoints,
    filter: ["!", ofKind("stop")],
    layout: { "text-field": ["get", "label"], "text-font": TEXT_FONT, "text-size": 12, "text-allow-overlap": true },
    paint: { "text-color": "#ffffff" },
  });
}

/** 附近站牌：點一下會在列表上找到那一站 */
export const NEARBY_STOP_LAYER = "busline-nearby-stops";

/** 附近站牌：各站的站牌（選取的站填滿）、站名，以及目前位置或地圖中心 */
function installNearbyLayers(map: MapLibreMap, palette: MapPalette): void {
  const isStop = ofKind("stop");
  const isHere = ofKind("here");
  map.addLayer({
    id: NEARBY_STOP_LAYER,
    type: "circle",
    source: SOURCE.nearby,
    filter: isStop,
    paint: {
      "circle-radius": byZoom(13, ["case", isSelected, 7, 4.5], 17, ["case", isSelected, 10, 7]),
      "circle-color": ["case", isSelected, palette.route, palette.stopFill],
      "circle-stroke-color": ["case", isSelected, palette.routeCasing, palette.route],
      "circle-stroke-width": ["case", isSelected, 3, 2.5],
    },
  });
  map.addLayer({
    id: "busline-nearby-labels",
    type: "symbol",
    source: SOURCE.nearby,
    filter: isStop,
    minzoom: 15,
    layout: {
      "text-field": ["get", "name"],
      "text-font": TEXT_FONT,
      "text-size": ["case", isSelected, 14, 12],
      "text-offset": [0, 1.1],
      "text-anchor": "top",
      "text-optional": true,
      // 選取的站先放，標籤互相擠的時候優先顯示
      "symbol-sort-key": ["case", isSelected, 0, 1],
    },
    paint: { "text-color": palette.label, "text-halo-color": palette.labelHalo, "text-halo-width": 1.5 },
  });
  map.addLayer({
    id: "busline-nearby-here-halo",
    type: "circle",
    source: SOURCE.nearby,
    filter: isHere,
    paint: { "circle-radius": 20, "circle-color": palette.route, "circle-opacity": 0.16 },
  });
  map.addLayer({
    id: "busline-nearby-here",
    type: "circle",
    source: SOURCE.nearby,
    filter: isHere,
    paint: {
      "circle-radius": 8,
      "circle-color": palette.route,
      "circle-stroke-color": "#ffffff",
      "circle-stroke-width": 3,
    },
  });
  // 地圖中心用中性色的小標記，不和目前位置的藍點混淆
  map.addLayer({
    id: "busline-nearby-center",
    type: "circle",
    source: SOURCE.nearby,
    filter: ofKind("center"),
    paint: {
      "circle-radius": 7,
      "circle-color": palette.label,
      "circle-stroke-color": palette.labelHalo,
      "circle-stroke-width": 3,
    },
  });
}

/** 每次底圖樣式載入（含切換深淺色）後都要重新加上路線圖層 */
export function installRouteLayers(map: MapLibreMap, scheme: ColorScheme): void {
  const palette = PALETTES[scheme];
  localizeLabels(map);

  map.addSource(SOURCE.route, { type: "geojson", data: EMPTY });
  map.addSource(SOURCE.stops, { type: "geojson", data: EMPTY });
  map.addSource(SOURCE.buses, { type: "geojson", data: EMPTY });
  map.addSource(SOURCE.planLines, { type: "geojson", data: EMPTY });
  map.addSource(SOURCE.planPoints, { type: "geojson", data: EMPTY });
  map.addSource(SOURCE.nearby, { type: "geojson", data: EMPTY });

  // 路線畫在所有底圖圖層之上：深色底圖的文字外框很粗，放在文字下面線會被切斷
  const lineLayout = { "line-join": "round", "line-cap": "round" } as const;

  map.addLayer({
    id: "busline-route-other",
    type: "line",
    source: SOURCE.route,
    filter: ["!", isActive],
    layout: lineLayout,
    paint: {
      "line-color": palette.routeOther,
      "line-width": byZoom(10, 1.5, 16, 3.5),
      "line-opacity": 0.6,
      "line-dasharray": [2, 2],
    },
  });
  map.addLayer({
    id: "busline-route-casing",
    type: "line",
    source: SOURCE.route,
    filter: isActive,
    layout: lineLayout,
    paint: { "line-color": palette.routeCasing, "line-width": byZoom(10, 6, 16, 13) },
  });
  map.addLayer({
    id: "busline-route",
    type: "line",
    source: SOURCE.route,
    filter: isActive,
    layout: lineLayout,
    paint: { "line-color": palette.route, "line-width": byZoom(10, 3, 16, 7.5) },
  });
  const arrowImage = arrowImageId(scheme);
  if (!map.hasImage(arrowImage)) map.addImage(arrowImage, drawArrowImage(palette.route), { pixelRatio: 2 });
  map.addLayer({
    id: "busline-route-arrows",
    type: "symbol",
    source: SOURCE.route,
    filter: isActive,
    minzoom: 11,
    layout: arrowLayout(scheme),
  });

  map.addLayer({
    id: STOP_LAYER,
    type: "circle",
    source: SOURCE.stops,
    paint: {
      // zoom 內插必須在最外層，選取狀態放在各個輸出值裡
      "circle-radius": byZoom(10, ["case", isSelected, 6, 2.5], 16, ["case", isSelected, 9, 6]),
      "circle-color": ["case", isSelected, palette.route, palette.stopFill],
      "circle-stroke-color": ["case", isSelected, palette.routeCasing, palette.route],
      "circle-stroke-width": byZoom(10, ["case", isSelected, 3, 1.5], 16, ["case", isSelected, 3, 2.5]),
    },
  });
  map.addLayer({
    id: "busline-stop-labels",
    type: "symbol",
    source: SOURCE.stops,
    minzoom: 14.5,
    filter: ["all", ["!", isSelected], ["!", isTerminal]],
    layout: {
      "text-field": ["get", "name"],
      "text-font": TEXT_FONT,
      "text-size": 12,
      "text-offset": [0, 1],
      "text-anchor": "top",
      "text-optional": true,
    },
    paint: { "text-color": palette.label, "text-halo-color": palette.labelHalo, "text-halo-width": 1.5 },
  });
  map.addLayer({
    id: "busline-stop-selected-label",
    type: "symbol",
    source: SOURCE.stops,
    filter: isSelected,
    layout: {
      "text-field": ["get", "name"],
      "text-font": TEXT_FONT,
      "text-size": 14,
      "text-offset": [0, 1.2],
      "text-anchor": "top",
      "text-allow-overlap": true,
    },
    paint: { "text-color": palette.label, "text-halo-color": palette.labelHalo, "text-halo-width": 2 },
  });

  installTerminalLayers(map, palette);
  installPlanLayers(map, palette, scheme);
  installNearbyLayers(map, palette);

  const busImage = busImageId(scheme);
  if (!map.hasImage(busImage)) map.addImage(busImage, drawBusImage(palette.bus), { pixelRatio: 2 });
  map.addLayer({
    id: "busline-buses",
    type: "symbol",
    source: SOURCE.buses,
    layout: {
      "icon-image": busImage,
      "icon-rotate": ["get", "azimuth"],
      "icon-rotation-alignment": "map",
      "icon-allow-overlap": true,
      "icon-size": byZoom(10, 0.75, 16, 1.1),
    },
  });
}

export function setSourceData(map: MapLibreMap, sourceId: string, data: GeoJSONSourceSpecification["data"]): void {
  map.getSource<GeoJSONSource>(sourceId)?.setData(data);
}
