"use client";

import type { ReactNode } from "react";
import { formatEta } from "@/lib/eta";
import { EtaChip } from "../EtaChip";
import { RouteBadge } from "../RouteBadge";
import { POINT_DOT_COLORS } from "./PlaceField";
import type { PlanLeg, PointBusInfo } from "./trip";
import type { BoardEta } from "./types";

type Props = {
  info: PointBusInfo;
  /** 從這裡出發那一段的即時到站；hover 不會觸發查詢，查過才有 */
  boardEta: BoardEta;
};

/** 地圖上 hover 起點、經過點、終點時的資訊卡：在這裡要搭哪班公車 */
export function PlanPointPopup({ info, boardEta }: Props) {
  return (
    <div className="w-64 font-sans text-[13px] leading-relaxed text-fg">
      <p className="flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.08em] text-fg-subtle">
        <span aria-hidden className={`size-2 rounded-full ${POINT_DOT_COLORS[info.kind]}`} />
        {info.title}
      </p>
      <p className="truncate text-sm font-semibold">{info.name}</p>
      <div className="mt-2 border-t border-line pt-2">
        {info.kind === "destination" ? (
          <Arrival leg={info.arrival} />
        ) : (
          <Departure leg={info.departure} boardEta={boardEta} />
        )}
      </div>
    </div>
  );
}

const Muted = ({ children }: { children: ReactNode }) => <p className="text-fg-muted">{children}</p>;

const Place = ({ name }: { name: string }) => <strong className="font-semibold text-fg">「{name}」</strong>;

function Departure({ leg, boardEta }: { leg: PlanLeg | undefined; boardEta: BoardEta }) {
  if (!leg) return <Muted>選好終點後，這裡會顯示要搭的公車</Muted>;
  if (!leg.result) return <Muted>規劃中…</Muted>;
  const { option, ride } = leg;
  if (!option || !ride) return <Muted>這一段附近找不到直達的公車</Muted>;

  const others = option.rides.filter((r) => r !== ride).map((r) => r.route.name);
  return (
    <>
      <div className="flex items-center gap-2">
        <RouteBadge name={ride.route.name} variant="route" />
        <span className="min-w-0 flex-1 truncate">{ride.headsign}</span>
        <NextBus state={boardEta} />
      </div>
      <p className="mt-1.5 text-fg-muted">
        步行 {option.board.walkMeters} 公尺到
        <Place name={option.board.name} />
        上車，坐 {ride.stopCount} 站到
        <Place name={option.alight.name} />
        下車
      </p>
      {others.length > 0 && <p className="mt-1 text-xs text-fg-subtle">也可搭 {others.join("、")}</p>}
    </>
  );
}

function NextBus({ state }: { state: BoardEta }) {
  if (state.status === "idle") return null;
  return (
    <span className="flex shrink-0 items-center gap-1 text-xs text-fg-muted">
      下一班
      {state.status === "ready" && state.eta ? (
        <EtaChip eta={formatEta(state.eta)} isLastBus={state.eta.isLastBus} />
      ) : (
        <span>{state.status === "loading" ? "查詢中…" : state.status === "error" ? "暫時無法取得" : "—"}</span>
      )}
    </span>
  );
}

function Arrival({ leg }: { leg: PlanLeg | undefined }) {
  if (!leg) return <Muted>選好起點後，這裡會顯示要搭的公車</Muted>;
  if (!leg.result) return <Muted>規劃中…</Muted>;
  const { option, ride } = leg;
  if (!option || !ride) return <Muted>最後一段附近找不到直達的公車</Muted>;

  return (
    <div className="flex items-start gap-2">
      <RouteBadge name={ride.route.name} variant="route" />
      <p className="text-fg-muted">
        在<Place name={option.alight.name} />
        下車，步行 {option.alight.walkMeters} 公尺到達
      </p>
    </div>
  );
}
