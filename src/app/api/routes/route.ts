import { ROUTE_INDEX } from "@/server/route-index/data";

/** 路線清單是預先產生的靜態資料，建置時就會輸出成靜態回應 */
export function GET() {
  return Response.json(ROUTE_INDEX);
}
