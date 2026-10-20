"use client";

import { useEffect, useState } from "react";
import { CloseIcon, ShareIcon } from "../icons";
import { RouteBadge } from "../ui/RouteBadge";
import { encodeShared, favoriteKey, type Favorite } from "./favorites";

/** 「已複製」的提示顯示多久 */
const FEEDBACK_MS = 3000;

/** 分享連結裡的收藏，等使用者決定要不要匯入；count 為 null 表示連結格式不對 */
export interface ImportOffer {
  count: number | null;
  /** 路線清單載入後才能匯入（要補上路線名稱與起訖站） */
  isReady: boolean;
  onAccept: () => void;
  onDismiss: () => void;
}

type Props = {
  favorites: readonly Favorite[];
  onOpen: (favorite: Favorite) => void;
  onRemove: (key: string) => void;
  importOffer: ImportOffer | null;
};

type ShareResult = { status: "idle" } | { status: "copied" } | { status: "manual"; url: string };

const describeFavorite = (favorite: Favorite) =>
  favorite.kind === "route"
    ? `${favorite.route.from} ⇄ ${favorite.route.to}`
    : `${favorite.stop.name}・${favorite.headsign}`;

/** 手機用系統的分享選單；電腦（或不支援分享選單）直接複製 */
async function shareLink(url: string): Promise<ShareResult["status"]> {
  if (window.matchMedia("(pointer: coarse)").matches && typeof navigator.share === "function") {
    try {
      await navigator.share({ title: "我的公車收藏", url });
      return "idle";
    } catch (error) {
      // 使用者自己關掉分享選單
      if (error instanceof DOMException && error.name === "AbortError") return "idle";
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    return "copied";
  } catch {
    return "manual";
  }
}

export function FavoritesSection({ favorites, onOpen, onRemove, importOffer }: Props) {
  const [share, setShare] = useState<ShareResult>({ status: "idle" });

  useEffect(() => {
    if (share.status !== "copied") return;
    const id = setTimeout(() => setShare({ status: "idle" }), FEEDBACK_MS);
    return () => clearTimeout(id);
  }, [share.status]);

  const handleShare = async () => {
    const url = `${window.location.origin}/?fav=${encodeShared(favorites)}`;
    const status = await shareLink(url);
    setShare(status === "manual" ? { status, url } : { status });
  };

  return (
    <section aria-labelledby="favorites-heading" className="mb-3">
      {importOffer && <ImportBanner offer={importOffer} />}

      <div className="flex items-center justify-between px-3 pt-2 pb-1.5">
        <h2 id="favorites-heading" className="text-[11px] font-semibold tracking-[0.12em] text-fg-subtle">
          收藏
        </h2>
        {favorites.length > 0 && (
          <button
            type="button"
            onClick={() => void handleShare()}
            className="flex items-center gap-1 rounded-full px-2 py-0.5 text-xs text-fg-muted transition hover:bg-surface-sunken hover:text-route"
          >
            <ShareIcon width={13} height={13} />
            分享收藏
          </button>
        )}
      </div>

      {favorites.length === 0 ? (
        <p className="px-3 text-sm text-fg-muted">在路線頁按 ☆ 可以收藏整條路線或其中一站，下次打開就在這裡。</p>
      ) : (
        <ul aria-label="收藏的路線與站牌">
          {favorites.map((favorite) => {
            const key = favoriteKey(favorite);
            const label = `${favorite.route.name} ${describeFavorite(favorite)}`;
            return (
              <li key={key} className="flex items-center">
                <button
                  type="button"
                  onClick={() => onOpen(favorite)}
                  aria-label={label}
                  className="flex min-w-0 flex-1 items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-surface-sunken focus-visible:bg-route-soft focus-visible:outline-none active:scale-[0.99]"
                >
                  <RouteBadge name={favorite.route.name} />
                  {favorite.kind === "route" ? (
                    <span className="min-w-0 flex-1 truncate text-sm text-fg-muted">{describeFavorite(favorite)}</span>
                  ) : (
                    <span className="min-w-0 flex-1 truncate text-sm">
                      <span className="font-medium">{favorite.stop.name}</span>
                      <span className="ml-1.5 text-fg-muted">{favorite.headsign}</span>
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => onRemove(key)}
                  aria-label={`移除收藏：${label}`}
                  className="grid size-9 shrink-0 place-items-center rounded-full text-fg-subtle transition hover:bg-surface-sunken hover:text-fg"
                >
                  <CloseIcon width={15} height={15} />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {share.status === "copied" && (
        <p role="status" className="px-3 pt-1.5 text-xs text-live">
          已複製收藏連結，在其他裝置或瀏覽器打開就能匯入
        </p>
      )}
      {share.status === "manual" && (
        <div className="px-3 pt-2">
          <label className="text-xs text-fg-muted">
            無法自動複製，請手動複製這個連結：
            <input
              readOnly
              value={share.url}
              onFocus={(e) => e.currentTarget.select()}
              className="mt-1 w-full rounded-lg border border-line bg-surface-sunken px-2 py-1.5 text-xs text-fg"
            />
          </label>
        </div>
      )}
    </section>
  );
}

function ImportBanner({ offer }: { offer: ImportOffer }) {
  const isValid = offer.count !== null;
  return (
    <div role="status" className="mx-3 mb-3 rounded-2xl bg-route-soft px-4 py-3">
      <p className="text-sm">
        {isValid ? `這個連結裡有 ${offer.count} 個收藏，要加到這個瀏覽器嗎？` : "這個收藏連結無法讀取，可能不完整。"}
      </p>
      <div className="mt-2 flex gap-2">
        {isValid && (
          <button
            type="button"
            onClick={offer.onAccept}
            disabled={!offer.isReady}
            className="rounded-full bg-route px-3.5 py-1 text-xs font-semibold text-route-ink transition hover:opacity-90 disabled:opacity-60"
          >
            {offer.isReady ? "匯入" : "載入中…"}
          </button>
        )}
        <button
          type="button"
          onClick={offer.onDismiss}
          className="rounded-full px-3 py-1 text-xs text-fg-muted transition hover:bg-surface-solid hover:text-fg"
        >
          {isValid ? "略過" : "關閉"}
        </button>
      </div>
    </div>
  );
}
