import type { ReactNode } from "react";

/** 手機版底部面板收合時露出的高度比例；地圖縮放時也要避開這塊 */
export const SHEET_COLLAPSED_RATIO = 0.44;

type Props = {
  isExpanded: boolean;
  onToggle: () => void;
  children: ReactNode;
};

/**
 * 桌機：浮在地圖左側的卡片。
 * 手機：底部面板，點把手展開／收合（用 transform 移動，不改高度）。
 */
export function Panel({ isExpanded, onToggle, children }: Props) {
  return (
    <aside
      data-sheet={isExpanded ? "expanded" : "collapsed"}
      className={[
        "absolute z-10 flex flex-col overflow-clip border border-line bg-surface shadow-panel backdrop-blur-xl backdrop-saturate-150",
        "inset-x-0 bottom-0 h-[88dvh] rounded-t-[22px] transition-transform duration-300 ease-(--ease-out)",
        isExpanded ? "translate-y-0" : "translate-y-[calc(88dvh-44dvh)]",
        "md:inset-x-auto md:top-4 md:bottom-4 md:left-4 md:h-auto md:w-[388px] md:translate-y-0 md:rounded-[22px]",
      ].join(" ")}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-label={isExpanded ? "收合面板" : "展開面板"}
        aria-expanded={isExpanded}
        className="flex w-full shrink-0 justify-center pt-2.5 pb-1 md:hidden"
      >
        <span className="h-1.5 w-10 rounded-full bg-fg-subtle/40" />
      </button>
      {children}
    </aside>
  );
}
