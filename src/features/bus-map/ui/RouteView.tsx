"use client";

import { cityByCode } from "@/lib/cities";
import type { RouteDetail, RouteLive, RouteSummary } from "@/lib/types";
import { useNow } from "../hooks";
import { AlertIcon, BackIcon } from "../icons";
import { RouteBadge } from "./RouteBadge";
import { ErrorState } from "./SearchView";
import { StopList } from "./StopList";

type Props = {
  summary: RouteSummary | undefined;
  detail: RouteDetail | undefined;
  detailError: Error | undefined;
  onRetryDetail: () => void;
  live: RouteLive | undefined;
  liveError: Error | undefined;
  direction: number;
  onDirectionChange: (direction: number) => void;
  selectedStopUid: string | null;
  onStopSelect: (uid: string) => void;
  onBack: () => void;
};

export function RouteView({
  summary,
  detail,
  detailError,
  onRetryDetail,
  live,
  liveError,
  direction,
  onDirectionChange,
  selectedStopUid,
  onStopSelect,
  onBack,
}: Props) {
  const head = detail ?? summary;
  const activeDirection = detail?.directions.find((d) => d.direction === direction);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="border-b border-line px-4 pt-2 pb-3 md:pt-4">
        <button
          type="button"
          onClick={onBack}
          className="-ml-1.5 mb-2 flex items-center gap-0.5 rounded-lg py-1 pr-2 pl-1 text-sm text-fg-muted transition-colors hover:bg-surface-sunken hover:text-fg"
        >
          <BackIcon width={18} height={18} />
          返回
        </button>

        <div className="flex items-center gap-3">
          {head ? <RouteBadge name={head.name} variant="route" size="lg" /> : <BadgeSkeleton />}
          <div className="min-w-0">
            <p className="text-[11px] font-semibold tracking-[0.12em] text-fg-subtle">
              {head ? (cityByCode(head.cityCode)?.name ?? head.cityCode) : " "}
            </p>
            <p className="truncate text-[15px] font-medium">
              {head?.from && head.to ? (
                <>
                  {head.from}
                  <span className="mx-1.5 text-fg-subtle">⇄</span>
                  {head.to}
                </>
              ) : (
                (head?.from ?? "")
              )}
            </p>
          </div>
        </div>

        {detail && detail.directions.length > 1 && (
          <div role="tablist" aria-label="行駛方向" className="mt-4 flex rounded-[12px] bg-surface-sunken p-1">
            {detail.directions.map((d) => {
              const isActive = d.direction === direction;
              return (
                <button
                  key={d.direction}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => onDirectionChange(d.direction)}
                  className={`min-w-0 flex-1 truncate rounded-[9px] px-2 py-2 text-sm transition ${
                    isActive ? "bg-surface-solid font-semibold text-fg shadow-sm" : "text-fg-muted hover:text-fg"
                  }`}
                >
                  {d.headsign}
                </button>
              );
            })}
          </div>
        )}

        {detail && <LiveStatus live={live} liveError={liveError} direction={direction} />}
        {activeDirection?.isApproximate && (
          <p className="mt-2 flex items-center gap-1.5 text-xs text-soon">
            <AlertIcon width={14} height={14} />
            這條路線沒有線型資料，地圖上以站牌連線表示
          </p>
        )}
      </header>

      <div data-scroll-container className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pt-2">
        {detailError && !detail ? (
          <ErrorState message={detailError.message} onRetry={onRetryDetail} />
        ) : !detail ? (
          <StopsSkeleton />
        ) : activeDirection ? (
          <StopList
            stops={activeDirection.stops}
            direction={direction}
            live={live}
            selectedStopUid={selectedStopUid}
            onSelect={onStopSelect}
          />
        ) : (
          <p className="px-4 py-10 text-center text-sm text-fg-muted">這條路線目前沒有站序資料</p>
        )}
      </div>
    </div>
  );
}

const LIVE_TICK_MS = 5_000;

function LiveStatus({
  live,
  liveError,
  direction,
}: {
  live: RouteLive | undefined;
  liveError: Error | undefined;
  direction: number;
}) {
  const now = useNow(LIVE_TICK_MS);

  if (!live) {
    return <p className="mt-3 text-xs text-fg-subtle">{liveError ? "即時資料暫時無法取得" : "正在取得即時動態…"}</p>;
  }

  const running = live.buses.filter((b) => b.direction === direction).length;
  const secondsAgo = Math.max(0, Math.round((now - Date.parse(live.fetchedAt)) / 1000));
  const busesMissing = live.unavailable.includes("buses");
  const etasMissing = live.unavailable.includes("etas");
  const isHealthy = !liveError && live.unavailable.length === 0;

  const busSummary = busesMissing
    ? "車輛位置暫時無法取得"
    : running > 0
      ? `${running} 輛行駛中`
      : "目前沒有車輛回報位置";
  const freshness = liveError ? "更新失敗，顯示舊資料" : secondsAgo < 10 ? "剛剛更新" : `${secondsAgo} 秒前更新`;

  return (
    <div className="mt-3 text-xs text-fg-muted">
      <p className="flex items-center gap-2">
        <span className="relative flex size-2" aria-hidden>
          {isHealthy && (
            <span className="absolute inset-0 animate-[live-ping_2s_ease-out_infinite] rounded-full bg-live" />
          )}
          <span className={`relative size-2 rounded-full ${isHealthy ? "bg-live" : "bg-soon"}`} />
        </span>
        {/* 只朗讀車輛狀態，每 5 秒變動的時間不放進 live region */}
        <span aria-live="polite">{busSummary}</span>
        <span className="text-fg-subtle" aria-hidden>
          ·
        </span>
        <span>{freshness}</span>
      </p>
      {etasMissing && <p className="mt-1 pl-4 text-soon">到站時間暫時無法取得</p>}
    </div>
  );
}

function BadgeSkeleton() {
  return <span className="h-[2.6rem] w-[4.5rem] animate-pulse rounded-[10px] bg-surface-sunken" />;
}

function StopsSkeleton() {
  return (
    <div className="space-y-4 px-3 pt-3" aria-busy="true" aria-label="載入中">
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className="flex items-center gap-4">
          <span className="size-3 animate-pulse rounded-full bg-surface-sunken" />
          <span className="h-3.5 flex-1 animate-pulse rounded bg-surface-sunken" />
          <span className="h-3.5 w-8 animate-pulse rounded bg-surface-sunken" />
        </div>
      ))}
    </div>
  );
}
