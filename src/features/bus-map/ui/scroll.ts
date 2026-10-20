const ROW_SCROLL_MARGIN = 12;

/**
 * 只捲動列表本身（scrollIntoView 會連外層一起捲，把整頁推走）。
 * 手機面板收合時列表下半部在螢幕外，所以只算看得到的範圍。
 */
export function scrollRowIntoView(container: HTMLElement, row: HTMLElement): void {
  const box = container.getBoundingClientRect();
  const rowBox = row.getBoundingClientRect();
  const visibleBottom = Math.min(box.bottom, window.innerHeight);
  const isVisible = rowBox.top >= box.top && rowBox.bottom <= visibleBottom;
  if (isVisible) return;

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  container.scrollBy({ top: rowBox.top - box.top - ROW_SCROLL_MARGIN, behavior: reduceMotion ? "auto" : "smooth" });
}
