import { expect, test } from "@playwright/test";
import { BANQIAO, mockApi } from "./fixtures";

test.use({ viewport: { width: 1280, height: 800 } });

test.describe("路線規劃", () => {
  test.use({
    geolocation: { longitude: BANQIAO[0], latitude: BANQIAO[1] },
    permissions: ["geolocation"],
  });

  test("plans from the current location to a landmark and shows the next bus at the boarding stop", async ({
    page,
  }) => {
    const liveRequests: string[] = [];
    page.on("request", (req) => {
      if (req.url().includes("/live")) liveRequests.push(req.url());
    });
    await mockApi(page);
    await page.goto("/");
    await page.getByRole("tab", { name: "路線規劃" }).click();

    await expect(page.getByRole("searchbox", { name: "起點" })).toHaveValue("目前位置");

    await page.getByRole("searchbox", { name: "終點" }).fill("台北101");
    const planRequest = page.waitForRequest((req) => req.url().includes("/api/plan?"));
    // 選取的方案會讀路線詳情靜態檔來畫線型（不耗 TDX 額度）
    const detailResponse = page.waitForResponse((res) => res.url().endsWith("/data/routes/TPE16111.json"));
    await page.getByRole("button", { name: /^台北101/ }).click();

    const url = new URL((await planRequest).url());
    expect(url.searchParams.get("from")).toBe("121.46370,25.01450");
    expect(url.searchParams.get("to")).toBe("121.56450,25.03380");

    // 只取方案本身（展開的卡片裡還有步驟列表）
    const options = page.getByRole("list", { name: "直達方案" }).locator("> li");
    await expect(options).toHaveCount(2);
    const first = options.first();
    await expect(first.getByRole("button", { expanded: true })).toBeVisible();
    await expect(first).toContainText("38");
    await expect(first).toContainText("「板橋車站」");
    await expect(first).toContainText("「國父紀念館」下車");

    // 即時到站要呼叫 TDX（每分鐘只有 5 次），使用者按了才查
    await detailResponse;
    expect(liveRequests).toEqual([]);
    await first.getByRole("button", { name: "查看下一班" }).click();
    // 上車站「板橋車站」的即時到站（fixture 為 20 秒）
    await expect(first).toContainText("進站中");
    expect(liveRequests).toHaveLength(1);
  });

  test("asks again before fetching the next bus of another route", async ({ page }) => {
    await mockApi(page);
    await page.goto("/");
    await page.getByRole("tab", { name: "路線規劃" }).click();
    await page.getByRole("searchbox", { name: "終點" }).fill("台北101");
    await page.getByRole("button", { name: /^台北101/ }).click();

    const first = page.getByRole("list", { name: "直達方案" }).locator("> li").first();
    await first.getByRole("button", { name: "查看下一班" }).click();
    await expect(first).toContainText("進站中");

    await first.getByRole("radio", { name: "307西藏三民", exact: true }).click();
    await expect(first.getByRole("button", { name: "查看下一班" })).toBeVisible();
    await expect(first).not.toContainText("進站中");
  });

  test("switching to another route in the same option, then opening it, lands on the right direction", async ({
    page,
  }) => {
    await mockApi(page);
    await page.goto("/");
    await page.getByRole("tab", { name: "路線規劃" }).click();
    await page.getByRole("searchbox", { name: "終點" }).fill("台北101");
    await page.getByRole("button", { name: /^台北101/ }).click();

    const routes = page.getByRole("radiogroup", { name: "可搭的路線" });
    await routes.getByRole("radio", { name: "307西藏三民", exact: true }).click();
    await expect(routes.getByRole("radio", { name: "307西藏三民", exact: true })).toHaveAttribute(
      "aria-checked",
      "true",
    );

    await routes.getByRole("radio", { name: "307", exact: true }).click();
    await page.getByRole("button", { name: "查看 307 完整路線" }).click();

    await expect(page).toHaveURL(/\?r=TPE16111$/);
    await expect(page.getByRole("tab", { name: "往 撫遠街" })).toHaveAttribute("aria-selected", "true");

    await page.getByRole("button", { name: "返回" }).click();
    await expect(page.getByRole("searchbox", { name: "終點" })).toHaveValue("台北101");
  });

  test("swaps origin and destination", async ({ page }) => {
    await mockApi(page);
    await page.goto("/");
    await page.getByRole("tab", { name: "路線規劃" }).click();
    await page.getByRole("searchbox", { name: "終點" }).fill("台北101");
    await page.getByRole("button", { name: /^台北101/ }).click();

    await page.getByRole("button", { name: "交換起點與終點" }).click();

    await expect(page.getByRole("searchbox", { name: "起點" })).toHaveValue("台北101");
    await expect(page.getByRole("searchbox", { name: "終點" })).toHaveValue("目前位置");
  });

  test("suggests walking when the destination is close, and says so when no direct bus exists", async ({ page }) => {
    await mockApi(page, { plan: { directMeters: 450, options: [] } });
    await page.goto("/");
    await page.getByRole("tab", { name: "路線規劃" }).click();
    await page.getByRole("searchbox", { name: "終點" }).fill("台北101");
    await page.getByRole("button", { name: /^台北101/ }).click();

    await expect(page.getByText("距離約 450 公尺，走路大概 8 分鐘")).toBeVisible();
    await expect(page.getByText("附近找不到直達的公車")).toBeVisible();
  });
});

test.describe("路線規劃（不允許定位）", () => {
  test("asks for an origin when location is not available", async ({ page, context }) => {
    await context.clearPermissions();
    await mockApi(page);
    await page.goto("/");
    await page.getByRole("tab", { name: "路線規劃" }).click();

    await expect(page.getByRole("searchbox", { name: "起點" })).toHaveValue("");
    await page.getByRole("searchbox", { name: "起點" }).fill("台北101");
    await page.getByRole("button", { name: /^台北101/ }).click();
    await expect(page.getByRole("searchbox", { name: "起點" })).toHaveValue("台北101");
  });
});
