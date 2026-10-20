"use client";

import { useMemo, type KeyboardEvent } from "react";
import { searchRoutes } from "@/lib/search";
import type { RouteIndex, RouteSummary } from "@/lib/types";
import { AlertIcon, CloseIcon, SearchIcon } from "../icons";
import { RouteBadge } from "./RouteBadge";

const EXAMPLES = ["307", "紅5", "1610", "綠1"];

type Props = {
  index: RouteIndex | undefined;
  isLoading: boolean;
  error: Error | undefined;
  onRetry: () => void;
  query: string;
  onQueryChange: (query: string) => void;
  onSelect: (route: RouteSummary) => void;
  onFocus: () => void;
};

export function SearchView({ index, isLoading, error, onRetry, query, onQueryChange, onSelect, onFocus }: Props) {
  const groups = useMemo(() => (index ? searchRoutes(index.routes, query) : []), [index, query]);

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && groups[0]?.routes[0]) onSelect(groups[0].routes[0]);
    if (e.key === "Escape") onQueryChange("");
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="px-5 pt-1 pb-4">
        <label className="group relative block">
          <span className="sr-only">搜尋路線</span>
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-fg-subtle transition-colors group-focus-within:text-route" />
          <input
            type="search"
            inputMode="search"
            enterKeyHint="search"
            autoComplete="off"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={onFocus}
            placeholder="路線號碼或起訖站，例如 307"
            className="h-12 w-full rounded-[14px] border border-transparent bg-surface-sunken pr-11 pl-11 text-[16px] outline-none transition placeholder:text-fg-subtle focus:border-route focus:bg-surface-solid focus:ring-4 focus:ring-route-soft [&::-webkit-search-cancel-button]:hidden"
          />
          {query && (
            <button
              type="button"
              onClick={() => onQueryChange("")}
              aria-label="清除搜尋"
              className="absolute top-1/2 right-2 grid size-8 -translate-y-1/2 place-items-center rounded-full text-fg-subtle hover:bg-line hover:text-fg"
            >
              <CloseIcon width={16} height={16} />
            </button>
          )}
        </label>
      </header>

      <div data-scroll-container className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-6">
        {error && !index ? (
          <ErrorState message={error.message} onRetry={onRetry} />
        ) : !query.trim() ? (
          <Hint isLoading={isLoading} generatedAt={index?.generatedAt} onPick={onQueryChange} />
        ) : isLoading ? (
          <LoadingRows />
        ) : groups.length === 0 ? (
          <p className="px-3 py-10 text-center text-sm text-fg-muted">找不到「{query.trim()}」相關的路線</p>
        ) : (
          groups.map((group) => (
            <section key={group.cityCode} className="mb-2" aria-label={group.cityName}>
              <h2 className="sticky top-0 z-[1] flex items-baseline justify-between bg-surface-solid/0 px-3 pt-3 pb-1.5 text-[11px] font-semibold tracking-[0.12em] text-fg-subtle backdrop-blur-md">
                {group.cityName}
                <span className="font-normal tracking-normal">{group.routes.length}</span>
              </h2>
              <ul>
                {group.routes.map((route) => (
                  <li key={route.uid}>
                    <button
                      type="button"
                      onClick={() => onSelect(route)}
                      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-surface-sunken focus-visible:bg-route-soft focus-visible:outline-none active:scale-[0.99]"
                    >
                      <RouteBadge name={route.name} />
                      <span className="min-w-0 flex-1 truncate text-sm text-fg-muted">
                        {route.from && route.to ? (
                          <>
                            {route.from}
                            <span className="mx-1.5 text-fg-subtle">⇄</span>
                            {route.to}
                          </>
                        ) : (
                          route.from || route.to
                        )}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </div>
    </div>
  );
}

const dateFormat = new Intl.DateTimeFormat("zh-TW", { dateStyle: "medium", timeZone: "Asia/Taipei" });

type HintProps = {
  isLoading: boolean;
  generatedAt: string | undefined;
  onPick: (q: string) => void;
};

function Hint({ isLoading, generatedAt, onPick }: HintProps) {
  return (
    <div className="px-3 pt-2">
      <p className="mb-3 text-sm text-fg-muted">
        {isLoading ? "正在載入全台路線資料…" : "輸入路線號碼，或起點、終點站名。"}
      </p>
      <div className="flex flex-wrap gap-2">
        {EXAMPLES.map((example) => (
          <button
            key={example}
            type="button"
            onClick={() => onPick(example)}
            className="rounded-full border border-line bg-surface-solid px-3.5 py-1.5 font-sign text-[15px] font-semibold transition hover:border-route hover:text-route"
          >
            {example}
          </button>
        ))}
      </div>
      {generatedAt && (
        <p className="mt-6 text-xs text-fg-subtle">路線資料更新於 {dateFormat.format(new Date(generatedAt))}</p>
      )}
    </div>
  );
}

function LoadingRows() {
  return (
    <div className="space-y-1 px-3 pt-3" aria-busy="true" aria-label="載入中">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="flex items-center gap-3 py-2.5">
          <span className="h-7 w-13 animate-pulse rounded-[7px] bg-surface-sunken" />
          <span className="h-3.5 flex-1 animate-pulse rounded bg-surface-sunken" />
        </div>
      ))}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
      <AlertIcon className="text-arriving" />
      <p className="text-sm text-fg-muted">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="rounded-full bg-fg px-4 py-1.5 text-sm font-medium text-surface-solid hover:opacity-90"
      >
        重試
      </button>
    </div>
  );
}
