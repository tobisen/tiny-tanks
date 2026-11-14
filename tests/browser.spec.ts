import { test, expect, type Page } from "@playwright/test";

async function ready(page: Page) {
  await page.goto("./");
  await expect(page.locator("canvas")).toBeVisible();
  await expect(page.locator("#players .player-card")).toHaveCount(3);
}
async function settings(
  page: Page,
  players = "2",
  difficulty = "hard",
  health = "75",
  theme = "green",
) {
  await page.locator("#settings").click();
  await page.locator("[name=players]").selectOption(players);
  await page.locator("[name=difficulty]").selectOption(difficulty);
  await page.locator("[name=health]").selectOption(health);
  await page.locator("[name=theme]").selectOption(theme);
  await page.locator("[name=wind]").uncheck();
  await page.getByRole("button", { name: "Save settings" }).click();
}
async function setRange(page: Page, id: string, value: number) {
  await page.locator(`#${id}`).evaluate((element, v) => {
    (element as HTMLInputElement).value = String(v);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  }, value);
}

test("production menu, keyboard, six loadouts, pause, settings, local turns and resize", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await ready(page);
  await page.screenshot({
    path: "test-results/menu-desktop.png",
    fullPage: true,
  });
  await page.locator("#menu-help").click();
  await expect(page.getByText("Aim high. Hit hard.")).toBeVisible();
  await page.locator("#got-it").click();
  await settings(page, "4", "normal", "100", "desert");
  await page.locator("#play-local").click();
  await expect(page.locator("#players .player-card")).toHaveCount(4);
  await expect(page.locator("#fire")).toBeEnabled();
  for (let i = 1; i <= 6; i++) {
    await page.locator("body").click({ position: { x: 2, y: 2 } });
    await page.keyboard.press(String(i));
    await expect(page.locator(".weapon.selected .weapon-name")).toHaveText(
      ["Shell", "Heavy", "Triple", "Cluster", "Bunker", "Mega"][i - 1],
    );
  }
  await page.keyboard.press("1");
  await page.keyboard.down("ArrowLeft");
  await page.waitForTimeout(160);
  await page.keyboard.up("ArrowLeft");
  expect(+(await page.locator("#angle").inputValue())).toBeGreaterThan(55);
  await page.screenshot({
    path: "test-results/game-desktop.png",
    fullPage: true,
  });
  await setRange(page, "angle", 90);
  await setRange(page, "power", 38);
  await page.locator("#fire").click();
  await expect(page.locator("#fire")).toBeDisabled();
  await page.locator("#pause").click();
  await expect(page.getByText("Hold your fire.")).toBeVisible();
  const turn = await page.locator("#turn-label").textContent();
  await page.waitForTimeout(900);
  expect(await page.locator("#turn-label").textContent()).toBe(turn);
  await page.locator("#resume").click();
  await expect(page.locator("#turn-label")).toHaveText("TURN 02", {
    timeout: 20000,
  });
  await expect(page.locator("#match-title")).toContainText("Ember");
  await expect(page.locator("#fire")).toBeEnabled();
  await page.waitForTimeout(1200);
  await expect(page.locator("#turn-label")).toHaveText("TURN 02");
  await page.screenshot({
    path: "test-results/game-desktop-crater.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 810, height: 1080 });
  await expect(page.locator("#turn-label")).toHaveText("TURN 02");
  await expect(page.locator("#fire")).toBeVisible();
  await page.screenshot({
    path: "test-results/local-desert-tablet.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

test("a complete human vs AI match resolves damage, winner and immediate rematch", async ({
  page,
}) => {
  await ready(page);
  await settings(page);
  await page.locator("#play-ai").click();
  let shots = 0;
  while (!(await page.locator("#rematch").isVisible()) && shots++ < 8) {
    await expect(page.locator("#fire")).toBeEnabled({ timeout: 20000 });
    await setRange(page, "angle", 90);
    await setRange(page, "power", 20);
    await page.locator("#fire").click();
    await expect
      .poll(
        async () =>
          (await page.locator("#rematch").isVisible()) ||
          (await page.locator("#fire").isEnabled()),
        { timeout: 25000 },
      )
      .toBe(true);
  }
  await expect(page.locator("#rematch")).toBeVisible();
  expect(shots).toBeLessThan(8);
  await expect(page.locator(".eliminated")).toHaveCount(1);
  await expect(page.locator(".results")).toContainText("DAMAGE");
  await page.screenshot({
    path: "test-results/match-results.png",
    fullPage: true,
  });
  await page.locator("#rematch").click();
  await expect(page.locator("#turn-label")).toHaveText("TURN 01");
  await expect(page.locator("#fire")).toBeEnabled();
  await expect(page.locator(".eliminated")).toHaveCount(0);
});

test("mobile touch aim and fire retain the entire battlefield through orientation changes", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  await ready(page);
  await settings(page, "4", "normal", "100", "moon");
  await page.screenshot({
    path: "test-results/menu-mobile.png",
    fullPage: true,
  });
  await page.locator("#play-local").tap();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const canvas = await page.locator("canvas").boundingBox(),
    stage = await page.locator(".stage").boundingBox();
  expect(canvas!.x).toBeGreaterThanOrEqual(stage!.x - 1);
  expect(canvas!.x + canvas!.width).toBeLessThanOrEqual(
    stage!.x + stage!.width + 1,
  );
  const previous = +(await page.locator("#angle").inputValue());
  await page.getByRole("button", { name: "Increase angle" }).tap();
  expect(+(await page.locator("#angle").inputValue())).toBeGreaterThan(
    previous,
  );
  await page.getByRole("button", { name: "Mega Bomb", exact: true }).tap();
  await expect(page.locator(".weapon.selected .weapon-name")).toHaveText(
    "Mega",
  );
  await page.getByRole("button", { name: "Standard Shell", exact: true }).tap();
  await page.screenshot({
    path: "test-results/game-mobile.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 844, height: 390 });
  await expect(page.locator("#turn-label")).toHaveText("TURN 01");
  await page.locator("#fire").tap();
  await expect(page.locator("#turn-label")).toHaveText("TURN 02", {
    timeout: 20000,
  });
  await page.screenshot({
    path: "test-results/game-mobile-landscape.png",
    fullPage: true,
  });
  await context.close();
});

test("production manifest, installability metadata and an offline reload work under the base path", async ({
  page,
  context,
}) => {
  await ready(page);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect(page.locator("canvas")).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller))
    .toBe(true);
  const manifest = await page
    .locator("link[rel=manifest]")
    .getAttribute("href");
  const response = await page.request.get(manifest!);
  expect(response.ok()).toBe(true);
  const data = await response.json();
  expect(data.display).toBe("standalone");
  expect(data.icons.map((i: { sizes: string }) => i.sizes)).toEqual([
    "192x192",
    "512x512",
  ]);
  for (const icon of data.icons) {
    const r = await page.request.get(
      new URL(icon.src, new URL(manifest!, page.url())).href,
    );
    expect(r.ok()).toBe(true);
  }
  const cdp = await context.newCDPSession(page);
  const installability = await cdp.send("Page.getInstallabilityErrors");
  // Playwright's isolated contexts are incognito, where Chrome disables native installation.
  // Every application-level installability check must still pass.
  expect(
    installability.installabilityErrors.filter(
      (error) => error.errorId !== "in-incognito",
    ),
  ).toEqual([]);
  await cdp.detach();
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator("canvas")).toBeVisible();
  await page.locator("#play-local").click();
  await expect(page.locator("#fire")).toBeEnabled();
  await page.locator("#fire").click();
  await expect(page.locator("#turn-label")).toHaveText("TURN 02", {
    timeout: 20000,
  });
  await context.setOffline(false);
});

test("every weapon fires and resolves in the actual renderer", async ({
  page,
}) => {
  await ready(page);
  await settings(page, "4", "normal", "150");
  await page.locator("#play-local").click();
  for (const name of [
    "Standard Shell",
    "Heavy Shell",
    "Triple Shot",
    "Cluster Bomb",
    "Bunker Buster",
    "Mega Bomb",
  ]) {
    if (name !== "Standard Shell") {
      await page.locator("#pause").click();
      await page.locator("#restart").click();
    }
    await page.getByRole("button", { name, exact: true }).click();
    await setRange(page, "angle", 60);
    await setRange(page, "power", 35);
    await page.locator("#fire").click();
    await expect(page.locator("#turn-label")).toHaveText("TURN 02", {
      timeout: 20000,
    });
    await expect(page.locator("#fire")).toBeEnabled();
  }
});
