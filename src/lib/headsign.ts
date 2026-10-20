/**
 * 方向名稱優先用路線的起訖站（大家認得的「往 撫遠街」），
 * TDX 站序的最後一站常是更遠的場站；循環線或沒有起訖站時才用最後一站。
 */
export function directionHeadsign(
  direction: number,
  route: { from: string; to: string },
  lastStopName: string | undefined,
): string {
  const isLoop = route.from === route.to;
  const terminal = isLoop ? "" : direction === 1 ? route.from : route.to;
  const name = terminal || lastStopName;
  return name ? `往 ${name}` : direction === 1 ? "返程" : "去程";
}
