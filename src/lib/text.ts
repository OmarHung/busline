/** 搜尋比對用：全形英數轉半形、「臺」視同「台」、統一小寫 */
export function normalizeText(text: string): string {
  return text
    .replace(/[！-～]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replaceAll("臺", "台")
    .trim()
    .toLowerCase();
}
