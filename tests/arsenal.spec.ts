import { test, expect, type Page } from "@playwright/test";
import type { TestAPI } from "../src/testing";
declare global { interface Window { __TINY_TANKS_TEST__: TestAPI; } }
const repo = process.env.GITHUB_REPOSITORY?.split("/")[1];
const base = process.env.VITE_BASE_PATH ?? (process.env.GITHUB_ACTIONS && repo ? `/${repo}/` : "/");
test.use({ baseURL: `http://127.0.0.1:4175${base}` });
test.skip(!!process.env.TEST_URL, "The controlled fixture API is excluded from production");
async function ready(page: Page, mode = "play-local") {
  await page.clock.setFixedTime(new Date(240)); await page.goto("./");
  await expect(page.locator("#players .player-card")).toHaveCount(3);
  await expect.poll(() => page.evaluate(() => !!window.__TINY_TANKS_TEST__)).toBe(true);
  await page.locator("#settings").click(); await page.locator("[name=players]").selectOption("2");
  await page.getByRole("button", {name: "Save settings"}).click();
  await page.locator(`#${mode}`).click(); await expect(page.locator("#fire")).toBeEnabled();
}
async function range(page: Page, id: string, value: number) {
  await page.locator(`#${id}`).evaluate((el,value) => { (el as HTMLInputElement).value=String(value); el.dispatchEvent(new Event("input",{bubbles:true})); },value);
}
async function aim(page: Page, angle: number, power: number) { await range(page,"angle",angle); await range(page,"power",power); }
async function snapshot(page: Page) { return page.evaluate(() => window.__TINY_TANKS_TEST__.snapshot()); }
for (const [id, angle, power] of [["napalm", 5, 35],["betty", 5, 35],["seismic", 5, 35]] as const) {
  test(`${id} fires, changes terrain and resolves its bounded effects`, async ({page}) => {
    await ready(page); await page.evaluate(() => window.__TINY_TANKS_TEST__.prepare("arsenal"));
    await page.locator(`[data-weapon=${id}]`).click(); await aim(page,angle,power);
    await page.locator("#fire").click();
    await expect(page.locator("#turn-label")).toHaveText("TURN 02", {timeout:20000});
    const state = await snapshot(page);
    expect(state.terrainVersion).toBeGreaterThan(1);
    expect(state.projectiles).toHaveLength(0); expect(state.events.some(e => e.type === "blast" && e.weapon === id)).toBe(true);
    expect(state.tanks[0].ammo[id]).toBe(id === "betty" ? 2 : 1);
    if (id === "betty") {
      expect(state.events.filter(e => e.type === "bounce").length).toBeGreaterThan(0);
      expect(state.events.filter(e => e.type === "bounce").length).toBeLessThanOrEqual(3);
    }
    if (id === "seismic") expect(state.events.some(e => e.type === "blast")).toBe(true);
    if (id === "napalm") {
      expect(state.fires).toHaveLength(1);
      for (let turn=3; turn<=5; turn++) {
        await aim(page,180,100); await page.locator("#fire").click();
        await expect(page.locator("#turn-label")).toHaveText(`TURN 0${turn}`,{timeout:20000});
      }
      expect((await snapshot(page)).fires).toHaveLength(0);
    }
  });
}
test("shield consumes a keyboard turn and absorbs a confirmed five-shell Air Strike", async ({page}) => {
  await ready(page); await page.evaluate(() => window.__TINY_TANKS_TEST__.prepare("arsenal"));
  await page.locator("body").click({position:{x:2,y:2}}); await page.keyboard.press("s");
  await expect(page.locator("#turn-label")).toHaveText("TURN 02");
  expect((await snapshot(page)).tanks[0].shield).toBe(30);
  await page.locator('[data-weapon="airstrike"]').click();
  await expect(page.locator("#fire")).toBeDisabled();
  await expect(page.locator("#air-controls")).toBeVisible();
  await range(page,"air-target",135); await expect(page.locator("#air-target-output")).toContainText("135");
  await expect(page.locator("#fire")).toBeEnabled(); await page.locator("#fire").click();
  await expect(page.locator("#turn-label")).toHaveText("TURN 03",{timeout:10000});
  const state=await snapshot(page);
  expect(state.events.filter(e=>e.type === "air-warning")).toHaveLength(1);
  expect(state.events.filter(e=>e.type === "blast")).toHaveLength(5);
  expect(state.events.some(e=>e.type === "shield" && e.action === "absorb")).toBe(true);
  expect(state.tanks[0].health).toBeGreaterThanOrEqual(92);
  expect(state.tanks[1].ammo.airstrike).toBe(1);
});
test("Survival shop charges resources once, restores a checkpoint and applies purchases to battle two",async({page})=>{
  await ready(page,"play-survival"); await page.evaluate(()=>window.__TINY_TANKS_TEST__.prepare("survival-win"));
  await aim(page,5,55); await page.locator("#fire").click();
  await expect(page.locator("#survival-shop")).toBeVisible({timeout:20000});
  const credits=Number(await page.locator("#shop-credits").textContent()); expect(credits).toBeGreaterThanOrEqual(75);
  await page.locator('[data-buy="ammo"]').click();
  await expect(page.locator("#shop-credits")).toHaveText(String(credits-25));
  await page.locator('[data-buy="repair"]').click();
  await expect(page.locator("#shop-credits")).toHaveText(String(credits-60));
  await page.reload(); await expect(page.locator("#play-survival")).toContainText("Resume Survival");
  await page.locator("#play-survival").click();
  await expect(page.locator("#shop-credits")).toHaveText(String(credits-60));
  await page.locator("#survival-continue").click();
  await expect(page.locator("#match-mode")).toContainText("BATTLE 2");
  await expect(page.locator(".health-number").first()).toHaveText("80HP");
  expect((await snapshot(page)).tanks[0].ammo.betty).toBe(1);
  expect(await page.evaluate(()=>localStorage.getItem("tiny-tanks-run-v1"))).toBeNull();
});
const solutions = [["precision",2,62],["ricochet",2,58],["demolition",10,92],["laststand",2,80],["chain",2,52]] as const;
for(const [id,angle,power] of solutions) test(`challenge ${id} is playable and completable through real controls`,async({page})=>{
  await page.goto("./"); await expect(page.locator("#play-challenges")).toBeVisible();
  await page.locator("#play-challenges").click(); await page.locator(`[data-challenge=${id}]`).click();
  await expect(page.locator("#challenge-objective")).toBeVisible();
  await aim(page,angle,power); await page.locator("#fire").click();
  if(id === "laststand") {
    await expect(page.locator("#turn-label")).toHaveText("TURN 03",{timeout:20000});
    await expect(page.locator("#fire")).toBeEnabled(); await aim(page,angle,power); await page.locator("#fire").click();
  }
  await expect(page.locator("#challenge-result")).toContainText("Success",{timeout:20000});
  expect(await page.evaluate((id)=>JSON.parse(localStorage.getItem("tiny-tanks-challenges-v1")!)[id],id)).toBeGreaterThan(0);
  await page.locator("#challenge-retry").click();
  await expect(page.locator("#turn-label")).toHaveText("TURN 01");
  await expect(page.locator(".health-number").first()).toHaveText(id === "laststand" ? "18HP" : "100HP");
});
test("challenge limited ammunition fails clearly and restarts consistently",async({page})=>{
  await page.goto("./"); await page.locator("#play-challenges").click(); await page.locator('[data-challenge="precision"]').click();
  for(let i=0;i<2;i++) {
    await aim(page,180,100); await page.locator("#fire").click();
    if(i===0) await expect(page.locator("#turn-label")).toHaveText("TURN 02",{timeout:10000});
  }
  await expect(page.locator("#challenge-result")).toContainText("Challenge failed");
  await page.locator("#challenge-retry").click(); await expect(page.locator('[data-weapon="standard"] .weapon-ammo')).toHaveText("2");
  await page.locator("#challenge-restart").click(); await expect(page.locator("#turn-label")).toHaveText("TURN 01");
});
test("mobile ten-weapon targets fit, touch confirms Air Strike and shield remains accessible",async({browser})=>{
  const context=await browser.newContext({hasTouch:true,isMobile:true,viewport:{width:390,height:844}});
  const page=await context.newPage(); await ready(page); await page.evaluate(()=>window.__TINY_TANKS_TEST__.prepare("arsenal"));
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  for(const id of ["napalm","betty","seismic","airstrike"]){
    const button=page.locator(`[data-weapon=${id}]`); const box=(await button.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44); expect(box.height).toBeGreaterThanOrEqual(44);
    await button.tap(); await expect(button).toHaveAttribute("aria-pressed","true");
  }
  await expect(page.locator("#fire")).toBeDisabled();
  const canvas=page.locator("canvas"); await canvas.scrollIntoViewIfNeeded(); const box=(await canvas.boundingBox())!;
  await canvas.tap({position:{x:box.width*0.55,y:box.height*0.4}});
  await expect(page.locator("#air-target-output")).toContainText("FIRE TO CONFIRM");
  await page.locator("#fire").tap(); await expect(page.locator("#turn-label")).toHaveText("TURN 02",{timeout:10000});
  await page.locator("#shield").tap(); await expect(page.locator("#turn-label")).toHaveText("TURN 03");
  await page.screenshot({path:"test-results/arsenal-mobile.png",fullPage:true}); await context.close();
});
