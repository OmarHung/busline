"use client";

import type { ReactNode } from "react";
import { formatEta } from "@/lib/eta";
import type { PlanOption, PlanResult, RouteSummary, StopEta } from "@/lib/types";
import { ChevronRightIcon, WalkIcon } from "../../icons";
import { EtaChip } from "../EtaChip";
import { RouteBadge } from "../RouteBadge";
import { ErrorState } from "../SearchView";
import { walkMinutes } from "./types";

/** 起終點距離在這以內，建議直接走路 */
const SHORT_WALK_METERS = 700;
/** 卡片上最多列幾個路線號碼，其餘顯示 +N */
const MAX_BADGES = 4;

export interface PlanSelection {
  option: number;
  ride: number;
}

type Props = {
  result: PlanResult | undefined;
  isLoading: boolean;
  error: Error | undefined;
  onRetry: () => void;
  selection: PlanSelection | null;
  onSelect: (selection: PlanSelection) => void;
  /** 選取路線在上車站的即時到站；undefined 表示還沒取得 */
  boardEta: StopEta | undefined;
  isBoardEtaLoading: boolean;
  onOpenRoute: (route: RouteSummary) => void;
};

export function PlanResults({
  result,
  isLoading,
  error,
  onRetry,
  selection,
  onSelect,
  boardEta,
  isBoardEtaLoading,
  onOpenRoute,
}: Props) {
  if (error && !result) return <ErrorState message={error.message} onRetry={onRetry} />;
  if (isLoading || !result) return <ResultsSkeleton />;

  const isShortWalk = result.directMeters <= SHORT_WALK_METERS;

  return (
    <div className="px-3 pb-8">
      {isShortWalk && (
        <p className="mx-1 mb-3 flex items-center gap-2 rounded-xl bg-surface-sunken px-3 py-2.5 text-sm text-fg-muted">
          <WalkIcon width={18} height={18} className="shrink-0" />
          距離約 {result.directMeters} 公尺，走路大概 {walkMinutes(result.directMeters)} 分鐘
        </p>
      )}

      {result.options.length === 0 ? (
        <div className="px-3 py-8 text-center text-sm text-fg-muted">
          <p>附近找不到直達的公車</p>
          <p className="mt-1 text-xs text-fg-subtle">目前只規劃不用轉乘的路線，可以試試換個起點或終點</p>
        </div>
      ) : (
        <ol className="space-y-2" aria-label="直達方案">
          {result.options.map((option, index) => (
            <li key={`${option.board.name}-${option.alight.name}`}>
              <OptionCard
                option={option}
                isSelected={selection?.option === index}
                rideIndex={selection?.option === index ? selection.ride : 0}
                onSelect={(ride) => onSelect({ option: index, ride })}
                boardEta={selection?.option === index ? boardEta : undefined}
                isBoardEtaLoading={isBoardEtaLoading}
                onOpenRoute={onOpenRoute}
              />
            </li>
          ))}
        </ol>
      )}

      <p className="mt-4 px-1 text-[11px] leading-relaxed text-fg-subtle">
        時間為步行與乘車的估計，不含等車；只列出不用轉乘的公車。
      </p>
    </div>
  );
}

type CardProps = {
  option: PlanOption;
  isSelected: boolean;
  rideIndex: number;
  onSelect: (ride: number) => void;
  boardEta: StopEta | undefined;
  isBoardEtaLoading: boolean;
  onOpenRoute: (route: RouteSummary) => void;
};

