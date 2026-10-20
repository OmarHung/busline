"use client";

import { useState } from "react";
import type { LngLat, Place, PlanResult, RouteSummary } from "@/lib/types";
import { useDebouncedValue, usePlaces, type LocateStatus } from "../../hooks";
import { SwapVerticalIcon } from "../../icons";
import { PlaceField } from "./PlaceField";
import { PlanResults, type BoardEta, type PlanSelection } from "./PlanResults";
import { Suggestions } from "./Suggestions";
import type { PlanField, PlanPoint } from "./types";

const SEARCH_DEBOUNCE_MS = 250;

type Props = {
  origin: PlanPoint | null;
  destination: PlanPoint | null;
  onPointChange: (field: PlanField, point: PlanPoint | null) => void;
  onSwap: () => void;
  locateStatus: LocateStatus;
  onUseCurrentLocation: () => void;
  /** 搜尋地點時優先找這附近 */
  near: LngLat | null;
  result: PlanResult | undefined;
  isPlanning: boolean;
  planError: Error | undefined;
  onRetryPlan: () => void;
  selection: PlanSelection | null;
  onSelect: (selection: PlanSelection) => void;
  boardEta: BoardEta;
  onRequestBoardEta: () => void;
  onOpenRoute: (route: RouteSummary) => void;
  onEditStart: () => void;
  /** 選好地點後（手機版會收起面板讓地圖露出來） */
  onEditEnd: () => void;
};

export function PlanView(props: Props) {
  const { origin, destination, onPointChange, onSwap, near, onEditStart, onEditEnd } = props;
  const [activeField, setActiveField] = useState<PlanField | null>(null);
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query, SEARCH_DEBOUNCE_MS);
  const places = usePlaces(activeField ? debouncedQuery : "", near);

  const activate = (field: PlanField) => {
    if (activeField !== field) setQuery("");
    setActiveField(field);
    onEditStart();
  };
  const finish = () => {
    setActiveField(null);
    setQuery("");
  };
  const pick = (place: Place) => {
    if (!activeField) return;
    onPointChange(activeField, { name: place.name, position: place.position });
    finish();
    onEditEnd();
  };
  const pickFirst = () => {
    const first = places.data?.places[0];
    if (first && query.trim()) pick(first);
  };

  const fieldProps = (field: PlanField) => ({
    field,
    point: field === "origin" ? origin : destination,
    isActive: activeField === field,
    query,
    onActivate: () => activate(field),
    onQueryChange: setQuery,
    onClear: () => {
      onPointChange(field, null);
      activate(field);
    },
    onCancel: finish,
    onSubmit: pickFirst,
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="px-5 pt-1 pb-3">
        <div className="relative flex items-center gap-2">
          {/* 起點與終點之間的連接虛線 */}
          <span
            aria-hidden
            className="absolute top-[30%] bottom-[30%] left-[5px] border-l-2 border-dotted border-fg-subtle/50"
          />
          <div className="min-w-0 flex-1">
            <PlaceField {...fieldProps("origin")} />
            <PlaceField {...fieldProps("destination")} />
          </div>
          <button
            type="button"
            onClick={onSwap}
            aria-label="交換起點與終點"
            className="grid size-9 shrink-0 place-items-center rounded-full text-fg-muted transition hover:bg-surface-sunken hover:text-fg"
          >
            <SwapVerticalIcon width={18} height={18} />
          </button>
        </div>
      </header>

      <div
        data-scroll-container
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain border-t border-line pt-3"
      >
        {activeField ? (
          <Suggestions
            query={query}
            places={places.data?.places}
            isLoading={places.isLoading}
            error={places.error}
            showCurrentLocation={activeField === "origin"}
            locateStatus={props.locateStatus}
            onPickCurrentLocation={() => {
              props.onUseCurrentLocation();
              finish();
            }}
            onPick={pick}
            onCancel={finish}
          />
        ) : !origin || !destination ? (
          <EmptyHint missing={!origin ? "origin" : "destination"} locateStatus={props.locateStatus} />
        ) : (
          <PlanResults
            result={props.result}
            isLoading={props.isPlanning}
            error={props.planError}
            onRetry={props.onRetryPlan}
            selection={props.selection}
            onSelect={props.onSelect}
            boardEta={props.boardEta}
            onRequestBoardEta={props.onRequestBoardEta}
            onOpenRoute={props.onOpenRoute}
          />
        )}
      </div>
    </div>
  );
}

function EmptyHint({ missing, locateStatus }: { missing: PlanField; locateStatus: LocateStatus }) {
  const message =
    missing === "destination"
      ? "輸入想去的地點，例如「台北101」「師大夜市」或公車站名，會列出不用轉乘的公車。"
      : locateStatus === "locating"
        ? "正在取得目前位置…"
        : "輸入起點，或在起點欄位選「目前位置」。";
  return <p className="px-6 py-6 text-sm leading-relaxed text-fg-muted">{message}</p>;
}
