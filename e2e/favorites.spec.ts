import { expect, test, type Page } from "@playwright/test";
import { serializeStored, type Favorite } from "../src/features/bus-map/favorites/favorites";
import { FAVORITES_STORAGE_KEY } from "../src/features/bus-map/favorites/store";
import { mockApi, ROUTE_INDEX } from "./fixtures";

test.use({ viewport: { width: 1280, height: 800 } });

const route307 = ROUTE_INDEX.routes[0];
const SAVED: Favorite[] = [
  {
    kind: "stop",
    route: route307,
    direction: 1,
    headsign: "往 板橋",
    stop: { name: "新埔", position: [121.4683, 25.0236] },
  },
  { kind: "route", route: route307 },
];

/** 打開頁面前先放好收藏（只在第一次載入時放，重新整理不會蓋掉） */
async function seedFavorites(page: Page, favorites: Favorite[]) {
  await page.addInitScript(
    ([key, value]) => {
      if (!sessionStorage.getItem("seeded")) {
        localStorage.setItem(key, value);
        sessionStorage.setItem("seeded", "1");
      }
    },
    [FAVORITES_STORAGE_KEY, serializeStored(favorites)],
  );
}

const favoriteItems = (page: Page) => page.getByRole("list", { name: "收藏的路線與站牌" }).locator("> li");

test.describe("收藏", () => {
  test("saves a route and a stop, keeps them after reload, and opens right at the stop", async ({ page }) => {
    await mockApi(page);
    await page.goto("/");
    await expect(page.getByText(/在路線頁按 ☆/)).toBeVisible();

    await page.getByRole("searchbox", { name: "搜尋路線" }).fill("307");
    await page.getByRole("button", { name: /^307\s*板橋/ }).click();
    const routeStar = page.getByRole("button", { name: "收藏路線" });
    await routeStar.click();
    await expect(routeStar).toHaveAttribute("aria-pressed", "true");

    await page.getByRole("tab", { name: "往 板橋" }).click();
    await page.locator('[data-stop="TPE-i9"] button').click();
    const stopStar = page.getByRole("button", { name: /收藏這一站/ });
    await stopStar.click();
    await expect(stopStar).toHaveAttribute("aria-pressed", "true");

    await page.getByRole("button", { name: "返回" }).click();
    await page.getByRole("button", { name: "清除搜尋" }).click();
    await expect(favoriteItems(page)).toHaveCount(2);
    // 新收藏的在前面
    await expect(favoriteItems(page).first()).toContainText("新埔");

    await page.reload();
    await expect(favoriteItems(page)).toHaveCount(2);
    await page.getByRole("button", { name: "307 新埔・往 板橋", exact: true }).click();
    await expect(page).toHaveURL(/\?r=TPE16111$/);
    await expect(page.getByRole("tab", { name: "往 板橋" })).toHaveAttribute("aria-selected", "true");
    await expect(page.locator('[aria-current="location"]')).toContainText("新埔");
    await expect(stopStar).toHaveAttribute("aria-pressed", "true");
  });

  test("removes a favorite", async ({ page }) => {
    await seedFavorites(page, SAVED);
    await mockApi(page);
    await page.goto("/");

    await expect(favoriteItems(page)).toHaveCount(2);
    await page.getByRole("button", { name: "移除收藏：307 板橋 ⇄ 撫遠街" }).click();
    await expect(favoriteItems(page)).toHaveCount(1);
    await page.reload();
    await expect(favoriteItems(page)).toHaveCount(1);
  });

  test.describe("分享連結", () => {
    test.use({ permissions: ["clipboard-read", "clipboard-write"] });

    test("copies a link that imports the favorites into another browser", async ({ page, browser }) => {
      await seedFavorites(page, SAVED);
      await mockApi(page);
      await page.goto("/");
      await page.getByRole("button", { name: "分享收藏" }).click();
      await expect(page.getByRole("status")).toContainText("已複製收藏連結");
      const link = await page.evaluate(() => navigator.clipboard.readText());
      expect(link).toMatch(/\/\?fav=[\w-]+$/);

      // 另一個瀏覽器（沒有任何收藏）打開連結
      const other = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const otherPage = await other.newPage();
      await mockApi(otherPage);
      await otherPage.goto(link);
      await expect(otherPage.getByText("這個連結裡有 2 個收藏")).toBeVisible();
      await otherPage.getByRole("button", { name: "匯入" }).click();
      await expect(favoriteItems(otherPage)).toHaveCount(2);
      await expect(otherPage).toHaveURL(/\/$/);
      await other.close();
    });
  });

  test("explains when a shared link is broken", async ({ page }) => {
    await mockApi(page);
    await page.goto("/?fav=broken");

    await expect(page.getByText("這個收藏連結無法讀取")).toBeVisible();
    await page.getByRole("button", { name: "關閉" }).click();
    await expect(page.getByText("這個收藏連結無法讀取")).toHaveCount(0);
  });
});
