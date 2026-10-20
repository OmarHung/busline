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
    expect(url.searchParams.get("points")).toBe("121.46370,25.01450;121.56450,25.03380");

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

  test("adds a waypoint and plans each leg on its own", async ({ page }) => {
    await mockApi(page);
    await page.goto("/");
    await page.getByRole("tab", { name: "路線規劃" }).click();
    await page.getByRole("searchbox", { name: "終點" }).fill("台北101");
    await page.getByRole("button", { name: /^台北101/ }).click();
    await expect(page.getByRole("list", { name: "直達方案" })).toBeVisible();

    await page.getByRole("button", { name: "新增經過點" }).click();
    const via = page.getByRole("searchbox", { name: "經過點 1" });
    await expect(via).toBeFocused();
    await via.fill("世貿");
    const planRequest = page.waitForRequest((req) => req.url().includes("/api/plan?"));
    await page.getByRole("button", { name: /^捷運台北101\/世貿站/ }).click();

    const points = new URL((await planRequest).url()).searchParams.get("points");
    expect(points?.split(";")).toEqual(["121.46370,25.01450", "121.56360,25.03450", "121.56450,25.03380"]);

    await expect(page.getByText("共 2 段")).toBeVisible();
    const first = page.getByRole("region", { name: "第 1 段" });
    const second = page.getByRole("region", { name: "第 2 段" });
    await expect(first).toContainText("目前位置 → 捷運台北101/世貿站");
    await expect(second).toContainText("捷運台北101/世貿站 → 台北101");
    await expect(first.getByRole("list", { name: "第 1 段直達方案" }).locator("> li")).toHaveCount(2);

    // 即時到站一次只查一段的一條路線
    await second.getByRole("button", { name: "查看下一班" }).click();
    await expect(second).toContainText("進站中");
    await expect(first.getByRole("button", { name: "查看下一班" })).toBeVisible();
  });

  test("reverses the whole trip, and removes a waypoint", async ({ page }) => {
    await mockApi(page);
    await page.goto("/");
    await page.getByRole("tab", { name: "路線規劃" }).click();
    await page.getByRole("searchbox", { name: "終點" }).fill("台北101");
    await page.getByRole("button", { name: /^台北101/ }).click();
    await page.getByRole("button", { name: "新增經過點" }).click();
    await page.getByRole("searchbox", { name: "經過點 1" }).fill("世貿");
    await page.getByRole("button", { name: /^捷運台北101\/世貿站/ }).click();

    await page.getByRole("button", { name: "反轉行程順序" }).click();
    await expect(page.getByRole("searchbox", { name: "起點" })).toHaveValue("台北101");
    await expect(page.getByRole("searchbox", { name: "經過點 1" })).toHaveValue("捷運台北101/世貿站");
    await expect(page.getByRole("searchbox", { name: "終點" })).toHaveValue("目前位置");

    const twoPoints = page.waitForRequest(
      (req) =>
        req.url().includes("/api/plan?") && new URL(req.url()).searchParams.get("points")?.split(";").length === 2,
    );
    await page.getByRole("button", { name: "移除經過點 1" }).click();
    await twoPoints;
    await expect(page.getByRole("searchbox", { name: "經過點 1" })).toHaveCount(0);
    await expect(page.getByRole("list", { name: "直達方案" })).toBeVisible();
  });

  test("allows up to three waypoints", async ({ page }) => {
    await mockApi(page);
    await page.goto("/");
    await page.getByRole("tab", { name: "路線規劃" }).click();

    for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "新增經過點" }).click();

    await expect(page.getByRole("searchbox", { name: /^經過點/ })).toHaveCount(3);
    await expect(page.getByRole("button", { name: "新增經過點" })).toHaveCount(0);
  });

  test("edits the text of a chosen place instead of starting over", async ({ page }) => {
    await mockApi(page);
    await page.goto("/");
    await page.getByRole("tab", { name: "路線規劃" }).click();
    const destination = page.getByRole("searchbox", { name: "終點", exact: true });
    await destination.fill("台北101");
    await page.getByRole("button", { name: /^台北101/ }).click();

    await destination.click();
    await expect(destination).toHaveValue("台北101");
    await destination.press("End");
    await destination.press("Backspace");
    await expect(destination).toHaveValue("台北10");

    // 沒選新的地點就取消，保留原本的
    await destination.press("Escape");
    await expect(destination).toHaveValue("台北101");
  });

  test("can edit again right after picking a place with Enter", async ({ page }) => {
    await mockApi(page);
    await page.goto("/");
    await page.getByRole("tab", { name: "路線規劃" }).click();
    const destination = page.getByRole("searchbox", { name: "終點", exact: true });
    await destination.fill("台北101");
    await expect(page.getByRole("button", { name: /^台北101/ })).toBeVisible();
    await destination.press("Enter");

    // 選好後焦點離開輸入框，再次輸入時重新進入編輯
    await expect(destination).not.toBeFocused();
    await destination.press("End");
    await destination.press("Backspace");
    await expect(destination).toHaveValue("台北10");
  });

  test("keeps the chosen place when pressing Enter without changing the text", async ({ page }) => {
    await mockApi(page);
    await page.goto("/");
    await page.getByRole("tab", { name: "路線規劃" }).click();
    const destination = page.getByRole("searchbox", { name: "終點", exact: true });
    await destination.fill("世貿");
    await page.getByRole("button", { name: /^捷運台北101\/世貿站/ }).click();

    await destination.click();
    await expect(page.getByRole("button", { name: /^台北101/ })).toBeVisible();
    // 第一個建議是同樣含「台北101」的另一個地點，不能被換掉
    await destination.press("Enter");
    await expect(destination).toHaveValue("捷運台北101/世貿站");
  });

  test("reorders places with the keyboard, the first becoming the origin and the last the destination", async ({
    page,
  }) => {
    await mockApi(page);
    await page.goto("/");
    await page.getByRole("tab", { name: "路線規劃" }).click();
    await page.getByRole("searchbox", { name: "終點", exact: true }).fill("台北101");
    await page.getByRole("button", { name: /^台北101/ }).click();
    // 只有起終點時用交換按鈕就好，不顯示拖曳把手
    await expect(page.getByRole("button", { name: /^拖曳排序/ })).toHaveCount(0);

    await page.getByRole("button", { name: "新增經過點" }).click();
    await page.getByRole("searchbox", { name: "經過點 1", exact: true }).fill("世貿");
    await page.getByRole("button", { name: /^捷運台北101\/世貿站/ }).click();

    const reordered = page.waitForRequest(
      (req) =>
        req.url().includes("/api/plan?") &&
        new URL(req.url()).searchParams.get("points") === "121.46370,25.01450;121.56450,25.03380;121.56360,25.03450",
    );
    // 每一步等螢幕報讀的提示出現再按下一個鍵（拿起後要先量測各列位置）
    const announcer = page.getByRole("status");
    await page.getByRole("button", { name: "拖曳排序：終點" }).focus();
    await page.keyboard.press("Space");
    await expect(announcer).toHaveText("已拿起終點「台北101」，目前在第 3 個位置");
    // dnd-kit 拿起後下一個 tick 才開始接收方向鍵；還停在「已拿起」就再按一次
    await expect(async () => {
      if ((await announcer.textContent())?.startsWith("已拿起")) await page.keyboard.press("ArrowUp");
      await expect(announcer).toHaveText("終點「台北101」移到第 2 個位置", { timeout: 500 });
    }).toPass({ timeout: 10_000 });
    await page.keyboard.press("Space");
    await reordered;

    await expect(page.getByRole("searchbox", { name: "起點", exact: true })).toHaveValue("目前位置");
    await expect(page.getByRole("searchbox", { name: "經過點 1", exact: true })).toHaveValue("台北101");
    await expect(page.getByRole("searchbox", { name: "終點", exact: true })).toHaveValue("捷運台北101/世貿站");
  });

  test("reorders places by dragging with the mouse", async ({ page }) => {
    await mockApi(page);
    await page.goto("/");
    await page.getByRole("tab", { name: "路線規劃" }).click();
    await page.getByRole("searchbox", { name: "終點", exact: true }).fill("台北101");
    await page.getByRole("button", { name: /^台北101/ }).click();
    await page.getByRole("button", { name: "新增經過點" }).click();
    await page.getByRole("searchbox", { name: "經過點 1", exact: true }).fill("世貿");
    await page.getByRole("button", { name: /^捷運台北101\/世貿站/ }).click();

    // 把起點拖到最後
    const from = await page.getByRole("button", { name: "拖曳排序：起點" }).boundingBox();
    const to = await page.getByRole("searchbox", { name: "終點", exact: true }).boundingBox();
    if (!from || !to) throw new Error("找不到拖曳把手或終點欄位");
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(from.x + from.width / 2, to.y + to.height, { steps: 12 });
    await page.mouse.up();

    await expect(page.getByRole("searchbox", { name: "起點", exact: true })).toHaveValue("捷運台北101/世貿站");
    await expect(page.getByRole("searchbox", { name: "經過點 1", exact: true })).toHaveValue("台北101");
    await expect(page.getByRole("searchbox", { name: "終點", exact: true })).toHaveValue("目前位置");
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
