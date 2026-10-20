import type { StopEta } from "./types";

export type EtaTone = "arriving" | "soon" | "normal" | "muted";

export interface EtaDisplay {
  label: string;
  tone: EtaTone;
  /** tone 為 normal 時的整數分鐘，給畫面放大顯示用 */
  minutes?: number;
}

const ARRIVING_SEC = 60;
const SOON_SEC = 180;

const STATUS_LABELS: Record<number, string> = {
  2: "交管不停靠",
  3: "末班已過",
  4: "今日未營運",
};

const taipeiTime = new Intl.DateTimeFormat("zh-TW", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "Asia/Taipei",
});

function formatTime(iso: string): string | null {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : taipeiTime.format(date);
}

export function formatEta(eta: StopEta | undefined): EtaDisplay {
  if (!eta) return { label: "—", tone: "muted" };

  const statusLabel = STATUS_LABELS[eta.status];
  if (statusLabel) return { label: statusLabel, tone: "muted" };

  if (eta.status === 1 || eta.estimateSec === null) {
    const next = eta.nextBusTime ? formatTime(eta.nextBusTime) : null;
    if (next) return { label: `${next} 發車`, tone: "muted" };
    return { label: eta.status === 1 ? "尚未發車" : "—", tone: "muted" };
  }

  if (eta.estimateSec < ARRIVING_SEC) return { label: "進站中", tone: "arriving" };
  if (eta.estimateSec < SOON_SEC) return { label: "即將到站", tone: "soon" };

  const minutes = Math.floor(eta.estimateSec / 60);
  return { label: `${minutes} 分${eta.isLastBus ? "・末班" : ""}`, tone: "normal", minutes };
}
