"use client";

import type { Place } from "@/lib/types";
import type { LocateStatus } from "../../hooks";
import { BusIcon, LocateIcon } from "../../icons";

const LOCATE_HINTS: Partial<Record<LocateStatus, string>> = {
  locating: "定位中…",
  denied: "瀏覽器沒有允許定位，請改用輸入的",
  unavailable: "目前無法定位",
};

type Props = {
  query: string;
  places: Place[] | undefined;
  isLoading: boolean;
  error: Error | undefined;
  /** 起點欄位才提供「目前位置」 */
  showCurrentLocation: boolean;
  locateStatus: LocateStatus;
  onPickCurrentLocation: () => void;
  onPick: (place: Place) => void;
  onCancel: () => void;
};

const PinIcon = () => (
  <svg width={16} height={16} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7Zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5Z" />
  </svg>
);

export function Suggestions({
  query,
  places,
  isLoading,
  error,
  showCurrentLocation,
  locateStatus,
  onPickCurrentLocation,
  onPick,
  onCancel,
}: Props) {
  const hasQuery = query.trim().length > 0;
  const rowClass =
    "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-surface-sunken focus-visible:bg-route-soft focus-visible:outline-none";

  return (
    <div className="px-2 pb-6">
      <div className="flex items-center justify-between px-3 pt-1 pb-2">
        <p className="text-xs text-fg-subtle">{hasQuery ? "搜尋結果" : "輸入地點、地標、地址或公車站名"}</p>
        <button type="button" onClick={onCancel} className="text-xs text-fg-muted hover:text-fg">
          取消
        </button>
      </div>

      <ul>
        {showCurrentLocation && (
          <li>
            <button type="button" onClick={onPickCurrentLocation} className={rowClass}>
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-route-soft text-route">
                <LocateIcon width={16} height={16} />
              </span>
              <span className="min-w-0">
                <span className="block text-[15px] font-medium text-route">目前位置</span>
                {LOCATE_HINTS[locateStatus] && (
                  <span className="block text-xs text-fg-subtle">{LOCATE_HINTS[locateStatus]}</span>
                )}
              </span>
            </button>
          </li>
        )}
        {hasQuery &&
          places?.map((place) => (
            <li key={place.id}>
              <button type="button" onClick={() => onPick(place)} className={rowClass}>
                <span
                  className={`grid size-8 shrink-0 place-items-center rounded-full ${
                    place.kind === "stop" ? "bg-route-soft text-route" : "bg-surface-sunken text-fg-muted"
                  }`}
                >
                  {place.kind === "stop" ? <BusIcon width={16} height={16} /> : <PinIcon />}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[15px]">{place.name}</span>
                  {place.detail && <span className="block truncate text-xs text-fg-subtle">{place.detail}</span>}
                </span>
              </button>
            </li>
          ))}
      </ul>

      {hasQuery && isLoading && !places && <p className="px-3 py-4 text-sm text-fg-subtle">搜尋中…</p>}
      {hasQuery && error && <p className="px-3 py-4 text-sm text-arriving">{error.message}</p>}
      {hasQuery && places?.length === 0 && !isLoading && (
        <p className="px-3 py-4 text-sm text-fg-muted">找不到「{query.trim()}」，換個說法試試</p>
      )}
    </div>
  );
}
