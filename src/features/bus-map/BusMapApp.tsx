"use client";

import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { isValidRouteUid } from "@/lib/cities";
import { nearestStopIndex } from "@/lib/geo/nearest";
import { sliceLineBetween } from "@/lib/geo/slice";
import { etaKey, type RouteSummary } from "@/lib/types";
import { useMediaQuery, useRouteDetail, useRouteIndex, useRouteLive, useWindowHeight } from "./hooks";
import type { PlanOverlay } from "./map/geojson";
import { Panel, SHEET_COLLAPSED_RATIO } from "./ui/Panel";
import { PanelHeader, type PanelMode } from "./ui/PanelHeader";
import type { BoardEta } from "./ui/plan/PlanResults";
import { PlanView } from "./ui/plan/PlanView";
import { usePlanState } from "./ui/plan/usePlanState";
import { RouteView } from "./ui/RouteView";
import { SearchView } from "./ui/SearchView";

// MapLibre 只能在瀏覽器執行
const MapView = dynamic(() => import("./map/MapView"), { ssr: false });

const DESKTOP_QUERY = "(min-width: 768px)";
const DESKTOP_PANEL_WIDTH = 388;
const APP_TITLE = "公車路線圖";
const FROM_SEARCH_KEY = "buslineFromSearch";

export function BusMapApp() {
  const searchParams = useSearchParams();
  const rawUid = searchParams.get("r");
  const uid = rawUid && isValidRouteUid(rawUid) ? rawUid : null;

  const [mode, setMode] = useState<PanelMode>("routes");
  const planner = usePlanState();
  const isPlanning = !uid && mode === "plan";
  const ride = isPlanning ? planner.selectedRide : undefined;
  const option = isPlanning ? planner.selectedOption : undefined;

  // 路線頁看的路線，或規劃中選取的那條路線；線型與站序來自靜態檔，不耗 TDX 額度
  const activeUid = uid ?? ride?.route.uid ?? null;
  // 即時資料要呼叫 TDX：路線頁一律抓，規劃中只有使用者按了「查看下一班」才抓；同時只會有一條
  const liveUid = uid ?? (planner.isLiveRequested ? ride?.route.uid : undefined) ?? null;
  const index = useRouteIndex();
  const detail = useRouteDetail(activeUid);
  const live = useRouteLive(liveUid);

  const [query, setQuery] = useState("");
  const [isExpanded, setExpanded] = useState(false);
  // 方向與選取的站都綁定路線，換路線時自動回到預設值
  const [directionChoice, setDirectionChoice] = useState<{ uid: string; direction: number } | null>(null);
  const [stopChoice, setStopChoice] = useState<{ key: string; stopUid: string } | null>(null);

  const isDesktop = useMediaQuery(DESKTOP_QUERY);
  const isDark = useMediaQuery("(prefers-color-scheme: dark)");
  const windowHeight = useWindowHeight();

  const direction =
    directionChoice?.uid === uid ? directionChoice.direction : (detail.data?.directions[0]?.direction ?? 0);
  const stopKey = `${uid}:${direction}`;
  const selectedStopUid = stopChoice?.key === stopKey ? stopChoice.stopUid : null;
  const summary = uid ? index.data?.routes.find((r) => r.uid === uid) : undefined;
  const routeName = detail.data?.name ?? summary?.name;

  useEffect(() => {
    document.title = uid && routeName ? `${routeName}・${APP_TITLE}` : APP_TITLE;
  }, [uid, routeName]);

  // 規劃中選取的路線，該方向的站序（線型與上車站的到站時間都要用）
  const rideDirection =
    ride && detail.data?.uid === ride.route.uid
      ? detail.data.directions.find((d) => d.direction === ride.direction)
      : undefined;

  const planOverlay = useMemo<PlanOverlay | null>(() => {
    if (!isPlanning) return null;
    const exactLine =
      option && rideDirection && !rideDirection.isApproximate
        ? sliceLineBetween(rideDirection.lines, option.board.position, option.alight.position)
        : null;
    return {
      origin: planner.origin?.position ?? null,
      destination: planner.destination?.position ?? null,
      board: option?.board.position ?? null,
      alight: option?.alight.position ?? null,
      ride: exactLine ?? ride?.path ?? null,
    };
  }, [isPlanning, planner.origin, planner.destination, option, ride, rideDirection]);

  const boardEta = useMemo<BoardEta>(() => {
    if (!planner.isLiveRequested || !option || !ride) return { status: "idle" };
    if ((live.error && !live.data) || (detail.error && !detail.data)) return { status: "error" };
    if (!live.data || !detail.data) return { status: "loading" };
    if (live.data.unavailable.includes("etas")) return { status: "error" };
    const stops = rideDirection?.stops ?? [];
    const i = nearestStopIndex(stops, option.board.position);
    return { status: "ready", eta: i >= 0 ? live.data.etas[etaKey(ride.direction, stops[i].uid)] : undefined };
  }, [planner.isLiveRequested, option, ride, rideDirection, live.data, live.error, detail.data, detail.error]);

  const openRoute = (route: RouteSummary, routeDirection?: number) => {
    if (routeDirection !== undefined) setDirectionChoice({ uid: route.uid, direction: routeDirection });
    // 標記在 history entry 上，瀏覽器上一頁／下一頁後仍然正確
    window.history.pushState({ [FROM_SEARCH_KEY]: true }, "", `?r=${encodeURIComponent(route.uid)}`);
    setExpanded(false);
  };

  const closeRoute = () => {
    // 從搜尋或規劃點進來的就退回上一頁（保留原本的狀態），從分享連結進來的則新增一筆首頁，避免離開網站
    if ((window.history.state as Record<string, unknown> | null)?.[FROM_SEARCH_KEY]) window.history.back();
    else window.history.pushState(null, "", window.location.pathname);
  };

  const changeMode = (next: PanelMode) => {
    setMode(next);
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
        direction={uid ? direction : (ride?.direction ?? 0)}
        buses={liveUid ? (live.data?.buses ?? []) : []}
        selectedStopUid={selectedStopUid}
        onStopClick={selectStop}
        padding={padding}
        scheme={isDark ? "dark" : "light"}
        plan={planOverlay}
      />
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
            ) : (
              <PlanView
                origin={planner.origin}
                destination={planner.destination}
                onPointChange={planner.setPoint}
                onSwap={planner.swap}
                locateStatus={planner.locator.status}
                onUseCurrentLocation={() => void planner.pickCurrentLocation()}
                near={planner.origin?.position ?? planner.locator.position}
                result={planner.plan.data}
                isPlanning={planner.plan.isLoading}
                planError={planner.plan.error}
                onRetryPlan={() => void planner.plan.mutate()}
                selection={planner.selection}
                onSelect={planner.select}
                boardEta={boardEta}
                onRequestBoardEta={planner.requestLive}
                onOpenRoute={(route) => openRoute(route, ride?.route.uid === route.uid ? ride.direction : undefined)}
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
