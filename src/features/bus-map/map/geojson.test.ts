import { describe, expect, test } from "vitest";
import type { LiveBus, RouteDetail, RouteDirection } from "@/lib/types";
import {
  boundsOf,
  busesFeatures,
  nearbyBounds,
  nearbyFeatures,
  planBounds,
  planLineFeatures,
  planPointFeatures,
  routeLineFeatures,
  stopFeatures,
  type NearbyOverlay,
  type PlanOverlay,
} from "./geojson";

const direction = (d: number, lng: number): RouteDirection => ({
  direction: d,
  headsign: `dir ${d}`,
  lines: [
    [
      [lng, 25],
      [lng + 0.01, 25.01],
    ],
  ],
  isApproximate: false,
  stops: [
    { uid: `${d}a`, name: "A", seq: 1, position: [lng, 25] },
    { uid: `${d}b`, name: "B", seq: 2, position: [lng + 0.01, 25.01] },
  ],
});

const detail: RouteDetail = {
  uid: "TPE1",
  name: "1",
  cityCode: "TPE",
  from: "A",
  to: "B",
  directions: [direction(0, 121.5), direction(1, 121.6)],
};

const bus = (plate: string, d: number): LiveBus => ({
  plate,
  direction: d,
  position: [121.5, 25],
  azimuth: 45,
  speed: 20,
  gpsTime: "",
});

describe("routeLineFeatures", () => {
  test("marks the active direction and keeps the other one as context", () => {
    const fc = routeLineFeatures(detail, 1);
    expect(fc.features.map((f) => [f.properties.direction, f.properties.active])).toEqual([
      [0, false],
      [1, true],
    ]);
    expect(fc.features[1].geometry).toEqual({ type: "MultiLineString", coordinates: detail.directions[1].lines });
  });

  test("returns an empty collection without a route", () => {
    expect(routeLineFeatures(null, 0).features).toEqual([]);
  });
});

describe("stopFeatures", () => {
  test("emits the stops of the active direction with a selected flag", () => {
    const fc = stopFeatures(detail.directions[0], "0b");
    expect(fc.features.map((f) => f.properties)).toEqual([
      { uid: "0a", name: "A", seq: 1, selected: false, terminal: "start", label: "起" },
      { uid: "0b", name: "B", seq: 2, selected: true, terminal: "end", label: "迄" },
    ]);
  });

  test("marks only the first and last stop as terminals", () => {
    const three = {
      ...detail.directions[0],
      stops: [
        ...detail.directions[0].stops,
        { uid: "0c", name: "C", seq: 3, position: [121.52, 25.02] as [number, number] },
      ],
    };
    expect(stopFeatures(three, null).features.map((f) => f.properties.terminal)).toEqual(["start", "", "end"]);
  });
});

describe("busesFeatures", () => {
  test("only shows buses running in the active direction", () => {
    const fc = busesFeatures([bus("X", 0), bus("Y", 1)], 1);
    expect(fc.features.map((f) => f.properties)).toEqual([{ plate: "Y", azimuth: 45 }]);
  });
});

describe("boundsOf", () => {
  test("covers every line point of the direction", () => {
    expect(boundsOf(detail.directions[0])).toEqual([
      [121.5, 25],
      [121.51, 25.01],
    ]);
  });

  test("returns null for an empty direction", () => {
    expect(boundsOf({ ...detail.directions[0], lines: [], stops: [] })).toBeNull();
  });
});

describe("plan overlay", () => {
  const full: PlanOverlay = {
    points: [
      { kind: "origin", label: "起", position: [121.5, 25] },
      { kind: "via", label: "1", position: [121.52, 25.02] },
      { kind: "destination", label: "終", position: [121.54, 25.03] },
    ],
    legs: [
      {
        from: [121.5, 25],
        to: [121.52, 25.02],
        board: [121.501, 25],
        alight: [121.519, 25.019],
        ride: [
          [121.501, 25],
          [121.51, 25.01],
          [121.519, 25.019],
        ],
      },
      {
        from: [121.52, 25.02],
        to: [121.54, 25.03],
        board: [121.521, 25.021],
        alight: [121.539, 25.029],
        ride: [
          [121.521, 25.021],
          [121.539, 25.029],
        ],
      },
    ],
  };

  test("draws walking legs to and from the stops around each bus ride", () => {
    const fc = planLineFeatures(full);
    expect(fc.features.map((f) => [f.properties.kind, f.geometry.coordinates.length])).toEqual([
      ["walk", 2],
      ["ride", 3],
      ["walk", 2],
      ["walk", 2],
      ["ride", 2],
      ["walk", 2],
    ]);
  });

  test("marks the stops of every leg, then the origin, waypoints and destination on top", () => {
    const fc = planPointFeatures(full);
    expect(fc.features.map((f) => [f.properties.kind, f.properties.label])).toEqual([
      ["stop", ""],
      ["stop", ""],
      ["stop", ""],
      ["stop", ""],
      ["origin", "起"],
      ["via", "1"],
      ["destination", "終"],
    ]);
  });

  test("numbers the points in order, so the map can tell which one is hovered", () => {
    const points = planPointFeatures(full).features.filter((f) => f.properties.kind !== "stop");
    expect(points.map((f) => f.properties.order)).toEqual([0, 1, 2]);
  });

  test("shows only the points before an option is chosen", () => {
    const pointsOnly: PlanOverlay = { ...full, legs: [] };
    expect(planLineFeatures(pointsOnly).features).toEqual([]);
    expect(planPointFeatures(pointsOnly).features.map((f) => f.properties.kind)).toEqual([
      "origin",
      "via",
      "destination",
    ]);
  });

  test("bounds cover everything drawn", () => {
    expect(planBounds(full)).toEqual([
      [121.5, 25],
      [121.54, 25.03],
    ]);
    expect(planBounds({ points: [], legs: [] })).toBeNull();
    expect(planBounds(null)).toBeNull();
    expect(planLineFeatures(null).features).toEqual([]);
    expect(planPointFeatures(null).features).toEqual([]);
  });
});

describe("nearby overlay", () => {
  const overlay: NearbyOverlay = {
    center: [121.5, 25],
    isCurrentLocation: true,
    stations: [
      {
        id: "7",
        name: "板橋車站",
        positions: [
          [121.501, 25.001],
          [121.501, 25.0013],
        ],
      },
      { id: "9", name: "新埔", positions: [[121.497, 25.004]] },
    ],
  };

  test("draws every pole of each station, then the current location on top", () => {
    const features = nearbyFeatures(overlay, "9").features;

    expect(features.map((f) => [f.properties.kind, f.properties.station, f.properties.selected])).toEqual([
      ["stop", "7", false],
      ["stop", "7", false],
      ["stop", "9", true],
      ["here", "", false],
    ]);
    expect(features[0].properties.name).toBe("板橋車站");
    expect(features[3].geometry.coordinates).toEqual([121.5, 25]);
  });

  test("marks the map center differently from the current location", () => {
    const fromMap = nearbyFeatures({ ...overlay, isCurrentLocation: false }, null).features;

    expect(fromMap.at(-1)?.properties.kind).toBe("center");
  });

  test("bounds cover the current location and every pole", () => {
    expect(nearbyBounds(overlay)).toEqual([
      [121.497, 25],
      [121.501, 25.004],
    ]);
    expect(nearbyBounds(null)).toBeNull();
    expect(nearbyFeatures(null, null).features).toEqual([]);
  });
});
