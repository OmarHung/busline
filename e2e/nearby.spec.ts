import { expect, test } from "@playwright/test";
import { BANQIAO, mockApi } from "./fixtures";

test.use({ viewport: { width: 1280, height: 800 } });

test.describe("附近站牌", () => {
  test.use({
    geolocation: { longitude: BANQIAO[0], latitude: BANQIAO[1] },
    permissions: ["geolocation"],
  });

  test("lists nearby stops and opens a route at the stop the user is near", async ({ page }) => {
    await mockApi(page);
    await page.goto("/");
    const request = page.waitForRequest((req) => req.url().includes("/api/nearby?"));
    await page.getByRole("tab", { name: "附近站牌" }).click();

    // 位置只取到小數 4 位，讓快取比較容易命中
    expect(new URL((await request).url()).searchParams.get("at")).toBe("121.4637,25.0145");
    const stations = page.getByRole("list", { name: "附近的公車站" }).locator("> li");
    await expect(stations).toHaveCount(3);
    await expect(stations.first()).toContainText("板橋車站");
    await expect(stations.first()).toContainText("120 公尺・步行 2 分");

    // 搭返程：開啟路線時，方向與選取的站都要是附近的那一站
    await stations.first().getByRole("button", { name: "307 往 板橋" }).click();
    await expect(page).toHaveURL(/\?r=TPE16111$/);
    await expect(page.getByRole("tab", { name: "往 板橋" })).toHaveAttribute("aria-selected", "true");
    await expect(page.locator('[aria-current="location"]')).toContainText("板橋車站");

    // 返回後還在附近站牌
    await page.getByRole("button", { name: "返回" }).click();
    await expect(page.getByRole("tab", { name: "附近站牌" })).toHaveAttribute("aria-selected", "true");
    await expect(stations).toHaveCount(3);

    // 附近站牌的定位不影響路線規劃：第一次進規劃仍會把起點設成目前位置
    await page.getByRole("tab", { name: "路線規劃" }).click();
    await expect(page.getByRole("searchbox", { name: "起點" })).toHaveValue("目前位置");
  });

  test("shows the rest of the routes of a busy stop on request", async ({ page }) => {
    await mockApi(page);
    await page.goto("/");
    await page.getByRole("tab", { name: "附近站牌" }).click();

    const routes = page.getByRole("list", { name: "新埔的路線" }).locator("> li");
    await expect(routes).toHaveCount(6);
    await page.getByRole("button", { name: "再顯示 2 條路線" }).click();
    await expect(routes).toHaveCount(8);
  });

  test("highlights a stop picked from the list", async ({ page }) => {
    await mockApi(page);
    await page.goto("/");
    await page.getByRole("tab", { name: "附近站牌" }).click();

    const station = page.getByRole("button", { name: /^板橋\s/ });
    await station.click();
    await expect(station).toHaveAttribute("aria-current", "location");
  });
});

test.describe("在地圖上顯示附近站點", () => {
  test.use({
    geolocation: { longitude: BANQIAO[0], latitude: BANQIAO[1] },
    permissions: ["geolocation"],
  });

  test("asks to zoom in first, and is not shown while planning", async ({ page }) => {
    await mockApi(page);
    await page.goto("/");

    // 一開始是全台灣，中心附近沒有意義
    await expect(page.getByRole("button", { name: "放大地圖以顯示附近站點" })).toBeDisabled();
    await page.getByRole("tab", { name: "路線規劃" }).click();
    await expect(page.getByRole("button", { name: /顯示附近站點/ })).toHaveCount(0);
  });

  test("shows stops around the map center after the map is moved", async ({ page }) => {
    const atParams: string[] = [];
    page.on("request", (req) => {
      if (req.url().includes("/api/nearby?")) atParams.push(new URL(req.url()).searchParams.get("at") ?? "");
    });
    await mockApi(page);
    await page.goto("/");
    await page.getByRole("tab", { name: "附近站牌" }).click();
    await expect(page.getByRole("list", { name: "附近的公車站" })).toBeVisible();

    // 剛顯示完目前位置附近的站，地圖是程式自動縮放的，按鈕不出現
    const mapButton = page.getByRole("button", { name: "在地圖上顯示附近站點" });
    await expect(mapButton).toHaveCount(0);
    // 等自動縮放的動畫結束，再拖曳地圖
    await page.waitForTimeout(1500);
    const box = await page.getByRole("region", { name: "公車路線地圖" }).boundingBox();
    if (!box) throw new Error("找不到地圖");
    const [x, y] = [box.x + box.width * 0.7, box.y + box.height / 2];
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x - 250, y - 120, { steps: 12 });
    await page.mouse.up();

    await mapButton.click();
    await expect(page.getByText("地圖中心附近的公車站")).toBeVisible();
    expect(atParams).toHaveLength(2);
    expect(atParams[0]).toBe("121.4637,25.0145");
    expect(atParams[1]).not.toBe(atParams[0]);
    await expect(mapButton).toHaveCount(0);

    await page.getByRole("button", { name: "用目前位置" }).click();
    await expect(page.getByText("目前位置附近的公車站")).toBeVisible();
  });
});

test.describe("附近站牌（沒有定位權限）", () => {
  test("explains how to allow location access", async ({ page }) => {
    await mockApi(page);
    await page.goto("/");
    await page.getByRole("tab", { name: "附近站牌" }).click();

    await expect(page.getByText("沒有定位權限")).toBeVisible();
    await expect(page.getByRole("button", { name: "重試" })).toBeVisible();
  });
});
