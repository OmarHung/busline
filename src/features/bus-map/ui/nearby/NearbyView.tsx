"use client";

import { useEffect, useRef, useState } from "react";
import type { NearbyRoute, NearbyStation } from "@/lib/types";
import type { LocateStatus } from "../../hooks";
import { ChevronRightIcon, LocateIcon } from "../../icons";
import { walkMinutes } from "../plan/types";
import { RouteBadge } from "../RouteBadge";
import { scrollRowIntoView } from "../scroll";
import { ErrorState, LoadingRows } from "../SearchView";

/** 大站常有幾十條路線，先列這麼多，其餘按了才展開 */
const COLLAPSED_ROUTE_COUNT = 6;

/** 用定位到的目前位置，或使用者在地圖上選的中心找附近的站 */
export type NearbySource = "gps" | "map";

type Props = {
  source: NearbySource;
  locateStatus: LocateStatus;
  /** 改用目前位置（重新定位） */
  onLocate: () => void;
  stations: NearbyStation[] | undefined;
  error: Error | undefined;
  onRetry: () => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onOpenRoute: (station: NearbyStation, ride: NearbyRoute) => void;
};

export function NearbyView({
  source,
  locateStatus,
  onLocate,
  stations,
  error,
  onRetry,
  selectedId,
  onSelect,
  onOpenRoute,
}: Props) {
  const listRef = useRef<HTMLOListElement>(null);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());

  // 從地圖點站牌時，把列表捲到那一站
  useEffect(() => {
    if (!selectedId) return;
    const list = listRef.current;
    const container = list?.closest<HTMLElement>("[data-scroll-container]");
    const row = list?.querySelector<HTMLElement>(`[data-station="${CSS.escape(selectedId)}"]`);
    if (container && row) scrollRowIntoView(container, row);
  }, [selectedId]);

  const expand = (id: string) => setExpanded((prev) => new Set([...prev, id]));
  // 用地圖中心找的時候，定位失敗與否都不影響
  const gpsStatus = source === "gps" ? locateStatus : "ready";
  const caption =
    source === "map"
      ? "地圖中心附近的公車站"
      : gpsStatus === "locating" && !stations
        ? "正在取得目前位置…"
        : gpsStatus === "denied" || gpsStatus === "unavailable"
          ? "需要目前位置才能找附近的站"
          : "目前位置附近的公車站";

  const body =
    gpsStatus === "denied" ? (
      <ErrorState
        message="沒有定位權限。請在瀏覽器的網站設定允許存取位置再按重試，或把地圖移到想查的地方，按上方的「在地圖上顯示附近站點」。"
        onRetry={onLocate}
      />
    ) : gpsStatus === "unavailable" ? (
      <ErrorState message="無法取得目前位置。請確認裝置已開啟定位服務，再按重試。" onRetry={onLocate} />
    ) : error && !stations ? (
      <ErrorState message={error.message} onRetry={onRetry} />
    ) : !stations ? (
      <LoadingRows />
    ) : stations.length === 0 ? (
      <p className="px-3 py-10 text-center text-sm text-fg-muted">附近 1 公里內沒有公車站</p>
    ) : (
      <>
        <ol ref={listRef} aria-label="附近的公車站" className="space-y-1">
          {stations.map((station) => {
            const isSelected = station.id === selectedId;
            const isExpanded = expanded.has(station.id) || station.routes.length <= COLLAPSED_ROUTE_COUNT;
            const visible = isExpanded ? station.routes : station.routes.slice(0, COLLAPSED_ROUTE_COUNT);
            const hiddenCount = station.routes.length - visible.length;
            return (
              <li
                key={station.id}
                data-station={station.id}
                className={`rounded-2xl pb-1.5 transition-colors ${isSelected ? "bg-route-soft" : ""}`}
              >
                <button
                  type="button"
                  onClick={() => onSelect(station.id)}
                  aria-current={isSelected ? "location" : undefined}
                  className={`flex w-full items-baseline justify-between gap-3 rounded-xl px-3 pt-3 pb-1 text-left transition-colors focus-visible:outline-none ${
                    isSelected ? "" : "hover:bg-surface-sunken focus-visible:bg-surface-sunken"
                  }`}
                >
                  <span className="min-w-0 truncate text-[15px] font-semibold">{station.name}</span>
                  <span className="shrink-0 text-xs text-fg-subtle tabular-nums">
                    {station.meters} 公尺・步行 {walkMinutes(station.meters)} 分
                  </span>
                </button>
                <ul aria-label={`${station.name}的路線`}>
                  {visible.map((ride) => (
                    <li key={`${ride.route.uid}:${ride.direction}`}>
                      <button
                        type="button"
                        onClick={() => onOpenRoute(station, ride)}
                        aria-label={`${ride.route.name} ${ride.headsign}`}
                        className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors hover:bg-surface-sunken focus-visible:bg-surface-sunken focus-visible:outline-none active:scale-[0.99]"
                      >
                        <RouteBadge name={ride.route.name} />
                        <span className="min-w-0 flex-1 truncate text-sm text-fg-muted">{ride.headsign}</span>
                        <ChevronRightIcon width={16} height={16} className="shrink-0 text-fg-subtle" />
                      </button>
                    </li>
                  ))}
                </ul>
                {hiddenCount > 0 && (
                  <button
                    type="button"
                    onClick={() => expand(station.id)}
                    className="mt-0.5 ml-3 rounded-full px-3 py-1 text-xs font-medium text-route transition-colors hover:bg-route-soft"
                  >
                    再顯示 {hiddenCount} 條路線
                  </button>
                )}
              </li>
            );
          })}
        </ol>
        <p className="px-3 pt-4 text-xs text-fg-subtle">距離為直線距離。點路線可以看各站的到站時間。</p>
      </>
    );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-center justify-between gap-3 px-5 pt-1 pb-3">
        <p className="text-sm text-fg-muted">{caption}</p>
        <button
          type="button"
          onClick={onLocate}
          disabled={locateStatus === "locating"}
          className="flex shrink-0 items-center gap-1 rounded-full border border-line px-3 py-1 text-xs text-fg-muted transition hover:border-route hover:text-route disabled:opacity-60"
        >
          <LocateIcon width={14} height={14} />
          {locateStatus === "locating" ? "定位中…" : source === "map" ? "用目前位置" : "重新定位"}
        </button>
      </header>

      <div data-scroll-container className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-6">
        {body}
      </div>
    </div>
  );
}
