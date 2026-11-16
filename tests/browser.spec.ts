import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
const { version } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version: string };

async function ready(page: Page, seed = 20261115) {
  await page.clock.setFixedTime(new Date(seed));
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
  crates = true,
  reducedMotion = false,
) {
  await page.locator("#settings").click();
  await page.locator("[name=players]").selectOption(players);
  await page.locator("[name=difficulty]").selectOption(difficulty);
  await page.locator("[name=health]").selectOption(health);
  await page.locator("[name=theme]").selectOption(theme);
  await page.locator("[name=wind]").uncheck();
  await page.locator("[name=supplies]").uncheck();
  await page.locator("[name=environmentalEvents]").uncheck();
  await page.locator("[name=profile]").selectOption("rolling");
  await page.locator("[name=crates]").setChecked(crates);
  await page.locator("[name=reducedMotion]").setChecked(reducedMotion);
  await page.getByRole("button", { name: "Save settings" }).click();
}
async function setRange(page: Page, id: string, value: number) {
  await page.locator(`#${id}`).evaluate((element, v) => {
    (element as HTMLInputElement).value = String(v);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  }, value);
}

// A shot has a bounded physics lifetime. Wait for UI states, counting completed
// turns rather than polling passes; never infer completion from elapsed time.
async function fireShot(page: Page, angle: number, power = 20) {
  await expect(page.locator("#fire")).toBeEnabled();
  await setRange(page, "angle", angle);
  await setRange(page, "power", power);
  await page.locator("#fire").click();
  await expect(page.locator("#fire")).toBeDisabled();
}
async function humanTurn(page: Page, turn: number) {
  await expect(page.locator("#turn-label")).toHaveText(
    `TURN ${String(turn).padStart(2, "0")}`,
    { timeout: 20000 },
  );
  await expect(page.locator("#fire")).toBeEnabled();
}
async function committedAIShot(page: Page, turn: number) {
  await expect(page.locator("#turn-label")).toHaveText(
    `TURN ${String(turn).padStart(2, "0")}`,
    { timeout: 20000 },
  );
  // Capture the launch and HUD atomically, while this exact AI turn is in
  // flight/settle. Reading controls after returning to the human loses the shot.
  let committed: {
    angle: number;
    power: number;
    weapon: string | null;
  } | null = null;
  await expect
    .poll(async () => {
      committed = await page.evaluate(
        (expectedTurn) => {
          if (
            document.querySelector("#turn-label")?.textContent !==
              expectedTurn ||
            !["SHOT IN FLIGHT", "RESOLVING IMPACT"].includes(
              document.querySelector("#fire small")?.textContent ?? "",
            )
          )
            return null;
          return {
            angle: +document.querySelector<HTMLInputElement>("#angle")!.value,
            power: +document.querySelector<HTMLInputElement>("#power")!.value,
            weapon: document
              .querySelector(".weapon.selected")!
              .getAttribute("data-weapon"),
          };
        },
        `TURN ${String(turn).padStart(2, "0")}`,
      );
      return committed;
    })
    .not.toBeNull();
  expect(committed!.angle).toBeGreaterThanOrEqual(0);
  expect(committed!.angle).toBeLessThanOrEqual(180);
  expect(committed!.power).toBeGreaterThanOrEqual(0);
  expect(committed!.power).toBeLessThanOrEqual(100);
  expect([
    "standard",
    "heavy",
    "triple",
    "cluster",
    "bunker",
    "mega", "napalm", "betty", "airstrike", "seismic",
  ]).toContain(committed!.weapon);
  return committed!;
}
async function battlefieldFits(page: Page) {
  // Phaser fits its canvas asynchronously after a layout/orientation change.
  // Poll the actual bounds and keep both containment assertions.
  await expect(async () => {
    const canvas = await page.locator("canvas").boundingBox();
    const stage = await page.locator(".stage").boundingBox();
    expect(canvas).not.toBeNull();
    expect(stage).not.toBeNull();
    expect(canvas!.x).toBeGreaterThanOrEqual(stage!.x - 1);
    expect(canvas!.x + canvas!.width).toBeLessThanOrEqual(
      stage!.x + stage!.width + 1,
    );
  }).toPass({ timeout: 5000 });
}

