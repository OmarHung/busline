"use client";

import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  MeasuringStrategy,
  PointerSensor,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import { restrictToParentElement, restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useId, useRef, useState } from "react";
import type { LngLat, Place, PlanRide } from "@/lib/types";
import { useDebouncedValue, usePlaces, type LocateStatus } from "../../hooks";
import { PlusIcon, SwapVerticalIcon } from "../../icons";
import { PlaceField } from "./PlaceField";
import { PlanResults } from "./PlanResults";
import { Suggestions } from "./Suggestions";
import { pointKind, pointTitle, type PlanLeg } from "./trip";
import type { BoardEta, PlanPoint, PlanSelection } from "./types";

const SEARCH_DEBOUNCE_MS = 250;
/** 拖曳把手要移動幾像素才開始拖，避免點一下就被當成拖曳 */
const DRAG_ACTIVATION_PX = 4;
const DRAG_MODIFIERS = [restrictToVerticalAxis, restrictToParentElement];
/** 只有幾列，拖曳前就量好各列位置；預設要等拖曳開始才量，拿起後第一次按方向鍵可能因為還沒量好而沒反應 */
const DRAG_MEASURING = { droppable: { strategy: MeasuringStrategy.Always } };
const SCREEN_READER_INSTRUCTIONS = {
  draggable: "按空白鍵或 Enter 拿起，用上下方向鍵移動，再按一次空白鍵或 Enter 放下，按 Esc 取消。",
};

/** 點進已選好的欄位時帶入原本的名稱讓人修改；「目前位置」不是地名，從空白開始 */
const editableText = (point: PlanPoint | null) => (point && !point.isCurrentLocation ? point.name : "");

type Props = {
  /** 依序為起點、經過點…、終點；還沒選的是 null */
  points: ReadonlyArray<PlanPoint | null>;
  /** 與 points 對應、不隨順序改變的 id（拖曳排序用） */
  slotIds: string[];
  onPointChange: (index: number, point: PlanPoint | null) => void;
  /** 拖曳排序：把 from 位置的地點移到 to */
  onMove: (from: number, to: number) => void;
  canAddWaypoint: boolean;
  /** 回傳新經過點的位置；已達上限時回傳 null */
  onAddWaypoint: () => number | null;
  onRemoveWaypoint: (index: number) => void;
  onReverse: () => void;
  locateStatus: LocateStatus;
  onUseCurrentLocation: () => void;
  /** 搜尋地點時優先找這附近 */
  near: LngLat | null;
  legs: readonly PlanLeg[];
  isPlanning: boolean;
  planError: Error | undefined;
  onRetryPlan: () => void;
  onSelect: (leg: number, selection: PlanSelection) => void;
  /** 與 legs 對應，各段上車站的即時到站 */
  boardEtas: readonly BoardEta[];
  onRequestBoardEta: (leg: number) => void;
  onOpenRoute: (ride: PlanRide) => void;
  onEditStart: () => void;
  /** 選好地點後（手機版會收起面板讓地圖露出來） */
  onEditEnd: () => void;
};

