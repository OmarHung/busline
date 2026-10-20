"use client";

import { arrayMove } from "@dnd-kit/sortable";
import { useMemo, useState } from "react";
import { MAX_WAYPOINTS } from "@/lib/types";
import { useCurrentPosition, useTripPlan } from "../../hooks";
import { buildLegs, legSelectionKey } from "./trip";
import type { PlanPoint, PlanSelection } from "./types";

const CURRENT_LOCATION_NAME = "目前位置";

const isChosen = (point: PlanPoint | null): point is PlanPoint => point !== null;

/** 一個地點欄位；id 不隨順序改變，拖曳排序時用來追蹤是哪一列 */
interface PlanSlot {
  id: string;
  point: PlanPoint | null;
}

let nextSlotId = 0;
const emptySlot = (): PlanSlot => ({ id: `slot-${nextSlotId++}`, point: null });

/** 路線規劃的地點（起點、經過點、終點）、各段的規劃結果與選取的方案 */
export function usePlanState() {
  // 依序為起點、經過點…、終點；還沒選的 point 是 null（空的經過點規劃時略過）
  const [slots, setSlots] = useState<PlanSlot[]>(() => [emptySlot(), emptySlot()]);
  // 各段的選取，以段的 key 綁定起訖地點；地點改了那一段就回到預設（第一個方案）
  const [choices, setChoices] = useState<Record<string, PlanSelection>>({});
  // 即時到站要呼叫 TDX（每分鐘只有 5 次），使用者按了才查；同時只查一段的一條路線，換一條就要重按
  const [liveKey, setLiveKey] = useState<string | null>(null);
  const locator = useCurrentPosition();

  const points = useMemo(() => slots.map((slot) => slot.point), [slots]);
  const slotIds = useMemo(() => slots.map((slot) => slot.id), [slots]);
  const origin = points[0];
  const destination = points[points.length - 1];
  const isReady = origin !== null && destination !== null;
  const chosen = useMemo(() => points.filter(isChosen), [points]);
  const trip = useTripPlan(isReady ? chosen.map((p) => p.position) : null);
  const legs = useMemo(
    () => (isReady ? buildLegs(chosen, trip.data, choices, liveKey) : []),
    [isReady, chosen, trip.data, choices, liveKey],
  );
  const waypointCount = points.length - 2;

  const setPoint = (index: number, point: PlanPoint | null) =>
    setSlots((prev) => prev.map((slot, i) => (i === index ? { ...slot, point } : slot)));

  /** 在終點前加一個空的經過點，回傳它的位置；已達上限時回傳 null */
  const addWaypoint = (): number | null => {
    if (waypointCount >= MAX_WAYPOINTS) return null;
    setSlots((prev) => [...prev.slice(0, -1), emptySlot(), prev[prev.length - 1]]);
    return points.length - 1;
  };

  const pickCurrentLocation = async () => {
    const position = await locator.locate();
    if (position) setPoint(0, { name: CURRENT_LOCATION_NAME, position, isCurrentLocation: true });
  };

  return {
    points,
    slotIds,
    origin,
    waypointCount,
    canAddWaypoint: waypointCount < MAX_WAYPOINTS,
    setPoint,
    addWaypoint,
    removeWaypoint: (index: number) => setSlots((prev) => prev.filter((_, i) => i !== index)),
    /** 整趟反過來走：起點變終點，經過點的順序也反過來 */
    reverse: () => setSlots((prev) => [...prev].reverse()),
    /** 拖曳排序：排第一的成為起點、最後的成為終點 */
    move: (from: number, to: number) => setSlots((prev) => arrayMove(prev, from, to)),
    locator,
    pickCurrentLocation,
    trip,
    legs,
    select: (leg: number, selection: PlanSelection) => setChoices((prev) => ({ ...prev, [legs[leg].key]: selection })),
    requestLive: (leg: number) => setLiveKey(legSelectionKey(legs[leg])),
  };
}