test("production menu, keyboard, ten loadouts, pause, settings, local turns and resize", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.clock.install();
  await ready(page);
  await page.screenshot({
    path: "test-results/menu-desktop.png",
    fullPage: true,
  });
  await expect(page.locator("#menu")).toContainText(`V.${version}`);
  expect(await page.evaluate(() => "__TINY_TANKS_TEST__" in window)).toBe(
    false,
  );
  await page.locator("#menu-help").click();
  await expect(page.getByText("Aim high. Hit hard.")).toBeVisible();
  await page.locator("#got-it").click();
  await settings(page, "4", "normal", "100", "desert");
  await page.locator("#play-local").click();
  await expect(page.locator("#players .player-card")).toHaveCount(4);
  await expect(page.locator("#fire")).toBeEnabled();
  for (let i = 1; i <= 10; i++) {
    await page.locator("body").click({ position: { x: 2, y: 2 } });
    await page.keyboard.press(String(i % 10));
    await expect(page.locator(".weapon.selected .weapon-name")).toHaveText(
      ["Shell", "Heavy", "Triple", "Cluster", "Bunker", "Mega", "Napalm", "Betty", "Air strike", "Seismic"][i - 1],
    );
  }
  await page.keyboard.press("1");
  await page.keyboard.down("ArrowLeft");
  try {
    await expect
      .poll(async () => +(await page.locator("#angle").inputValue()))
      .toBeGreaterThan(55);
  } finally {
    await page.keyboard.up("ArrowLeft");
  }
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
  // Advance a defined pause window without sleeping in wall-clock time.
  await page.clock.runFor(900);
  expect(await page.locator("#turn-label").textContent()).toBe(turn);
  await page.locator("#resume").click();
  await expect(page.locator("#turn-label")).toHaveText("TURN 02", {
    timeout: 20000,
  });
  await expect(page.locator("#match-title")).toContainText("Ember");
  await expect(page.locator("#status")).toContainText("Ember");
  await expect(page.locator("#fire")).toBeEnabled();
  // Local turns must stay put even as simulation time advances.
  await page.clock.runFor(1200);
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

for (const rematch of ["rematch", "same-map"] as const) {
  test(`bounded human vs AI match resolves damage, winner and ${rematch}`, async ({
    page,
  }) => {
    await ready(page, 145);
    await settings(page, "2", "normal", "75", "green", false, true);
    await page.locator("#play-ai").click();
    // Vertical shells land on Clover. This guarantees a defeat within five
    // human shots under the 2.2 damage cap, regardless of whether the AI hits.
    // Zero power still launches a real shell at the minimum speed, keeping
    // these self hits short. Reduced motion avoids testing turret animation
    // again here; the separate Normal integration scenario retains animation.
    await fireShot(page, 90, 0);
    const committed = await committedAIShot(page, 2);
    await humanTurn(page, 3);
    let shots = 1;
    while (shots < 5 && !(await page.locator("#rematch").isVisible())) {
      const turn = shots * 2 + 1;
      await humanTurn(page, turn);
      await fireShot(page, 90, 0);
      shots++;
      await expect
        .poll(
          () =>
            page.evaluate(
              (nextTurn) =>
                !!document.querySelector("#rematch") ||
                (document.querySelector("#turn-label")?.textContent ===
                  nextTurn &&
                  !document.querySelector<HTMLButtonElement>("#fire")!
                    .disabled),
              `TURN ${String(turn + 2).padStart(2, "0")}`,
            ),
          { timeout: 20000 },
        )
        .toBe(true);
    }
    expect(shots).toBeLessThanOrEqual(5);
    await expect(page.locator("#rematch")).toBeVisible();
    await expect(page.locator("#same-map")).toBeVisible();
    await expect(page.locator("dialog h2")).toHaveText("Ember takes the hill.");
    await expect(page.locator(".health-number").first()).toHaveText("0HP");
    await expect(page.locator(".eliminated")).toHaveCount(1);
    await expect(page.locator(".results")).toContainText("DAMAGE");
    await expect(page.locator(".results")).toContainText("KILLS");
    await expect(page.locator(".results")).toContainText("HIT %");
    const record = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("tiny-tanks-record-v2")!),
    );
    expect(record).toMatchObject({ matches: 1, wins: 0, losses: 1, draws: 0 });
    await page.screenshot({
      path: `test-results/match-results-${rematch}.png`,
      fullPage: true,
    });
    // A frozen Date.now() would otherwise make both buttons replay seed 145,
    // masking a broken same-map handler. Only that button must retain the seed.
    await page.clock.setFixedTime(new Date(146));
    await page.locator(`#${rematch}`).click();
    await humanTurn(page, 1);
    await expect(page.locator(".health-number")).toHaveText(["75HP", "75HP"]);
    await expect(page.locator(".eliminated")).toHaveCount(0);
    await fireShot(page, 90, 0);
    const nextCommitted = await committedAIShot(page, 2);
    if (rematch === "same-map") expect(nextCommitted).toEqual(committed);
    else expect(nextCommitted).not.toEqual(committed);
    // Replay coverage ends at the committed launch. Full AI shot resolution
    // is covered by the separate two-exchange integration scenario.
    await page.locator("#records").click();
    await expect(page.getByText("A little bragging rights.")).toBeVisible();
    await expect(page.locator(".achievement-list .achievement")).toHaveCount(5);
    await page.getByRole("button", { name: "Close dialog" }).click();
    expect(
      await page.evaluate(
        () => JSON.parse(localStorage.getItem("tiny-tanks-record-v2")!).matches,
      ),
    ).toBe(1);
  });
}

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
  await battlefieldFits(page);
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
  await battlefieldFits(page);
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
  const releaseResponse = await page.request.get("release.json");
  expect(releaseResponse.ok()).toBe(true);
  const release = await releaseResponse.json();
  expect(release.version).toBe(version);
  expect(release.assets.some((asset: string) => asset.startsWith("assets/index-") && asset.endsWith(".js"))).toBe(true);
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
    "Mega Bomb", "Napalm", "Bouncing Betty", "Air Strike", "Seismic Charge",
  ]) {
    if (name !== "Standard Shell") {
      await page.locator("#pause").click();
      await page.locator("#restart").click();
    }
    await page.getByRole("button", { name, exact: true }).click();
    if (name === "Air Strike") await setRange(page, "air-target", 640);
    await setRange(page, "angle", 60);
    await setRange(page, "power", 35);
    await page.locator("#fire").click();
    await expect(page.locator("#turn-label")).toHaveText("TURN 02", {
      timeout: 20000,
    });
    await expect(page.locator("#fire")).toBeEnabled();
  }
});

