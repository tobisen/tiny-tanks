import { test, expect, type Page } from "@playwright/test";
import type { GameEvent } from "../src/game/match";
// Only the development server includes controlled fixture preparation. The
// existing production suite still verifies release assets, PWA and full flows.
const repo = process.env.GITHUB_REPOSITORY?.split("/")[1];
const base =
  process.env.VITE_BASE_PATH ??
  (process.env.GITHUB_ACTIONS && repo ? `/${repo}/` : "/");
test.use({ baseURL: `http://127.0.0.1:4175${base}` });
test.skip(
  !!process.env.TEST_URL,
  "Controlled fixtures are absent from the public production build",
);
declare global {
  interface Window {
    __TINY_TANKS_TEST__: {
      prepare(
        kind:
          | "supply"
          | "ai-supply"
          | "gust"
          | "tremor"
          | "events-off"
          | "survival-win"
          | "survival-loss",
      ): void;
      snapshot(): {
        turn: number;
        phase: string;
        seed: number;
        tanks: { x: number; health: number; fuel: number; fuelBonus: number }[];
        supplies: { state: string }[];
        events: GameEvent[];
      };
    };
  }
}
async function start(page: Page, button = "play-local") {
  await page.clock.setFixedTime(new Date(145));
  await page.goto("./");
  await expect(page.locator("#players .player-card")).toHaveCount(3);
  await expect
    .poll(() => page.evaluate(() => !!window.__TINY_TANKS_TEST__))
    .toBe(true);
  // Keep the actual menu/start route. Fixture setup only bounds the encounter.
  if (button !== "play-survival") {
    await page.locator("#settings").click();
    await page.locator("[name=players]").selectOption("2");
    await page.getByRole("button", { name: "Save settings" }).click();
  }
  await page.locator(`#${button}`).click();
  await expect(page.locator("#fire")).toBeEnabled();
}
async function aim(page: Page, angle: number, power: number) {
  for (const [id, value] of [
    ["angle", angle],
    ["power", power],
  ] as const) {
    await page.locator(`#${id}`).evaluate((input, value) => {
      (input as HTMLInputElement).value = String(value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }, value);
  }
}
test("a parachute lands, touch movement collects a repair exactly once and firing still works", async ({
  browser,
}) => {
  const context = await browser.newContext({
    hasTouch: true,
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  await start(page);
  await page.evaluate(() => window.__TINY_TANKS_TEST__.prepare("supply"));
  await expect(page.locator("#supply-status")).toContainText(
    "Repair kit · falling",
  );
  await expect(page.locator("#supply-status")).toContainText(
    "Repair kit · landed",
  );
  const move = page.getByRole("button", { name: "Move right" });
  await move.scrollIntoViewIfNeeded();
  const box = (await move.boundingBox())!;
  const cdp = await context.newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [
      { x: box.x + box.width / 2, y: box.y + box.height / 2, id: 7 },
    ],
  });
  try {
    await expect(page.locator(".health-number").first()).toHaveText("75HP");
  } finally {
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await cdp.detach();
  }
  await expect(page.locator("#battle-notice")).toContainText("+25 HEALTH");
  const state = await page.evaluate(() =>
    window.__TINY_TANKS_TEST__.snapshot(),
  );
  expect(
    state.events.filter((e) => e.type === "supply" && e.action === "pickup"),
  ).toHaveLength(1);
  expect(state.tanks[0].x).toBeGreaterThan(135);
  expect(state.tanks[0].fuel).toBeLessThan(128);
  await aim(page, 180, 100);
  await page.locator("#fire").tap();
  await expect(page.locator("#turn-label")).toHaveText("TURN 02", {
    timeout: 20000,
  });
  await context.close();
});
test("AI walks to a reachable repair using ordinary fuel and then commits a shot", async ({
  page,
}) => {
  await start(page, "play-ai");
  await page.evaluate(() => window.__TINY_TANKS_TEST__.prepare("ai-supply"));
  await expect(page.locator(".health-number").nth(1)).toHaveText("55HP");
  const state = await page.evaluate(() =>
    window.__TINY_TANKS_TEST__.snapshot(),
  );
  expect(state.tanks[1].x).toBeLessThan(400);
  expect(400 - state.tanks[1].x).toBeCloseTo(128 - state.tanks[1].fuel, 4);
  expect(
    state.events.filter((e) => e.type === "supply" && e.action === "pickup"),
  ).toHaveLength(1);
  await expect(page.locator("#fire small")).toHaveText("SHOT IN FLIGHT");
});
for (const kind of ["gust", "tremor", "events-off"] as const) {
  test(`environment ${kind} follows the visible turn transition`, async ({
    page,
  }) => {
    await start(page);
    await page.evaluate(
      (kind) => window.__TINY_TANKS_TEST__.prepare(kind),
      kind,
    );
    await aim(page, 180, 100);
    await page.locator("#fire").click();
    if (kind === "tremor") {
      await expect(page.locator("#battle-notice")).toContainText(
        "GROUND TREMOR",
      );
      await expect(page.locator("#fire")).toBeDisabled();
      await expect(page.locator("#battle-notice")).toContainText(
        "Ground settled",
      );
    } else
      await expect(page.locator("#turn-label")).toHaveText("TURN 06", {
        timeout: 20000,
      });
    const state = await page.evaluate(() =>
      window.__TINY_TANKS_TEST__.snapshot(),
    );
    const events = state.events.filter((e) => e.type === "environment");
    if (kind === "events-off") {
      expect(events).toHaveLength(0);
      await expect(page.locator("#battle-notice")).toBeEmpty();
    } else if (kind === "gust") {
      expect(events.some((e) => e.action === "gust")).toBe(true);
      await expect(page.locator("#battle-notice")).toContainText("WIND GUST");
    } else {
      expect(events.filter((e) => e.action === "warning")).toHaveLength(1);
      expect(events.filter((e) => e.action === "tremor")).toHaveLength(1);
      expect(state.tanks.map((t) => t.health)).toEqual([100, 100]);
    }
  });
}
test("Survival wins advance with resources, defeat ends the run and local bests survive a reload", async ({
  page,
}) => {
  await start(page, "play-survival");
  await expect(page.locator("#match-mode")).toContainText(
    "SURVIVAL · BATTLE 1",
  );
  await page.evaluate(() => window.__TINY_TANKS_TEST__.prepare("survival-win"));
  await aim(page, 5, 55);
  await page.locator("#fire").click();
  await expect(page.locator("#survival-continue")).toBeVisible({
    timeout: 20000,
  });
  await expect(page.locator("#survival-results")).toContainText("1");
  await page.locator("#survival-continue").click();
  await expect(page.locator("#match-mode")).toContainText(
    "SURVIVAL · BATTLE 2",
  );
  await expect(page.locator(".health-number").first()).toHaveText("60HP");
  const ammo = await page
    .locator('[data-weapon="mega"] .weapon-ammo')
    .textContent();
  expect(ammo).toBe("0");
  await page.evaluate(() =>
    window.__TINY_TANKS_TEST__.prepare("survival-loss"),
  );
  await aim(page, 90, 0);
  await page.locator("#fire").click();
  await expect(page.locator("#survival-new")).toBeVisible({ timeout: 20000 });
  await expect(page.locator("#survival-continue")).toHaveCount(0);
  const record = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("tiny-tanks-survival-v1")!),
  );
  expect(record.bestStreak).toBe(1);
  expect(record.runs).toBe(1);
  expect(record.bestScore).toBeGreaterThan(1000);
  await page.reload();
  await expect(page.locator("#play-survival")).toBeVisible();
  await page.locator("#menu-stats").click();
  await expect(page.locator(".survival-record")).toContainText("Best streak 1");
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.locator("#play-survival").click();
  await expect(page.locator("#survival-hud")).toHaveText("STREAK 0 · SCORE 0");
  await expect(page.locator(".health-number").first()).toHaveText("100HP");
});

test("Survival can bank a cleared battle and end the run", async ({ page }) => {
  await start(page, "play-survival");
  await page.evaluate(() => window.__TINY_TANKS_TEST__.prepare("survival-win"));
  await aim(page, 5, 55);
  await page.locator("#fire").click();
  await expect(page.locator("#survival-end")).toBeVisible({ timeout: 20000 });
  await page.locator("#survival-end").click();
  await expect(page.locator("#survival-new")).toBeVisible();
  await expect(page.locator("#survival-continue")).toHaveCount(0);
  await page.locator("#results-home").click();
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("tiny-tanks-survival-v1")!),
  );
  expect(saved).toMatchObject({ bestStreak: 1, runs: 1 });
});
