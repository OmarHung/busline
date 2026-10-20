import { expect, test } from "@playwright/test";
import { mockApi } from "./fixtures";

test.describe("desktop", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("searches a route, opens it, and shows stops with arrival times", async ({ page }) => {
    await mockApi(page);
    await page.goto("/");

    await page.getByRole("searchbox", { name: "搜尋路線" }).fill("307");

    const taipei = page.getByRole("region", { name: "臺北市" });
    await expect(taipei.getByRole("button")).toHaveCount(2);
    await expect(page.getByRole("region", { name: "臺中市" })).toBeVisible();

    await taipei.getByRole("button", { name: /^307\s*板橋/ }).click();

    await expect(page).toHaveURL(/\?r=TPE16111$/);
    await expect(page).toHaveTitle("307・公車路線圖");
    await expect(page.getByRole("tab", { name: "往 撫遠街" })).toHaveAttribute("aria-selected", "true");

    const firstStops = page.getByRole("listitem");
    await expect(firstStops.first()).toContainText("板橋");
    await expect(firstStops.first()).toContainText("14:05 發車");
    await expect(page.getByRole("button", { name: /板橋車站/ })).toContainText("進站中");
    await expect(page.getByRole("button", { name: /板橋車站/ })).toContainText("EAL-0307");
    await expect(page.getByRole("button", { name: /新埔/ })).toContainText("即將到站");
    await expect(page.getByRole("button", { name: /江子翠/ })).toContainText("7");
    await expect(page.getByRole("button", { name: /臺大醫院/ })).toContainText("交管不停靠");
    await expect(page.getByText("2 輛行駛中")).toBeVisible();

    await expect(page.locator("canvas.maplibregl-canvas")).toBeVisible();
  });

  test("switches direction", async ({ page }) => {
    await mockApi(page);
    await page.goto("/?r=TPE16111");

    await page.getByRole("tab", { name: "往 板橋" }).click();

    await expect(page.getByRole("tab", { name: "往 板橋" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("listitem").first()).toContainText("撫遠街");
    await expect(page.getByText("1 輛行駛中")).toBeVisible();
  });

  test("selecting a stop highlights it", async ({ page }) => {
    await mockApi(page);
    await page.goto("/?r=TPE16111");

    const stop = page.getByRole("button", { name: /忠孝復興/ });
    await stop.click();

    await expect(stop).toHaveAttribute("aria-current", "location");
  });

  test("goes back to search from a shared link", async ({ page }) => {
    await mockApi(page);
    await page.goto("/?r=TPE16111");

    await page.getByRole("button", { name: "返回" }).click();

    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("searchbox", { name: "搜尋路線" })).toBeVisible();
  });

  test("browser back never makes the in-app back button leave the site", async ({ page }) => {
    await mockApi(page);
    await page.goto("/?r=TPE16111");
    await page.getByRole("button", { name: "返回" }).click();
    await page.getByRole("searchbox", { name: "搜尋路線" }).fill("307");
    await page.getByRole("button", { name: /^307\s*板橋/ }).click();
    await expect(page).toHaveURL(/\?r=TPE16111$/);

    await page.goBack();
    await page.goBack();
    await expect(page.getByRole("button", { name: "返回" })).toBeVisible();
    await page.getByRole("button", { name: "返回" }).click();

    await expect(page).toHaveURL(/localhost:\d+\/$/);
    await expect(page.getByRole("searchbox", { name: "搜尋路線" })).toBeVisible();
  });

  test("flags live data that could not be fetched instead of showing it as empty", async ({ page }) => {
    await mockApi(page, { live: { buses: [], unavailable: ["buses"] } });
    await page.goto("/?r=TPE16111");

    await expect(page.getByText("車輛位置暫時無法取得")).toBeVisible();
    await expect(page.getByText("目前沒有車輛回報位置")).toHaveCount(0);
  });

  test("ignores an invalid route id in the URL", async ({ page }) => {
    await mockApi(page);
    await page.goto("/?r=<script>");

    await expect(page.getByRole("searchbox", { name: "搜尋路線" })).toBeVisible();
  });

  test("shows a retryable error when the route index fails", async ({ page }) => {
    await mockApi(page, { indexStatus: 502 });
    await page.goto("/");

    await expect(page.getByText("交通部 TDX 資料暫時無法取得，請稍後再試")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: "重試" })).toBeVisible();
  });
});

test.describe("mobile", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("bottom sheet expands when searching and collapses after picking a route", async ({ page }) => {
    await mockApi(page);
    await page.goto("/");

    const handle = page.getByRole("button", { name: "展開面板" });
    await expect(handle).toHaveAttribute("aria-expanded", "false");

    await page.getByRole("searchbox", { name: "搜尋路線" }).fill("紅5");
    await expect(page.getByRole("button", { name: "收合面板" })).toHaveAttribute("aria-expanded", "true");

    await page.getByRole("button", { name: /^紅5/ }).click();
    await expect(page.getByRole("button", { name: "展開面板" })).toBeVisible();
  });

  test("re-frames the route after a stop was focused (padding is not applied twice)", async ({ page }) => {
    const warnings: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "warning" || msg.type() === "error") warnings.push(msg.text());
    });
    await mockApi(page);
    await page.goto("/?r=TPE16111");

    await page.getByRole("button", { name: /新埔/ }).click();
    await page.waitForTimeout(800);
    await page.getByRole("tab", { name: "往 板橋" }).click();
    await page.waitForTimeout(1200);

    expect(warnings.filter((w) => /cannot fit/i.test(w))).toEqual([]);
  });

  test("selecting a stop below the fold scrolls only the list, never the page", async ({ page }) => {
    await mockApi(page);
    await page.goto("/?r=TPE16111");
    const stop = page.getByRole("button", { name: /國父紀念館/ });
    await expect(stop).toBeAttached();

    // 用 DOM click 模擬「從地圖點站牌」：不讓 Playwright 先幫忙捲動
    await stop.evaluate((el) => (el as HTMLButtonElement).click());

    await expect(stop).toHaveAttribute("aria-current", "location");
    await expect.poll(() => page.evaluate(() => document.querySelector("main")?.scrollTop)).toBe(0);
    await expect.poll(() => stop.evaluate((el) => el.getBoundingClientRect().bottom <= window.innerHeight)).toBe(true);
  });
});
