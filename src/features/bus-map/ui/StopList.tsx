"use client";

import { useEffect, useMemo, useRef } from "react";
import { formatEta } from "@/lib/eta";
import { nearestStopIndex } from "@/lib/geo/nearest";
import { etaKey, type LiveBus, type RouteLive, type Stop } from "@/lib/types";
import { BusIcon } from "../icons";
import { EtaChip } from "./EtaChip";
import { scrollRowIntoView } from "./scroll";

type Props = {
  stops: readonly Stop[];
  direction: number;
  live: RouteLive | undefined;
  selectedStopUid: string | null;
  onSelect: (uid: string) => void;
};

/** 把每台公車歸到最近的站 */
function busesByStop(stops: readonly Stop[], buses: readonly LiveBus[]): Map<number, LiveBus[]> {
  const result = new Map<number, LiveBus[]>();
  for (const bus of buses) {
    const index = nearestStopIndex(stops, bus.position);
    if (index >= 0) result.set(index, [...(result.get(index) ?? []), bus]);
  }
  return result;
}

export function StopList({ stops, direction, live, selectedStopUid, onSelect }: Props) {
  const listRef = useRef<HTMLOListElement>(null);

  const busMap = useMemo(
    () =>
      busesByStop(
        stops,
        (live?.buses ?? []).filter((b) => b.direction === direction),
      ),
    [stops, live, direction],
  );

  // 從地圖點站牌時，把列表捲到那一站
  useEffect(() => {
    if (!selectedStopUid) return;
    const list = listRef.current;
    const container = list?.closest<HTMLElement>("[data-scroll-container]");
    const row = list?.querySelector<HTMLElement>(`[data-stop="${CSS.escape(selectedStopUid)}"]`);
    if (container && row) scrollRowIntoView(container, row);
  }, [selectedStopUid]);

  return (
    <ol ref={listRef} className="pb-8">
      {stops.map((stop, index) => {
        const eta = live?.etas[etaKey(direction, stop.uid)];
        const busesHere = busMap.get(index) ?? [];
        const isSelected = stop.uid === selectedStopUid;
        const isFirst = index === 0;
        const isLast = index === stops.length - 1;

        return (
          <li key={stop.uid} data-stop={stop.uid}>
            <button
              type="button"
              onClick={() => onSelect(stop.uid)}
              aria-current={isSelected ? "location" : undefined}
              className={`grid w-full grid-cols-[36px_1fr_auto] items-center gap-x-2 rounded-xl pr-3 text-left transition-colors focus-visible:outline-none ${
                isSelected ? "bg-route-soft" : "hover:bg-surface-sunken focus-visible:bg-surface-sunken"
              }`}
            >
              <span className="relative flex h-full min-h-[52px] items-center justify-center" aria-hidden>
                <span
                  className={`absolute left-1/2 w-1 -translate-x-1/2 bg-route ${isFirst ? "top-1/2" : "top-0"} ${
                    isLast ? "bottom-1/2" : "bottom-0"
                  }`}
                />
                {busesHere.length > 0 ? (
                  <span className="relative z-[1] grid size-6 place-items-center rounded-full bg-fg text-surface-solid shadow-md ring-2 ring-surface-solid">
                    <BusIcon width={14} height={14} />
                  </span>
                ) : (
                  <span
                    className={`relative z-[1] rounded-full border-[3px] ${
                      isFirst
                        ? "size-3.5 border-terminal-start bg-terminal-start"
                        : isLast
                          ? "size-3.5 border-terminal-end bg-terminal-end"
                          : "size-3 border-route bg-surface-solid"
                    }`}
                  />
                )}
              </span>

              <span className="min-w-0 py-2.5">
                <span className="flex items-center gap-1.5">
                  <span className={`truncate text-[15px] ${isSelected || isFirst || isLast ? "font-semibold" : ""}`}>
                    {stop.name}
                  </span>
                  {(isFirst || isLast) && (
                    <span
                      className={`shrink-0 rounded px-1 text-[10px] leading-4 font-semibold text-white ${
                        isFirst ? "bg-terminal-start" : "bg-terminal-end"
                      }`}
                    >
                      {isFirst ? "起站" : "迄站"}
                    </span>
                  )}
                </span>
                {busesHere.length > 0 && (
                  <span className="block truncate text-[11px] text-fg-subtle tabular-nums">
                    {busesHere.map((b) => b.plate).join("・")}
                  </span>
                )}
              </span>

              <EtaChip eta={formatEta(eta)} isLastBus={eta?.isLastBus ?? false} />
            </button>
          </li>
        );
      })}
    </ol>
  );
}
