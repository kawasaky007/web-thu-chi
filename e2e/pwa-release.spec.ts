import { expect, test } from "@playwright/test";

test("shortcut giao dịch giữ đúng đường dẫn sau auth guard", async ({ page }) => {
  await page.goto("/transactions?new=1");

  await expect(page.getByRole("heading", { name: "Đăng nhập" })).toBeVisible();
  const url = new URL(page.url());
  expect(url.pathname).toBe("/login");
  expect(url.searchParams.get("next")).toBe("/transactions?new=1");
});

test("manifest có icon và shortcut phát hành", async ({ request }) => {
  const response = await request.get("/manifest.webmanifest");
  expect(response.ok()).toBeTruthy();

  const manifest = await response.json();
  expect(manifest.display).toBe("standalone");
  expect(manifest.start_url).toBe("/");
  expect(manifest.icons).toEqual(
    expect.arrayContaining([expect.objectContaining({ sizes: "192x192" }), expect.objectContaining({ sizes: "512x512" })]),
  );
  expect(manifest.shortcuts).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ url: "/transactions?new=1" }),
      expect.objectContaining({ url: "/recurring" }),
      expect.objectContaining({ url: "/goals" }),
    ]),
  );
});

test("service worker trả offline shell mà không cache trang tài chính", async ({ context, page }) => {
  await page.goto("/login");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });

  await context.setOffline(true);
  await page.goto("/transactions");
  await expect(page.getByRole("heading", { name: "Chưa có kết nối mạng." })).toBeVisible();
  await context.setOffline(false);
});

test("trang đăng nhập không tràn ngang ở viewport 320px", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto("/login");

  await expect(page.getByRole("heading", { name: "Đăng nhập" })).toBeVisible();
  const sizes = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth,
  }));
  expect(sizes.content).toBeLessThanOrEqual(sizes.viewport);
});

test("route backup và API export đều fail closed khi chưa đăng nhập", async ({ page, request }) => {
  await page.goto("/backup");
  const url = new URL(page.url());
  expect(url.pathname).toBe("/login");
  expect(url.searchParams.get("next")).toBe("/backup");

  const response = await request.get("/api/backup/transactions?format=json");
  expect(response.status()).toBe(401);
  expect(response.headers()["cache-control"]).toContain("no-store");
});

test("route giao dịch định kỳ fail closed và giữ đường dẫn quay lại", async ({ page }) => {
  await page.goto("/recurring");
  const url = new URL(page.url());
  expect(url.pathname).toBe("/login");
  expect(url.searchParams.get("next")).toBe("/recurring");
});

test("route mục tiêu tiết kiệm fail closed", async ({ page }) => {
  await page.goto("/goals");
  const url = new URL(page.url());
  expect(url.pathname).toBe("/login");
  expect(url.searchParams.get("next")).toBe("/goals");
});