export function PlanView(props: Props) {
  const { points, slotIds, onPointChange, near, onEditStart, onEditEnd } = props;
  const dndId = useId();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: DRAG_ACTIVATION_PX } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const [activeField, setActiveField] = useState<number | null>(null);
  /** 拖曳中最後報讀的位置；拿起時 dnd-kit 會先觸發一次「移到自己的位置」，不能蓋掉「已拿起」 */
  const announcedPosition = useRef<number | null>(null);
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query, SEARCH_DEBOUNCE_MS);
  const places = usePlaces(activeField !== null ? debouncedQuery : "", near);
  const hasWaypoints = points.length > 2;

  const activate = (field: number) => {
    if (activeField !== field) setQuery(editableText(points[field]));
    setActiveField(field);
    onEditStart();
  };
  const finish = () => {
    setActiveField(null);
    setQuery("");
  };
  const pick = (place: Place) => {
    if (activeField === null) return;
    onPointChange(activeField, { name: place.name, position: place.position });
    finish();
    onEditEnd();
  };
  const pickFirst = () => {
    // 沒改字就按 Enter：保留原本的地點，不換成同名的另一個結果
    const current = activeField !== null ? points[activeField] : null;
    if (current && query.trim() === editableText(current)) {
      finish();
      onEditEnd();
      return;
    }
    const first = places.data?.places[0];
    if (first && query.trim()) pick(first);
  };
  const addWaypoint = () => {
    const index = props.onAddWaypoint();
    if (index !== null) activate(index);
  };
  // 順序改變後欄位的位置都不同了，先結束編輯
  const reverse = () => {
    finish();
    props.onReverse();
  };
  const moveTo = ({ active, over }: DragEndEvent) => {
    const from = slotIds.indexOf(String(active.id));
    const to = over ? slotIds.indexOf(String(over.id)) : -1;
    if (from >= 0 && to >= 0 && from !== to) props.onMove(from, to);
  };

  const describe = (id: UniqueIdentifier) => {
    const index = slotIds.indexOf(String(id));
    return `${pointTitle(pointKind(index, points.length), index)}「${points[index]?.name ?? "未填"}」`;
  };
  const position = (id: UniqueIdentifier) => `第 ${slotIds.indexOf(String(id)) + 1} 個位置`;
  const announcements: Announcements = {
    onDragStart: ({ active }) => {
      announcedPosition.current = slotIds.indexOf(String(active.id));
      return `已拿起${describe(active.id)}，目前在${position(active.id)}`;
    },
    onDragOver: ({ active, over }) => {
      const index = over ? slotIds.indexOf(String(over.id)) : -1;
      if (index < 0 || index === announcedPosition.current) return undefined;
      announcedPosition.current = index;
      return `${describe(active.id)}移到第 ${index + 1} 個位置`;
    },
    onDragEnd: ({ active, over }) => (over ? `${describe(active.id)}已放到${position(over.id)}` : "已放下"),
    onDragCancel: ({ active }) => `已取消移動${describe(active.id)}`,
  };

  const fieldProps = (index: number) => {
    const kind = pointKind(index, points.length);
    return {
      kind,
      index,
      point: points[index],
      isActive: activeField === index,
      query,
      onActivate: () => activate(index),
      onQueryChange: setQuery,
      onClear:
        kind === "via"
          ? () => {
              finish();
              props.onRemoveWaypoint(index);
            }
          : () => {
              onPointChange(index, null);
              activate(index);
              setQuery("");
            },
      onCancel: finish,
      onSubmit: pickFirst,
    };
  };

  const origin = points[0];
  const destination = points[points.length - 1];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="px-5 pt-1 pb-3">
        <div className="relative flex items-center gap-2">
          {/* 串起各地點的虛線：從第一個圓點到最後一個圓點（每列高 52px） */}
          <span
            aria-hidden
            className="absolute top-[26px] bottom-[26px] left-[5px] border-l-2 border-dotted border-fg-subtle/50"
          />
          <div className="min-w-0 flex-1">
            <DndContext
              id={dndId}
              sensors={sensors}
              collisionDetection={closestCenter}
              modifiers={DRAG_MODIFIERS}
              measuring={DRAG_MEASURING}
              accessibility={{ announcements, screenReaderInstructions: SCREEN_READER_INSTRUCTIONS }}
              onDragStart={finish}
              onDragEnd={moveTo}
            >
              <SortableContext items={slotIds} strategy={verticalListSortingStrategy}>
                {points.map((_, index) => (
                  <PlaceField
                    key={slotIds[index]}
                    id={slotIds[index]}
                    isSortable={hasWaypoints}
                    {...fieldProps(index)}
                  />
                ))}
              </SortableContext>
            </DndContext>
          </div>
          <button
            type="button"
            onClick={reverse}
            aria-label={hasWaypoints ? "反轉行程順序" : "交換起點與終點"}
            className="grid size-9 shrink-0 place-items-center rounded-full text-fg-muted transition hover:bg-surface-sunken hover:text-fg"
          >
            <SwapVerticalIcon width={18} height={18} />
          </button>
        </div>
        {props.canAddWaypoint && (
          <button
            type="button"
            onClick={addWaypoint}
            className="mt-1 -ml-1 flex items-center gap-2 rounded-lg py-1 pr-2 pl-1 text-sm text-fg-muted transition hover:bg-surface-sunken hover:text-route"
          >
            <PlusIcon width={16} height={16} />
            新增經過點
          </button>
        )}
      </header>

      <div
        data-scroll-container
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain border-t border-line pt-3"
      >
        {activeField !== null ? (
          <Suggestions
            query={query}
            places={places.data?.places}
            isLoading={places.isLoading}
            error={places.error}
            showCurrentLocation={activeField === 0}
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
            legs={props.legs}
            isLoading={props.isPlanning}
            error={props.planError}
            onRetry={props.onRetryPlan}
            onSelect={props.onSelect}
            boardEtas={props.boardEtas}
            onRequestBoardEta={props.onRequestBoardEta}
            onOpenRoute={props.onOpenRoute}
          />
        )}
      </div>
    </div>
  );
}

function EmptyHint({ missing, locateStatus }: { missing: "origin" | "destination"; locateStatus: LocateStatus }) {
  const message =
    missing === "destination"
      ? "輸入想去的地點，例如「台北101」「師大夜市」或公車站名，會列出不用轉乘的公車；要順路去別的地方，可以新增經過點。"
      : locateStatus === "locating"
        ? "正在取得目前位置…"
        : "輸入起點，或在起點欄位選「目前位置」。";
  return <p className="px-6 py-6 text-sm leading-relaxed text-fg-muted">{message}</p>;
}