test("Quick Play resets battle rules in one click, preserves comfort settings, and supports smooth aim holds", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => {
    let seed = 593;
    Math.random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
      return (seed >>> 0) / 4294967296;
    };
  });
  await ready(page);
  await page.locator("#settings").click();
  await page.locator("[name=players]").selectOption("4");
  await page.locator("[name=difficulty]").selectOption("hard");
  await page.locator("[name=health]").selectOption("150");
  await page.locator("[name=wind]").uncheck();
  await page.locator("[name=crates]").uncheck();
  await page.locator("[name=preview]").uncheck();
  await page.locator("[name=reducedMotion]").check();
  await page.locator("[name=inputSpeed]").selectOption("precise");
  await page.getByRole("button", { name: "Save settings" }).click();
  await page.locator("#quick-play").click();
  await expect(page.locator("#fire")).toBeEnabled();
  await expect(page.locator("#players .player-card")).toHaveCount(3);
  await expect(
    page.locator(".player-details span").filter({ hasText: "CPU" }),
  ).toHaveCount(2);
  const settings = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("tiny-tanks-settings")!),
  );
  expect(settings).toMatchObject({
    mode: "ai",
    players: 3,
    difficulty: "normal",
    health: 100,
    wind: true,
    crates: true,
    preview: false,
    reducedMotion: true,
    inputSpeed: "precise",
    movement: true,
    supplies: true,
    environmentalEvents: true,
  });
  await expect(page.locator("body")).toHaveClass(/reduced-motion/);
  await expect(page.locator("#weapon-info")).toContainText("Standard Shell");
  const before = +(await page.locator("#angle").inputValue());
  const plus = page.getByRole("button", { name: "Increase angle" });
  await plus.hover();
  await page.mouse.down();
  try {
    await expect
      .poll(async () => +(await page.locator("#angle").inputValue()))
      .toBeGreaterThan(before + 1);
  } finally {
    await page.mouse.up();
  }
  expect(+(await page.locator("#angle").inputValue())).toBeGreaterThan(
    before + 1,
  );
  await page.locator("#pause").click();
  await page.locator("#pause-settings").click();
  await expect(page.locator("[name=crates]")).toBeChecked();
  await expect(page.locator("[name=preview]")).not.toBeChecked();
  await page.getByRole("button", { name: "Save settings" }).click();
  await page.locator("#resume").click();
  await page.locator("#fire").click();
  await expect(page.locator("#fire")).toBeDisabled();
  await expect(page.locator("#fire small")).toHaveText("SHOT IN FLIGHT");
  expect(errors).toEqual([]);
});

