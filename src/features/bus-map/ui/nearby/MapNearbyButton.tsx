import { BusIcon } from "../../icons";

/** 地圖放大到這個等級以上才找中心附近的站；縮到整個縣市時「中心附近」沒有意義 */
export const MIN_NEARBY_ZOOM = 13;

type Props = {
  zoom: number;
  onClick: () => void;
};

/** 浮在地圖頂部：用目前地圖畫面的中心找附近的站 */
export function MapNearbyButton({ zoom, onClick }: Props) {
  const isZoomedIn = zoom >= MIN_NEARBY_ZOOM;
  return (
    // 桌機避開左側面板（16 + 388px），手機兩側留給右上角的縮放按鈕
    <div className="pointer-events-none absolute inset-x-0 top-3 z-10 flex justify-center px-14 md:top-4 md:left-[404px]">
      <button
        type="button"
        onClick={onClick}
        disabled={!isZoomedIn}
        className="pointer-events-auto flex items-center gap-1.5 rounded-full border border-line bg-surface-solid px-4 py-2 text-sm font-medium shadow-panel transition hover:border-route hover:text-route active:scale-[0.98] disabled:cursor-default disabled:border-line disabled:text-fg-muted disabled:active:scale-100"
      >
        <BusIcon width={16} height={16} className="shrink-0" />
        {isZoomedIn ? "在地圖上顯示附近站點" : "放大地圖以顯示附近站點"}
      </button>
    </div>
  );
}
