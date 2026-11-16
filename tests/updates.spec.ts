import { test, expect } from "@playwright/test";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { once } from "node:events";

test.skip(!!process.env.TEST_URL, "Upgrade fixtures use a local origin and the production build");
const legacyHTML = `<!doctype html><html><body><p id="legacy">Tiny Tanks V.2.2.0</p><script>navigator.serviceWorker.register('./sw.js');</script></body></html>`;
const legacyWorker = `const legacyCache='tiny-tanks-legacy-fixture';
self.addEventListener('install',event=>event.waitUntil(caches.open(legacyCache).then(cache=>cache.add(new URL('index.html',self.registration.scope).href))));
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('fetch',event=>{if(event.request.mode==='navigate')event.respondWith(caches.match(new URL('index.html',self.registration.scope).href));});`;
async function fixture(legacy: boolean) {
  let revision = 0;
  const dist = resolve("dist");
  const prefix: string = JSON.parse(await readFile(resolve(dist, "manifest.webmanifest"), "utf8")).scope;
  const server = createServer(async (request, response) => {
    try {
      const pathname = new URL(request.url!, "http://fixture").pathname;
      if (!pathname.startsWith(prefix)) { response.writeHead(404).end(); return; }
      const name = pathname.slice(prefix.length) || "index.html";
      const path = resolve(dist, name);
      if (!path.startsWith(dist + "/")) { response.writeHead(404).end(); return; }
      const type: Record<string,string> = { ".html":"text/html", ".js":"text/javascript", ".css":"text/css", ".json":"application/json", ".webmanifest":"application/manifest+json", ".svg":"image/svg+xml", ".png":"image/png" };
      response.setHeader("Content-Type",type[extname(path)] ?? "application/octet-stream");
      response.setHeader("Cache-Control","no-store");
      if(legacy && name==="index.html") response.end(legacyHTML);
      else if(name==="sw.js") response.end(legacy ? legacyWorker : `${await readFile(path,"utf8")}\n// update fixture ${revision}`);
      else response.end(await readFile(path));
    } catch { response.writeHead(404).end(); }
  });
  server.listen(0,"127.0.0.1"); await once(server,"listening");
  const address = server.address();
  if(!address || typeof address==="string") throw new Error("Missing fixture port");
  return {
    url: `http://127.0.0.1:${address.port}${prefix}`,
    deploy() { legacy=false; revision++; },
    async close() { server.closeAllConnections(); await new Promise<void>((done,error)=>server.close(e=>e?error(e):done())); },
  };
}

test("cached 2.2 upgrades with another old tab open, preserves progress and reloads offline",async({context})=>{
  const host=await fixture(true);
  try {
    const page=await context.newPage(); await page.goto(host.url);
    await page.evaluate(async()=>{await navigator.serviceWorker.ready;});
    await expect.poll(()=>page.evaluate(()=>!!navigator.serviceWorker.controller)).toBe(true);
    await page.evaluate(()=>{
      localStorage.setItem("tiny-tanks-record-v2",JSON.stringify({matches:7,wins:2,losses:5,damage:420}));
      localStorage.setItem("tiny-tanks-survival-v1",JSON.stringify({bestStreak:4,bestScore:6000,bestKills:9,runs:3}));
    });
    const other=await context.newPage(); await other.goto(host.url);
    await expect(other.locator("#legacy")).toHaveText("Tiny Tanks V.2.2.0");
    host.deploy();
    // Demonstrate the original symptom: a reload still gets the cached 2.2 HTML.
    await page.reload(); await expect(page.locator("#legacy")).toContainText("2.2.0");
    await page.evaluate(async()=>{await (await navigator.serviceWorker.ready).update();});
    await expect.poll(()=>page.evaluate(async()=>{
      const registration=await navigator.serviceWorker.getRegistration();
      return (await caches.keys()).some(key=>key.startsWith("workbox-precache")) &&
        !registration?.installing && !registration?.waiting && registration?.active?.state==="activated";
    })).toBe(true);
    await page.reload();
    await expect(page.locator("#menu")).toContainText("V.2.4.0");
    await expect(other.locator("#legacy")).toContainText("2.2.0");
    await page.locator("#menu-stats").click();
    await expect(page.locator(".record-grid")).toContainText("7");
    await expect(page.locator(".survival-record")).toContainText("Best streak 4");
    await page.getByRole("button",{name:"Close dialog"}).click();
    await context.setOffline(true); await page.reload();
    await expect(page.locator("#menu")).toContainText("V.2.4.0");
    await page.locator("#quick-play").click(); await expect(page.locator("#fire")).toBeEnabled();
  } finally { await context.setOffline(false); await host.close(); }
});

test("new offline assets activate without reloading an active match; the menu offers a safe update",async({page})=>{
  const host=await fixture(false);
  try {
    await page.goto(host.url); await expect(page.locator("#quick-play")).toBeVisible();
    await page.evaluate(async()=>{await navigator.serviceWorker.ready;});
    await expect.poll(()=>page.evaluate(()=>!!navigator.serviceWorker.controller)).toBe(true);
    await expect(page.locator("#update-notice")).toBeHidden();
    await page.locator("#play-local").click(); await expect(page.locator("#fire")).toBeEnabled();
    const origin=await page.evaluate(()=>performance.timeOrigin);
    host.deploy();
    await page.evaluate(async()=>{await (await navigator.serviceWorker.ready).update();});
    await expect(page.locator("#update-notice")).toBeVisible();
    await expect(page.locator("#apply-update")).toBeDisabled();
    expect(await page.evaluate(()=>performance.timeOrigin)).toBe(origin);
    await expect(page.locator("#turn-label")).toHaveText("TURN 01");
    await page.locator("#pause").click(); await page.locator("#home").click();
    await expect(page.locator("#apply-update")).toBeEnabled();
    await page.locator("#apply-update").click();
    await expect(page.locator("#menu")).toContainText("V.2.4.0");
    await expect(page.locator("#update-notice")).toBeHidden();
    expect(await page.evaluate(()=>performance.timeOrigin)).not.toBe(origin);
  } finally { await host.close(); }
});
