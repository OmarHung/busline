"use client";

import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { isValidRouteUid } from "@/lib/cities";
import type { LngLat, NearbyRoute, NearbyStation, RouteSummary } from "@/lib/types";
import {
  useCurrentPosition,
  useMediaQuery,
  useNearbyStations,
  useRouteDetail,
  useRouteDetails,
  useRouteIndex,
  useRouteLive,
  useWindowHeight,
} from "./hooks";
import type { NearbyOverlay, PlanOverlay } from "./map/geojson";
import type { Viewport } from "./map/MapView";
import { MapNearbyButton } from "./ui/nearby/MapNearbyButton";
import { NearbyView, type NearbySource } from "./ui/nearby/NearbyView";
import { hintedStopUid, type StopHint } from "./ui/nearby/stop-hint";
import { Panel, SHEET_COLLAPSED_RATIO } from "./ui/Panel";
import { PanelHeader, type PanelMode } from "./ui/PanelHeader";
import { PlanPointPopup } from "./ui/plan/PlanPointPopup";
import { PlanView } from "./ui/plan/PlanView";
import { boardEtaOf, pointBusInfo, tripOverlay, type PlanLeg } from "./ui/plan/trip";
import { usePlanState } from "./ui/plan/usePlanState";
import { RouteView } from "./ui/RouteView";
import { SearchView } from "./ui/SearchView";

// MapLibre 只能在瀏覽器執行
const MapView = dynamic(() => import("./map/MapView"), { ssr: false });

const DESKTOP_QUERY = "(min-width: 768px)";
const DESKTOP_PANEL_WIDTH = 388;
const APP_TITLE = "公車路線圖";
const FROM_SEARCH_KEY = "buslineFromSearch";
const NO_LEGS: PlanLeg[] = [];

