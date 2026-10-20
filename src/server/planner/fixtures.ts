import type { RouteSummary } from "@/lib/types";
import type { StopIndex } from "../stop-index/types";

// 測試用的小型路網：沿緯度 25 往東，經度每 0.001 度約 100 公尺
//
//   站：  A(121.500) B(121.505) C(121.510) D(121.520) E(121.530) F(121.540)
//   R1 去程： A → B → C → D → E
//   R1 返程： E → D → C → B → A
//   R2 去程： B → D → F          （停站少、距離較遠）
//   R3 去程： F → E               （方向不對，不能從 A 往 E）
export const NETWORK_INDEX: StopIndex = {
  generatedAt: "2026-10-20T00:00:00.000Z",
  stops: [
    ["A", 121.5, 25],
    ["B", 121.505, 25],
    ["C", 121.51, 25],
    ["D", 121.52, 25],
    ["E", 121.53, 25],
    ["F", 121.54, 25],
  ],
  patterns: [
    ["TPE1", 0, [0, 1, 2, 3, 4]],
    ["TPE1", 1, [4, 3, 2, 1, 0]],
    ["TPE2", 0, [1, 3, 5]],
    ["TPE3", 0, [5, 4]],
  ],
};

export const NETWORK_ROUTES: RouteSummary[] = [
  { uid: "TPE1", name: "1", cityCode: "TPE", from: "A", to: "E" },
  { uid: "TPE2", name: "2", cityCode: "TPE", from: "B", to: "F" },
  { uid: "TPE3", name: "3", cityCode: "TPE", from: "F", to: "E" },
];