function OptionCard({ option, isSelected, rideIndex, onSelect, boardEta, isBoardEtaLoading, onOpenRoute }: CardProps) {
  const ride = option.rides[rideIndex] ?? option.rides[0];
  const extra = option.rides.length - MAX_BADGES;

  return (
    <div
      className={`rounded-2xl border transition ${
        isSelected ? "border-route bg-surface-solid shadow-sm" : "border-line hover:border-fg-subtle/40"
      }`}
    >
      <button
        type="button"
        onClick={() => onSelect(isSelected ? rideIndex : 0)}
        aria-expanded={isSelected}
        className="flex w-full items-start gap-3 rounded-2xl p-3 text-left focus-visible:outline-none"
      >
        <span className="w-12 shrink-0 text-center leading-none">
          <span className="font-sign text-[26px] font-bold tabular-nums">{option.rides[0].estimatedMinutes}</span>
          <span className="block text-[11px] text-fg-muted">分鐘</span>
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap gap-1">
            {option.rides.slice(0, MAX_BADGES).map((r) => (
              <RouteBadge key={r.route.uid} name={r.route.name} />
            ))}
            {extra > 0 && <span className="self-center text-xs text-fg-muted">+{extra}</span>}
          </span>
          <span className="mt-1.5 block truncate text-[13px] text-fg-muted">
            {option.board.name}
            <span className="mx-1 text-fg-subtle">→</span>
            {option.alight.name}
          </span>
          <span className="block text-xs text-fg-subtle">
            步行 {option.board.walkMeters + option.alight.walkMeters} 公尺・坐 {option.rides[0].stopCount} 站
          </span>
        </span>
      </button>

      {isSelected && (
        <div className="border-t border-line px-3 pt-3 pb-3">
          {option.rides.length > 1 && (
            <div role="radiogroup" aria-label="可搭的路線" className="mb-3 flex flex-wrap gap-1.5">
              {option.rides.map((r, i) => (
                <button
                  key={r.route.uid}
                  type="button"
                  role="radio"
                  aria-checked={i === rideIndex}
                  onClick={() => onSelect(i)}
                  className={`rounded-lg px-1 py-0.5 transition ${i === rideIndex ? "ring-2 ring-route" : "opacity-70 hover:opacity-100"}`}
                >
                  <RouteBadge name={r.route.name} variant={i === rideIndex ? "route" : "sign"} />
                </button>
              ))}
            </div>
          )}

          <ol className="space-y-2.5 text-sm">
            <Step icon={<WalkIcon width={16} height={16} />}>
              步行 {option.board.walkMeters} 公尺（約 {walkMinutes(option.board.walkMeters)} 分）到
              <strong className="font-semibold">「{option.board.name}」</strong>
            </Step>
            <Step icon={<RouteBadge name={ride.route.name} variant="route" />}>
              <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span>{ride.headsign}</span>
                <span className="flex items-center gap-1 text-xs text-fg-muted">
                  下一班
                  {boardEta ? (
                    <EtaChip eta={formatEta(boardEta)} isLastBus={boardEta.isLastBus} />
                  ) : (
                    <span>{isBoardEtaLoading ? "查詢中…" : "—"}</span>
                  )}
                </span>
              </span>
              <span className="block text-xs text-fg-muted">
                坐 {ride.stopCount} 站，在<strong className="font-semibold text-fg">「{option.alight.name}」</strong>
                下車
              </span>
            </Step>
            <Step icon={<WalkIcon width={16} height={16} />}>
              步行 {option.alight.walkMeters} 公尺（約 {walkMinutes(option.alight.walkMeters)} 分）到目的地
            </Step>
          </ol>

          <button
            type="button"
            onClick={() => onOpenRoute(ride.route)}
            className="mt-3 flex w-full items-center justify-center gap-1 rounded-xl bg-surface-sunken py-2 text-sm text-fg-muted transition hover:text-fg"
          >
            查看 {ride.route.name} 完整路線
            <ChevronRightIcon width={16} height={16} />
          </button>
        </div>
      )}
    </div>
  );
}

function Step({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <li className="flex items-start gap-2.5">
      <span className="mt-0.5 flex w-[3.25rem] shrink-0 justify-center text-fg-muted">{icon}</span>
      <span className="min-w-0 flex-1 leading-relaxed">{children}</span>
    </li>
  );
}

function ResultsSkeleton() {
  return (
    <div className="space-y-2 px-3 pt-1" aria-busy="true" aria-label="規劃中">
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="flex gap-3 rounded-2xl border border-line p-3">
          <span className="h-9 w-12 animate-pulse rounded bg-surface-sunken" />
          <span className="flex-1 space-y-2">
            <span className="block h-6 w-32 animate-pulse rounded bg-surface-sunken" />
            <span className="block h-3 w-48 animate-pulse rounded bg-surface-sunken" />
          </span>
        </div>
      ))}
    </div>
  );
}
