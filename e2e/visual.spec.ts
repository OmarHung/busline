import { test } from "@playwright/test";
import { BANQIAO, mockApi } from "./fixtures";

// 只在 VISUAL_OUT 有設定時執行：輸出各種狀態的截圖供人工檢查
const OUT = process.env.VISUAL_OUT;

const cases = [
  { name: "desktop-light", viewport: { width: 1440, height: 900 }, colorScheme: "light" as const },
  { name: "desktop-dark", viewport: { width: 1440, height: 900 }, colorScheme: "dark" as const },
  { name: "mobile-light", viewport: { width: 390, height: 844 }, colorScheme: "light" as const },
];

for (const c of cases) {
  test.describe(c.name, () => {
    test.skip(!OUT, "VISUAL_OUT 未設定");
    test.use({ viewport: c.viewport, colorScheme: c.colorScheme });

    test("screens", async ({ page }) => {
      await mockApi(page);
      await page.goto("/");
      await page.getByRole("searchbox", { name: "搜尋路線" }).fill("307");
      await page.waitForTimeout(2500);
      await page.screenshot({ path: `${OUT}/${c.name}-search.png` });

      await page.getByRole("button", { name: /^307\s*板橋/ }).click();
      await page.getByRole("button", { name: /忠孝復興/ }).waitFor();
      await page.waitForTimeout(3500);
      await page.screenshot({ path: `${OUT}/${c.name}-route.png` });
    });

    test("nearby", async ({ page, context }) => {
      await context.grantPermissions(["geolocation"]);
      await context.setGeolocation({ longitude: BANQIAO[0], latitude: BANQIAO[1] });
      await mockApi(page);
      await page.goto("/");
      await page.getByRole("tab", { name: "附近站牌" }).click();
      await page.getByRole("list", { name: "附近的公車站" }).waitFor();
      await page.waitForTimeout(3500);
      await page.screenshot({ path: `${OUT}/${c.name}-nearby.png` });
    });
  });
}