export function BusMapApp() {
  const searchParams = useSearchParams();
  const rawUid = searchParams.get("r");
  const uid = rawUid && isValidRouteUid(rawUid) ? rawUid : null;

  const [mode, setMode] = useState<PanelMode>("routes");
  const planner = usePlanState();
  const isPlanning = !uid && mode === "plan";
  const legs = isPlanning ? planner.legs : NO_LEGS;
  const liveRide = legs.find((leg) => leg.isLiveRequested)?.ride;
  // 附近站牌用自己的定位：和規劃共用的話，先在這裡定位過，進規劃就不會自動把起點設成目前位置
  const isNearby = !uid && mode === "nearby";
  const nearbyLocator = useCurrentPosition();
  // 也可以按地圖上的「在地圖上顯示附近站點」，改用地圖畫面的中心找
  const [nearbySource, setNearbySource] = useState<NearbySource>("gps");
  const [mapCenterOrigin, setMapCenterOrigin] = useState<LngLat | null>(null);
  const nearbyOrigin = nearbySource === "map" ? mapCenterOrigin : nearbyLocator.position;
  const nearby = useNearbyStations(isNearby ? nearbyOrigin : null);
  const nearbyStations = isNearby ? nearby.data?.stations : undefined;
  const [nearbyChoice, setNearbyChoice] = useState<string | null>(null);
  const selectedNearbyId = nearbyStations?.some((s) => s.id === nearbyChoice) ? nearbyChoice : null;

  // 線型與站序來自靜態檔，不耗 TDX 額度：路線頁看的路線，以及規劃中各段選取的路線
  const index = useRouteIndex();
  const detail = useRouteDetail(uid);
  const rideDetails = useRouteDetails(legs.flatMap((leg) => (leg.ride ? [leg.ride.route.uid] : [])));
  // 即時資料要呼叫 TDX：路線頁一律抓，規劃中只有使用者按了「查看下一班」才抓；同時只會有一條
  const liveUid = uid ?? liveRide?.route.uid ?? null;
  const live = useRouteLive(liveUid);

  const [query, setQuery] = useState("");
  const [isExpanded, setExpanded] = useState(false);
  // 方向與選取的站都綁定路線，換路線時自動回到預設值
  const [directionChoice, setDirectionChoice] = useState<{ uid: string; direction: number } | null>(null);
  const [stopChoice, setStopChoice] = useState<{ key: string; stopUid: string } | null>(null);
  // 從附近站牌點進路線時，預先選取使用者附近的那一站
  const [stopHint, setStopHint] = useState<StopHint | null>(null);
  // 顯示附近站點之後，使用者又拖曳或縮放了地圖，才再出現「在地圖上顯示附近站點」
  const [viewport, setViewport] = useState<Viewport | null>(null);
  const [hasMovedMap, setMovedMap] = useState(false);

  const isDesktop = useMediaQuery(DESKTOP_QUERY);
  const isDark = useMediaQuery("(prefers-color-scheme: dark)");
  const windowHeight = useWindowHeight();

  const direction =
    directionChoice?.uid === uid ? directionChoice.direction : (detail.data?.directions[0]?.direction ?? 0);
  const stopKey = `${uid}:${direction}`;
  const activeStops = detail.data?.directions.find((d) => d.direction === direction)?.stops ?? [];
  const hintedUid =
    stopHint?.uid === uid && stopHint.direction === direction ? hintedStopUid(activeStops, stopHint) : null;
  const selectedStopUid = stopChoice?.key === stopKey ? stopChoice.stopUid : hintedUid;
  const summary = uid ? index.data?.routes.find((r) => r.uid === uid) : undefined;
  const routeName = detail.data?.name ?? summary?.name;

  useEffect(() => {
    document.title = uid && routeName ? `${routeName}・${APP_TITLE}` : APP_TITLE;
  }, [uid, routeName]);

  // 地點、選取或線型改變時才重算，地圖才不會每次重繪都重新縮放
  const planOverlay = useMemo<PlanOverlay | null>(
    () => (isPlanning ? tripOverlay(planner.points, legs, rideDetails.data ?? {}) : null),
    [isPlanning, planner.points, legs, rideDetails.data],
  );
  const nearbyOverlay = useMemo<NearbyOverlay | null>(
    () =>
      nearbyStations && nearbyOrigin
        ? { center: nearbyOrigin, isCurrentLocation: nearbySource === "gps", stations: nearbyStations }
        : null,
    [nearbyStations, nearbyOrigin, nearbySource],
  );
  const boardEtas = legs.map((leg) => boardEtaOf(leg, { data: live.data, error: live.error }, rideDetails.data));
  const renderPlanPoint = (order: number) => {
    const info = pointBusInfo(planner.points, legs, order);
    return info && <PlanPointPopup info={info} boardEta={boardEtas[info.leg] ?? { status: "idle" }} />;
  };

  const openRoute = (route: RouteSummary, routeDirection?: number, hint: StopHint | null = null) => {
    if (routeDirection !== undefined) setDirectionChoice({ uid: route.uid, direction: routeDirection });
    setStopHint(hint);
    // 標記在 history entry 上，瀏覽器上一頁／下一頁後仍然正確
    window.history.pushState({ [FROM_SEARCH_KEY]: true }, "", `?r=${encodeURIComponent(route.uid)}`);
    setExpanded(false);
  };

  const closeRoute = () => {
    // 從搜尋或規劃點進來的就退回上一頁（保留原本的狀態），從分享連結進來的則新增一筆首頁，避免離開網站
    if ((window.history.state as Record<string, unknown> | null)?.[FROM_SEARCH_KEY]) window.history.back();
    else window.history.pushState(null, "", window.location.pathname);
  };

  const openNearbyRoute = (station: NearbyStation, ride: NearbyRoute) =>
    openRoute(ride.route, ride.direction, {
      uid: ride.route.uid,
      direction: ride.direction,
      name: station.name,
      position: ride.position,
    });

  const handleViewChange = (next: Viewport, isUserMove: boolean) => {
    setViewport(next);
    if (isUserMove) setMovedMap(true);
  };
  const showMapNearbyButton = !uid && !isPlanning && viewport !== null && (mode !== "nearby" || hasMovedMap);

  const showNearbyAtMapCenter = () => {
    if (!viewport) return;
    setMapCenterOrigin(viewport.center);
    setNearbySource("map");
    setNearbyChoice(null);
    setMovedMap(false);
    setMode("nearby");
  };

  const locateForNearby = () => {
    setNearbySource("gps");
    setMovedMap(false);
    void nearbyLocator.locate();
  };

  const changeMode = (next: PanelMode) => {
    setMode(next);
    if (next === "nearby") setMovedMap(false);
    // 第一次進附近站牌時自動定位；之後要使用者按「重新定位」
    if (next === "nearby" && nearbySource === "gps" && nearbyLocator.status === "idle") void nearbyLocator.locate();
    // 第一次進規劃時，起點預設用目前位置
    if (next === "plan" && !planner.origin && planner.locator.status === "idle") void planner.pickCurrentLocation();
  };

  const selectStop = (stopUid: string) => setStopChoice({ key: stopKey, stopUid });

  const padding = isDesktop
    ? { top: 48, bottom: 48, left: DESKTOP_PANEL_WIDTH + 56, right: 72 }
    : { top: 56, bottom: Math.round(windowHeight * SHEET_COLLAPSED_RATIO) + 24, left: 32, right: 56 };

  return (
    <>
      <MapView
        detail={uid ? (detail.data ?? null) : null}
        direction={direction}
        // 規劃中只畫行程：整條路線的車輛位置散在乘車路段外，容易被誤認成定位標記；下一班看列表與資訊卡
        buses={uid ? (live.data?.buses ?? []) : []}
        selectedStopUid={selectedStopUid}
        onStopClick={selectStop}
        padding={padding}
        scheme={isDark ? "dark" : "light"}
        plan={planOverlay}
        renderPlanPoint={isPlanning ? renderPlanPoint : undefined}
        nearby={nearbyOverlay}
        selectedNearbyId={selectedNearbyId}
        onNearbyStationClick={setNearbyChoice}
        onViewChange={handleViewChange}
      />
      {showMapNearbyButton && <MapNearbyButton zoom={viewport.zoom} onClick={showNearbyAtMapCenter} />}
      <Panel isExpanded={isExpanded} onToggle={() => setExpanded((v) => !v)}>
        {uid ? (
          <RouteView
            summary={summary}
            detail={detail.data}
            detailError={detail.error}
            onRetryDetail={() => void detail.mutate()}
            live={live.data}
            liveError={live.error}
            direction={direction}
            onDirectionChange={(d) => setDirectionChoice({ uid, direction: d })}
            selectedStopUid={selectedStopUid}
            onStopSelect={selectStop}
            onBack={closeRoute}
          />
        ) : (
          <>
            <PanelHeader mode={mode} onModeChange={changeMode} />
            {mode === "routes" ? (
              <SearchView
                index={index.data}
                isLoading={index.isLoading}
                error={index.error}
                onRetry={() => void index.mutate()}
                query={query}
                onQueryChange={setQuery}
                onSelect={(route) => openRoute(route)}
                onFocus={() => setExpanded(true)}
              />
            ) : mode === "nearby" ? (
              <NearbyView
                source={nearbySource}
                locateStatus={nearbyLocator.status}
                onLocate={locateForNearby}
                stations={nearbyStations}
                error={nearby.error}
                onRetry={() => void nearby.mutate()}
                selectedId={selectedNearbyId}
                onSelect={setNearbyChoice}
                onOpenRoute={openNearbyRoute}
              />
            ) : (
              <PlanView
                points={planner.points}
                slotIds={planner.slotIds}
                onPointChange={planner.setPoint}
                onMove={planner.move}
                canAddWaypoint={planner.canAddWaypoint}
                onAddWaypoint={planner.addWaypoint}
                onRemoveWaypoint={planner.removeWaypoint}
                onReverse={planner.reverse}
                locateStatus={planner.locator.status}
                onUseCurrentLocation={() => void planner.pickCurrentLocation()}
                near={planner.origin?.position ?? planner.locator.position}
                legs={legs}
                isPlanning={planner.trip.isLoading}
                planError={planner.trip.error}
                onRetryPlan={() => void planner.trip.mutate()}
                onSelect={planner.select}
                boardEtas={boardEtas}
                onRequestBoardEta={planner.requestLive}
                onOpenRoute={(ride) => openRoute(ride.route, ride.direction)}
                onEditStart={() => setExpanded(true)}
                onEditEnd={() => setExpanded(false)}
              />
            )}
          </>
        )}
      </Panel>
    </>
  );
}
