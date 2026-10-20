"use client";

import type { KeyboardEvent } from "react";
import { CloseIcon } from "../../icons";
import type { PlanField, PlanPoint } from "./types";

const LABELS: Record<PlanField, { label: string; placeholder: string }> = {
  origin: { label: "起點", placeholder: "輸入起點" },
  destination: { label: "終點", placeholder: "想去哪裡？地點、地標或站名" },
};

type Props = {
  field: PlanField;
  point: PlanPoint | null;
  isActive: boolean;
  query: string;
  onActivate: () => void;
  onQueryChange: (query: string) => void;
  onClear: () => void;
  onCancel: () => void;
  onSubmit: () => void;
};

/** 起點／終點輸入框；編輯時顯示關鍵字，平常顯示選好的地點名稱 */
export function PlaceField({
  field,
  point,
  isActive,
  query,
  onActivate,
  onQueryChange,
  onClear,
  onCancel,
  onSubmit,
}: Props) {
  const { label, placeholder } = LABELS[field];
  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") onCancel();
    if (e.key === "Enter") onSubmit();
  };

  return (
    <label className="relative flex items-center gap-3 py-1">
      <span
        aria-hidden
        className={`relative z-[1] size-3 shrink-0 rounded-full ring-[3px] ring-surface-solid ${
          field === "origin" ? "bg-terminal-start" : "bg-terminal-end"
        }`}
      />
      <span className="sr-only">{label}</span>
      <input
        type="search"
        enterKeyHint="search"
        autoComplete="off"
        value={isActive ? query : (point?.name ?? "")}
        placeholder={isActive && point ? point.name : placeholder}
        onFocus={onActivate}
        onChange={(e) => onQueryChange(e.target.value)}
        onKeyDown={handleKeyDown}
        className={`h-11 min-w-0 flex-1 rounded-[12px] border bg-surface-sunken px-3 text-[16px] outline-none transition placeholder:text-fg-subtle [&::-webkit-search-cancel-button]:hidden ${
          isActive ? "border-route bg-surface-solid ring-4 ring-route-soft" : "border-transparent"
        } ${point?.isCurrentLocation && !isActive ? "text-route" : ""}`}
      />
      {(point || (isActive && query)) && (
        <button
          type="button"
          onClick={onClear}
          aria-label={`清除${label}`}
          className="absolute right-1.5 grid size-8 place-items-center rounded-full text-fg-subtle hover:bg-line hover:text-fg"
        >
          <CloseIcon width={15} height={15} />
        </button>
      )}
    </label>
  );
}
