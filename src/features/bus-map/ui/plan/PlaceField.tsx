"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useEffect, useRef, type KeyboardEvent } from "react";
import { CloseIcon, GripIcon } from "../../icons";
import { pointTitle } from "./trip";
import type { PlanPoint, PointKind } from "./types";

const PLACEHOLDERS: Record<PointKind, string> = {
  origin: "輸入起點",
  via: "順路經過的地點",
  destination: "想去哪裡？地點、地標或站名",
};

/** 地點的顏色，和地圖上的起、終、經過點標記一致 */
export const POINT_DOT_COLORS: Record<PointKind, string> = {
  origin: "bg-terminal-start",
  via: "bg-waypoint",
  destination: "bg-terminal-end",
};

type Props = {
  /** 拖曳排序用的穩定 id */
  id: string;
  kind: PointKind;
  /** 在地點列表中的位置；經過點的編號 */
  index: number;
  point: PlanPoint | null;
  /** 有經過點時才能拖曳排序（只有起終點時用交換按鈕） */
  isSortable: boolean;
  isActive: boolean;
  query: string;
  onActivate: () => void;
  onQueryChange: (query: string) => void;
  /** 起點、終點是清除內容；經過點是整個移除 */
  onClear: () => void;
  onCancel: () => void;
  onSubmit: () => void;
};

/** 起點／經過點／終點輸入框；編輯時顯示可修改的文字，平常顯示選好的地點名稱 */
export function PlaceField({
  id,
  kind,
  index,
  point,
  isSortable,
  isActive,
  query,
  onActivate,
  onQueryChange,
  onClear,
  onCancel,
  onSubmit,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const label = pointTitle(kind, index);
  const isVia = kind === "via";
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled: !isSortable,
  });

  // 焦點跟著編輯狀態：程式指定編輯時（新增經過點）移進來；選好或取消後移出，
  // 否則焦點還在、卻不在編輯狀態，繼續打字畫面不會變（手機也會順便收起鍵盤）
  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    if (isActive) input.focus();
    else if (document.activeElement === input) input.blur();
  }, [isActive]);

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") onCancel();
    if (e.key === "Enter") onSubmit();
  };

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`relative flex items-center gap-1 rounded-[14px] ${isDragging ? "z-10 bg-surface-solid shadow-panel" : ""}`}
    >
      <label className="flex min-w-0 flex-1 items-center gap-3 py-1">
        <span
          aria-hidden
          className={`relative z-[1] size-3 shrink-0 rounded-full ring-[3px] ring-surface-solid ${POINT_DOT_COLORS[kind]}`}
        />
        <span className="sr-only">{label}</span>
        <input
          ref={inputRef}
          type="search"
          enterKeyHint="search"
          autoComplete="off"
          value={isActive ? query : (point?.name ?? "")}
          placeholder={isActive && point ? point.name : PLACEHOLDERS[kind]}
          onFocus={onActivate}
          onChange={(e) => onQueryChange(e.target.value)}
          onKeyDown={handleKeyDown}
          className={`h-11 min-w-0 flex-1 rounded-[12px] border bg-surface-sunken pr-10 pl-3 text-[16px] outline-none transition placeholder:text-fg-subtle [&::-webkit-search-cancel-button]:hidden ${
            isActive ? "border-route bg-surface-solid ring-4 ring-route-soft" : "border-transparent"
          } ${point?.isCurrentLocation && !isActive ? "text-route" : ""}`}
        />
      </label>
      {/* 放在 label 外面，按鈕的名稱才不會混進輸入框的名稱 */}
      {(isVia || point || (isActive && query)) && (
        <button
          type="button"
          onClick={onClear}
          aria-label={`${isVia ? "移除" : "清除"}${label}`}
          className={`absolute grid size-8 place-items-center rounded-full text-fg-subtle hover:bg-line hover:text-fg ${
            isSortable ? "right-9" : "right-1.5"
          }`}
        >
          <CloseIcon width={15} height={15} />
        </button>
      )}
      {isSortable && (
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          aria-label={`拖曳排序：${label}`}
          className="grid size-8 shrink-0 cursor-grab touch-none place-items-center rounded-lg text-fg-subtle transition hover:bg-surface-sunken hover:text-fg active:cursor-grabbing"
        >
          <GripIcon width={16} height={16} />
        </button>
      )}
    </div>
  );
}
