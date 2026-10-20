"use client";

import { useState } from "react";
import { useCurrentPosition, usePlan } from "../../hooks";
import type { PlanSelection } from "./PlanResults";
import type { PlanField, PlanPoint } from "./types";

const CURRENT_LOCATION_NAME = "目前位置";

const pointKey = (point: PlanPoint | null) => (point ? point.position.join(",") : "-");

/** 路線規劃的起終點、規劃結果與選取的方案 */
export function usePlanState() {
  const [origin, setOrigin] = useState<PlanPoint | null>(null);
  const [destination, setDestination] = useState<PlanPoint | null>(null);
  // 選取綁定起終點；起終點改了就回到預設（第一個方案）
  const [choice, setChoice] = useState<{ key: string; selection: PlanSelection } | null>(null);
  const locator = useCurrentPosition();
  const plan = usePlan(origin?.position ?? null, destination?.position ?? null);

  const key = `${pointKey(origin)}|${pointKey(destination)}`;
  const hasOptions = (plan.data?.options.length ?? 0) > 0;
  const selection = choice?.key === key ? choice.selection : hasOptions ? { option: 0, ride: 0 } : null;
  const selectedOption = selection ? plan.data?.options[selection.option] : undefined;
  const selectedRide = selection ? selectedOption?.rides[selection.ride] : undefined;

  const setPoint = (field: PlanField, point: PlanPoint | null) =>
    field === "origin" ? setOrigin(point) : setDestination(point);

  const pickCurrentLocation = async () => {
    const position = await locator.locate();
    if (position) setOrigin({ name: CURRENT_LOCATION_NAME, position, isCurrentLocation: true });
  };

  return {
    origin,
    destination,
    setPoint,
    swap: () => {
      setOrigin(destination);
      setDestination(origin);
    },
    locator,
    pickCurrentLocation,
    plan,
    selection,
    select: (next: PlanSelection) => setChoice({ key, selection: next }),
    selectedOption,
    selectedRide,
  };
}
