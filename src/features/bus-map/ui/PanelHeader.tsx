import { BusIcon } from "../icons";

export type PanelMode = "routes" | "nearby" | "plan";

const MODES: Array<{ value: PanelMode; label: string }> = [
  { value: "routes", label: "找路線" },
  { value: "nearby", label: "附近站牌" },
  { value: "plan", label: "路線規劃" },
];

type Props = {
  mode: PanelMode;
  onModeChange: (mode: PanelMode) => void;
};

export function PanelHeader({ mode, onModeChange }: Props) {
  return (
    <div className="px-5 pt-3 pb-3 md:pt-6">
      <div className="flex items-center gap-2.5">
        <span className="grid size-9 place-items-center rounded-[10px] bg-route text-route-ink shadow-sm">
          <BusIcon width={20} height={20} />
        </span>
        <div className="leading-tight">
          <h1 className="text-[17px] font-semibold tracking-tight">公車路線圖</h1>
          <p className="text-xs text-fg-subtle">全台市區公車・公路客運</p>
        </div>
      </div>

      {/* 三個分頁放在標題旁邊會超出手機寬度，所以獨立一列、等寬排列 */}
      <div role="tablist" aria-label="功能" className="mt-3 grid grid-cols-3 rounded-[10px] bg-surface-sunken p-0.5">
        {MODES.map(({ value, label }) => {
          const isActive = value === mode;
          return (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => onModeChange(value)}
              className={`rounded-[8px] px-2 py-1.5 text-[13px] transition ${
                isActive ? "bg-surface-solid font-semibold text-fg shadow-sm" : "text-fg-muted hover:text-fg"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