test("Normal AI naturally misses then damages an opponent in two exchanges", async ({
  page,
}) => {
  // Accuracy distributions belong to the real-physics unit calibration guard.
  // This integration scenario checks exactly two unmodified AI launches.
  await ready(page, 143);
  await settings(page, "2", "normal", "75", "green", false);
  await page.locator("#play-ai").click();
  for (const [aiTurn, humanHealth] of [
    [2, "75HP"],
    [4, "46.5HP"],
  ] as const) {
    await fireShot(page, 45);
    await committedAIShot(page, aiTurn);
    await humanTurn(page, aiTurn + 1);
    await expect(page.locator(".health-number")).toHaveText([
      humanHealth,
      "75HP",
    ]);
    await expect(page.locator(".eliminated")).toHaveCount(0);
  }
  await expect(page.locator("#rematch")).toHaveCount(0);
});

test("2.2 settings and statistics remain compatible with new match options", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "tiny-tanks-settings",
      JSON.stringify({
        mode: "local",
        players: 4,
        difficulty: "hard",
        health: 150,
        wind: false,
        theme: "moon",
        crates: false,
        movement: false,
        preview: false,
        reducedMotion: true,
        inputSpeed: "precise",
      }),
    );
    localStorage.setItem(
      "tiny-tanks-record-v2",
      JSON.stringify({ matches: 7, wins: 2, losses: 5, damage: 420 }),
    );
  });
  await page.goto("./");
  await expect(page.locator("#players .player-card")).toHaveCount(4);
  await page.locator("#settings").click();
  await expect(page.locator("[name=players]")).toHaveValue("4");
  await expect(page.locator("[name=theme]")).toHaveValue("moon");
  await expect(page.locator("[name=profile]")).toHaveValue("rolling");
  await expect(page.locator("[name=movement]")).not.toBeChecked();
  await expect(page.locator("[name=environmentalEvents]")).not.toBeChecked();
  await expect(page.locator("[name=supplies]")).toBeChecked();
  await page.getByRole("button", { name: "Save settings" }).click();
  await page.locator("#menu-stats").click();
  await expect(
    page.locator(".record-grid > div").nth(2).locator("strong"),
  ).toHaveText("7");
  await expect(page.locator(".survival-record")).toContainText("Best streak 0");
});
