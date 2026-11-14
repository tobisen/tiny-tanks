import { DEFAULT_SETTINGS, THEMES, type Settings } from "../game/config";
import type { BattleScene } from "../game/scene";
import { WEAPONS, type WeaponId } from "../game/weapons";

const icon = (name: string) => {
  const paths: Record<string, string> = {
    sound:
      '<path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
    mute: '<path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="m16 9 6 6m0-6-6 6"/>',
    pause: '<path d="M8 5v14M16 5v14"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9 9a3 3 0 0 1 6 0c0 2-3 2-3 4m0 3h.01"/>',
    close: '<path d="m6 6 12 12M18 6 6 18"/>',
    arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
    wind: '<path d="M3 8h12a3 3 0 1 0-3-3M2 12h17a3 3 0 1 1-3 3M4 16h5a2 2 0 1 1-2 2"/>',
    target:
      '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3"/>',
    flag: '<path d="M5 21V3m0 0c5-5 9 5 15 0v11c-6 5-10-5-15 0"/>',
    settings: '<path d="M4 7h16M4 17h16M8 4v6m8 4v6"/>',
    shell: '<path d="M9 19V8l3-5 3 5v11H9Z"/><path d="M9 15h6M8 21h8"/>',
    heavy: '<path d="M7 20V8l5-5 5 5v12H7Zm0-5h10M9 9h6"/>',
    triple:
      '<path d="m4 19 2-9 3-4 1 5-2 9m6 0-1-10 2-5 3 4 2 10M11 18V7l2-4 2 4"/>',
    cluster:
      '<circle cx="12" cy="8" r="4"/><circle cx="5" cy="18" r="2"/><circle cx="12" cy="20" r="2"/><circle cx="19" cy="18" r="2"/><path d="m7 12-2 3m7-1v3m5-5 2 3"/>',
    bunker: '<path d="M9 3h6v10h3l-6 8-6-8h3V3ZM3 21h18M4 17v4m16-4v4"/>',
    mega: '<path d="m14 3 3 3-3 3m1-4-5 5"/><circle cx="11" cy="15" r="7"/><path d="m8 12 6 6m0-6-6 6M19 2v3m-1-1h3"/>',
  };
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] ?? paths.target}</svg>`;
};
const tankLogo =
  '<svg viewBox="0 0 44 32" fill="currentColor" aria-hidden="true"><path d="M5 20h34v9H5zM1 23h4v3H1zm38 0h4v3h-4zM9 13h24v7H9zM16 7h15v6H16zM28 5l12-5 2 5-13 5z"/><path fill="#111e27" d="M9 23h5v3H9zm10 0h5v3h-5zm10 0h5v3h-5z"/></svg>';

export class AppUI {
  private settings: Settings = { ...DEFAULT_SETTINGS };
  private screen: "menu" | "game" = "menu";
  private scene?: BattleScene;
  private dialog = document.createElement("dialog");
  private promptInstall?: Event & { prompt: () => Promise<void> };
  private ready = false;
  private settingsReturn: "menu" | "pause" = "menu";
  private beforeHelpPaused = false;
  constructor() {
    try {
      const saved = JSON.parse(
        localStorage.getItem("tiny-tanks-settings") ?? "null",
      ) as Partial<Settings> | null;
      if (saved) {
        this.settings = {
          mode: saved.mode === "local" ? "local" : "ai",
          players: [2, 3, 4].includes(saved.players ?? 0) ? saved.players! : 3,
          difficulty: ["easy", "normal", "hard"].includes(
            saved.difficulty ?? "",
          )
            ? saved.difficulty!
            : "normal",
          wind: saved.wind !== false,
          theme: ["green", "desert", "moon"].includes(saved.theme ?? "")
            ? saved.theme!
            : "green",
          health: [75, 100, 150].includes(saved.health ?? 0)
            ? saved.health!
            : 100,
        };
      }
    } catch {
      /* Storage is optional. */
    }
    document.querySelector<HTMLDivElement>("#app")!.innerHTML = `
      <div class="shell">
        <header class="topbar"><a class="brand" href="#" aria-label="Tiny Tanks home">${tankLogo}<span>TINY TANKS</span></a><div class="topbar-center"><span class="live-dot"></span> SMALL TANKS. BIG TROUBLE.</div><nav aria-label="Game actions"><button class="icon-button" id="sound" aria-label="Mute sound">${icon("sound")}</button><button class="icon-button" id="help" aria-label="How to play">${icon("help")}</button><button class="icon-button" id="pause" aria-label="Pause game" disabled>${icon("pause")}</button></nav></header>
        <main>
          <div class="match-heading"><div><span class="eyebrow" id="match-mode">THE PROVING GROUNDS</span><h1 id="match-title">A good day to make a crater.</h1></div><div class="match-meta"><span class="theme-dot"></span><span id="theme-label">GREEN HILLS</span><span class="meta-divider">/</span><span id="turn-label">READY WHEN YOU ARE</span></div></div>
          <section class="battlefield" aria-label="Artillery battlefield">
            <div class="battle-top"><div id="players" class="players" aria-label="Tank health"></div><div class="wind-card">${icon("wind")}<div><span class="micro-label">WIND</span><strong id="wind-value">CALM</strong></div></div></div>
            <div class="stage"><div id="game" aria-label="Tiny Tanks game canvas"></div>
              <div id="menu" class="menu"><div class="menu-content"><p class="eyebrow"><span class="tiny-star">✳</span> A LITTLE FRIENDLY DESTRUCTION</p><h2>TINY<br>TANKS<span>.</span></h2><p class="menu-description">Take your shot. Move mountains.<br>Try to keep your friends.</p><div class="menu-actions"><button class="button primary" id="play-ai">Play vs AI ${icon("arrow")}</button><button class="button secondary" id="play-local">Local multiplayer <span>2–4 P</span></button></div><div class="menu-links"><button id="settings">${icon("settings")} Match settings</button><span>·</span><button id="menu-help">How to play ${icon("arrow")}</button></div></div><div class="field-note"><span>EST. 2026</span><strong>MAKE A LITTLE<br>BIG TROUBLE.</strong><span>ORIGINAL ARCADE ARTILLERY</span></div></div>
              <div class="field-coordinates" aria-hidden="true"><span>TT / FIELD OPERATIONS</span><span>01 — NO SMALL EXPLOSIONS</span></div>
            </div>
            <div id="controls" class="controls"><div class="weapon-section"><div class="control-heading"><span class="micro-label">01 / LOADOUT</span><span id="ammo-label">UNLIMITED AMMO</span></div><div class="weapons" role="group" aria-label="Weapon selection">${WEAPONS.map((w, i) => `<button class="weapon${i === 0 ? " selected" : ""}" data-weapon="${w.id}" title="${w.name} — ${w.description}" aria-label="${w.name}" aria-pressed="${i === 0}"><span class="weapon-key">${i + 1}</span>${icon(w.id === "standard" ? "shell" : w.id)}<span class="weapon-name">${w.short}</span><span class="weapon-ammo">${Number.isFinite(w.ammo) ? w.ammo : "∞"}</span></button>`).join("")}</div></div>
            <div class="aim-control"><div class="control-heading"><label class="micro-label" for="angle">02 / ANGLE</label><output id="angle-output" for="angle">55<span>°</span></output></div><div class="range-line"><button class="adjust" data-adjust="angle:-1" aria-label="Decrease angle">−</button><input id="angle" type="range" min="0" max="180" value="55" aria-label="Firing angle"><button class="adjust" data-adjust="angle:1" aria-label="Increase angle">+</button></div><div class="range-labels"><span>RIGHT 0°</span><span>LEFT 180°</span></div></div>
            <div class="aim-control"><div class="control-heading"><label class="micro-label" for="power">03 / POWER</label><output id="power-output" for="power">64<span>%</span></output></div><div class="range-line"><button class="adjust" data-adjust="power:-1" aria-label="Decrease power">−</button><input id="power" type="range" min="0" max="100" value="64" aria-label="Firing power"><button class="adjust" data-adjust="power:1" aria-label="Increase power">+</button></div><div class="range-labels"><span>A LITTLE</span><span>A LOT</span></div></div>
            <button class="fire-button" id="fire" disabled>${icon("target")}<span>FIRE<small>SPACE TO SEND IT</small></span>${icon("arrow")}</button></div>
          </section>
          <div class="under-field"><span id="status" role="status" aria-live="polite"><span class="live-dot"></span> Six weapons. Destructible terrain. Zero hard feelings.</span><span class="keyboard-hints"><kbd>←</kbd><kbd>→</kbd> angle <kbd>↑</kbd><kbd>↓</kbd> power <kbd>1–6</kbd> weapons</span></div>
        </main>
        <footer><span>BUILT FOR GOOD OLD-FASHIONED RIVALRY.</span><div><button id="install" hidden>INSTALL GAME ↗</button><span>NO ACCOUNTS. NO ADS. JUST ARTILLERY.</span><span class="version">V.1.0</span></div></footer>
      </div>`;
    this.dialog.className = "modal";
    document.body.append(this.dialog);
    this.bind();
  }
  attach(scene: BattleScene): void {
    this.scene = scene;
    scene.onChange = () => this.sync();
    scene.onReady = () => {
      this.ready = true;
      scene.startMatch(this.settings, true, 2026);
      this.restoreAudio();
      this.sync();
    };
  }
  private restoreAudio(): void {
    try {
      const audio = JSON.parse(
        localStorage.getItem("tiny-tanks-audio") ?? "{}",
      ) as { enabled?: boolean; volume?: number };
      this.scene!.soundFX.enabled = audio.enabled !== false;
      this.scene!.soundFX.volume =
        typeof audio.volume === "number"
          ? Math.max(0, Math.min(1, audio.volume))
          : 0.65;
    } catch {
      /* Optional. */
    }
  }
  private save(): void {
    try {
      localStorage.setItem(
        "tiny-tanks-settings",
        JSON.stringify(this.settings),
      );
      if (this.scene)
        localStorage.setItem(
          "tiny-tanks-audio",
          JSON.stringify({
            enabled: this.scene.soundFX.enabled,
            volume: this.scene.soundFX.volume,
          }),
        );
    } catch {
      /* Game works without storage. */
    }
  }
  private byId<T extends HTMLElement = HTMLElement>(id: string): T {
    return document.getElementById(id) as T;
  }
  private click(id: string, handler: () => void): void {
    this.byId(id).addEventListener("click", () => {
      this.scene?.soundFX.unlock();
      this.scene?.soundFX.ui();
      handler();
    });
  }
  private bind(): void {
    this.click("play-ai", () => this.start("ai"));
    this.click("play-local", () => this.start("local"));
    this.click("settings", () => this.showSettings("menu"));
    this.click("help", () => this.showHelp());
    this.click("menu-help", () => this.showHelp());
    this.click("pause", () => this.pause());
    this.click("fire", () => this.scene?.fire());
    document.querySelector(".brand")!.addEventListener("click", (e) => {
      e.preventDefault();
      if (this.screen === "game") this.pause();
    });
    this.click("sound", () => {
      if (this.scene) {
        this.scene.soundFX.enabled = !this.scene.soundFX.enabled;
        this.save();
        this.sync();
      }
    });
    for (const input of ["angle", "power"])
      this.byId<HTMLInputElement>(input).addEventListener("input", () => {
        this.scene?.setAim(
          +this.byId<HTMLInputElement>("angle").value,
          +this.byId<HTMLInputElement>("power").value,
        );
      });
    document
      .querySelectorAll<HTMLButtonElement>("[data-weapon]")
      .forEach((button) =>
        button.addEventListener("click", () =>
          this.selectWeapon(button.dataset.weapon as WeaponId),
        ),
      );
    document
      .querySelectorAll<HTMLButtonElement>("[data-adjust]")
      .forEach((button) => {
        let interval: ReturnType<typeof setInterval> | undefined;
        let repeat: ReturnType<typeof setTimeout> | undefined;
        const adjust = () => {
          if (!this.scene?.canAim) return;
          const [key, change] = button.dataset.adjust!.split(":");
          const tank = this.scene.match.current;
          this.scene.setAim(
            tank.angle + (key === "angle" ? +change : 0),
            tank.power + (key === "power" ? +change : 0),
          );
        };
        const stop = () => {
          clearInterval(interval);
          clearTimeout(repeat);
        };
        button.addEventListener("pointerdown", (e) => {
          e.preventDefault();
          button.setPointerCapture(e.pointerId);
          adjust();
          repeat = setTimeout(() => {
            interval = setInterval(adjust, 55);
          }, 280);
        });
        button.addEventListener("pointerup", stop);
        button.addEventListener("pointercancel", stop);
        button.addEventListener("lostpointercapture", stop);
        button.addEventListener("click", (event) => {
          if (event.detail === 0) adjust();
        });
      });
    window.addEventListener("keydown", (event) => {
      if (event.code === "Escape") {
        event.preventDefault();
        if (this.dialog.open) {
          this.dialog.close();
          this.resume();
        } else this.pause();
        return;
      }
      if ((event.target as HTMLElement).matches("input,select")) return;
      if (
        event.code === "Space" &&
        (event.target as HTMLElement).closest("button:not(#fire)")
      )
        return;
      if (
        this.screen === "game" &&
        ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Space"].includes(
          event.code,
        )
      )
        event.preventDefault();
      if (this.dialog.open || event.repeat) return;
      if (event.code === "Space") this.scene?.fire();
      if (/^Digit[1-6]$/.test(event.code))
        this.selectWeapon(WEAPONS[Number(event.code.slice(-1)) - 1].id);
    });
    this.dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      this.dialog.close();
      this.resume();
    });
    document.addEventListener("visibilitychange", () => {
      if (document.hidden && this.screen === "game" && !this.dialog.open)
        this.pause();
    });
    window.addEventListener("beforeinstallprompt", (event) => {
      event.preventDefault();
      this.promptInstall = event as typeof this.promptInstall;
      this.byId("install").hidden = false;
    });
    this.click("install", () => {
      void this.promptInstall?.prompt();
    });
    window.addEventListener("appinstalled", () => {
      this.byId("install").hidden = true;
    });
  }
  private selectWeapon(id: WeaponId): void {
    if (this.scene?.canAim && this.scene.match.current.ammo[id] > 0) {
      this.scene.match.current.weapon = id;
      this.scene.soundFX.ui();
      this.sync();
    }
  }
  private start(mode: Settings["mode"]): void {
    if (!this.ready || !this.scene) return;
    this.dialog.close();
    this.screen = "game";
    this.settings.mode = mode;
    this.save();
    this.scene.soundFX.unlock();
    this.scene.startMatch(this.settings);
    this.sync();
  }
  private home(): void {
    this.dialog.close();
    this.screen = "menu";
    this.scene?.startMatch(this.settings, true, 2026);
    this.sync();
  }
  private resume(): void {
    if (this.scene) this.scene.paused = false;
    this.sync();
  }
  private open(content: string): void {
    this.dialog.innerHTML = content;
    if (!this.dialog.open) this.dialog.showModal();
    this.dialog.querySelector("[data-close]")?.addEventListener("click", () => {
      this.dialog.close();
      this.resume();
    });
  }
  private heading(kicker: string, title: string): string {
    return `<div class="modal-heading"><span class="eyebrow">${kicker}</span><button class="icon-button" data-close aria-label="Close dialog">${icon("close")}</button></div><h2>${title}</h2>`;
  }
  private pause(): void {
    if (
      this.screen !== "game" ||
      !this.scene ||
      this.scene.match.phase === "over"
    )
      return;
    this.scene.paused = true;
    this.open(
      `${this.heading("TAKE A BREATHER", "Hold your fire.")}<p>The hills aren’t going anywhere. Yet.</p><div class="modal-actions"><button class="button primary" id="resume">Resume match ${icon("arrow")}</button><button class="button secondary" id="restart">Restart match</button><button class="button secondary" id="pause-settings">Sound & match settings</button><button class="text-button" id="home">Back to main menu</button></div>`,
    );
    this.click("resume", () => {
      this.dialog.close();
      this.resume();
    });
    this.click("restart", () => this.start(this.settings.mode));
    this.click("pause-settings", () => this.showSettings("pause"));
    this.click("home", () => this.home());
    this.sync();
  }
  private showSettings(from: "menu" | "pause"): void {
    this.settingsReturn = from;
    const s = this.settings;
    this
      .open(`${this.heading("YOUR BATTLE, YOUR RULES", "Set the scene.")}<p>${from === "pause" ? "Match changes apply when you restart." : "Make yourself at home. Then blow it up."}</p><form id="settings-form" class="settings-grid">
      <label>Players / tanks<select name="players">${[2, 3, 4].map((n) => `<option value="${n}" ${s.players === n ? "selected" : ""}>${n} tanks (${n - 1} AI in solo)</option>`).join("")}</select></label>
      <label>AI difficulty<select name="difficulty">${["easy", "normal", "hard"].map((d) => `<option value="${d}" ${s.difficulty === d ? "selected" : ""}>${d[0].toUpperCase() + d.slice(1)}</option>`).join("")}</select></label>
      <label>Landscape<select name="theme">${Object.entries(THEMES)
        .map(
          ([id, t]) =>
            `<option value="${id}" ${s.theme === id ? "selected" : ""}>${t.name}</option>`,
        )
        .join("")}</select></label>
      <label>Starting health<select name="health">${[75, 100, 150].map((n) => `<option value="${n}" ${s.health === n ? "selected" : ""}>${n} HP</option>`).join("")}</select></label>
      <label class="toggle-label">Wind<input name="wind" type="checkbox" ${s.wind ? "checked" : ""}></label>
      <label class="toggle-label">Sound effects<input name="sound" type="checkbox" ${this.scene?.soundFX.enabled ? "checked" : ""}></label>
      <label class="volume-label">Volume<input name="volume" type="range" min="0" max="100" value="${Math.round((this.scene?.soundFX.volume ?? 0.65) * 100)}"></label>
      <button class="button primary full-width" type="submit">Save settings ${icon("arrow")}</button></form>`);
    const form = this.byId<HTMLFormElement>("settings-form");
    form.addEventListener("input", () => {
      if (this.scene) {
        this.scene.soundFX.unlock();
        this.scene.soundFX.volume =
          +(form.elements.namedItem("volume") as HTMLInputElement).value / 100;
        this.scene.soundFX.enabled = (
          form.elements.namedItem("sound") as HTMLInputElement
        ).checked;
      }
    });
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const data = new FormData(form);
      this.settings = {
        ...this.settings,
        players: +data.get("players")!,
        difficulty: data.get("difficulty") as Settings["difficulty"],
        theme: data.get("theme") as Settings["theme"],
        health: +data.get("health")!,
        wind: data.has("wind"),
      };
      this.save();
      if (this.settingsReturn === "pause") {
        this.pause();
      } else {
        this.dialog.close();
        this.scene?.startMatch(this.settings, true, 2026);
      }
      this.sync();
    });
  }
  private showHelp(): void {
    this.beforeHelpPaused = this.scene?.paused ?? false;
    if (this.scene && this.screen === "game") this.scene.paused = true;
    this.open(
      `${this.heading("FIELD MANUAL / 001", "Aim high. Hit hard.")}<p>Last tank standing wins. Each turn, pick a weapon, set your angle and power, and send it.</p><div class="help-steps"><div><b>01</b><p><strong>Find your angle.</strong><br>0° fires right. 90° fires up. 180° fires left. Use ← / → or the angle slider.</p></div><div><b>02</b><p><strong>Give it some power.</strong><br>More power sends your shell further. Adjust with ↑ / ↓. Watch the wind before firing.</p></div><div><b>03</b><p><strong>Make a crater.</strong><br>Press Space or FIRE. Direct hits hurt most. Craters drop tanks and cause fall damage. Number keys 1–6 switch weapons.</p></div></div><p class="help-note">Local multiplayer: pass the device when the next tank’s name appears. Escape pauses. On mobile, use the sliders or hold the + / − buttons.</p><button class="button primary" id="got-it">Got it. Let’s play. ${icon("arrow")}</button>`,
    );
    this.click("got-it", () => {
      if (this.beforeHelpPaused) this.pause();
      else {
        this.dialog.close();
        this.resume();
      }
    });
    this.sync();
  }
  private gameOver(): void {
    const match = this.scene!.match,
      winner = match.tanks.find((t) => t.id === match.winnerId);
    this.open(
      `${this.heading("THE DUST HAS SETTLED", winner ? `${winner.name} takes the hill.` : "Mutual destruction.")}<p>${winner ? "One tiny tank. One very big victory." : "Nobody survived that one. Call it a draw."} ${match.turn} turns of glorious trouble.</p><div class="results"><div class="result-row result-heading"><span>TANK</span><span>DAMAGE</span><span>SHOTS</span></div>${[
        ...match.tanks,
      ]
        .sort((a, b) => b.health - a.health || b.damage - a.damage)
        .map(
          (t) =>
            `<div class="result-row"><strong style="color:${t.color}">${t.id === winner?.id ? "★ " : ""}${t.name}</strong><span>${t.damage}</span><span>${t.shots}</span></div>`,
        )
        .join(
          "",
        )}</div><div class="modal-actions"><button class="button primary" id="rematch">One more round ${icon("arrow")}</button><button class="button secondary" id="results-home">Main menu</button></div>`,
    );
    // A finished match stays on its results until a deliberate rematch/menu action.
    this.dialog.querySelector("[data-close]")?.remove();
    this.click("rematch", () => this.start(this.settings.mode));
    this.click("results-home", () => this.home());
  }
  sync(): void {
    const scene = this.scene;
    if (!scene?.match) return;
    const match = scene.match,
      tank = match.current,
      inGame = this.screen === "game";
    this.byId("menu").hidden = inGame;
    document.querySelector(".battlefield")!.classList.toggle("home", !inGame);
    this.byId("controls").classList.toggle("inactive", !inGame);
    this.byId<HTMLButtonElement>("pause").disabled =
      !inGame || match.phase === "over";
    this.byId("match-mode").textContent = inGame
      ? this.settings.mode === "ai"
        ? "SOLO SKIRMISH"
        : "PASS & PLAY"
      : "THE PROVING GROUNDS";
    this.byId("match-title").textContent = inGame
      ? match.phase === "over"
        ? "A little peace. For now."
        : `${tank.name}’s turn. Make it count.`
      : "A good day to make a crater.";
    this.byId("theme-label").textContent =
      THEMES[match.settings.theme].name.toUpperCase();
    this.byId("turn-label").textContent = inGame
      ? `TURN ${String(match.turn).padStart(2, "0")}`
      : "READY WHEN YOU ARE";
    this.byId("players").innerHTML = match.tanks
      .map(
        (t) =>
          `<div class="player-card ${inGame && t.id === tank.id ? "active" : ""} ${t.health <= 0 ? "eliminated" : ""}" style="--tank-color:${t.color}"><span class="player-avatar">${tankLogo}</span><div class="player-details"><div><strong>${t.name}</strong><span>${t.ai ? "CPU" : match.settings.mode === "ai" ? "YOU" : `P${t.id + 1}`}</span></div><div class="health-track"><i style="width:${(t.health / match.settings.health) * 100}%"></i></div></div><span class="health-number">${t.health}<small>HP</small></span></div>`,
      )
      .join("");
    this.byId("wind-value").textContent =
      match.wind === 0
        ? "CALM"
        : `${match.wind < 0 ? "←" : "→"} ${Math.abs(match.wind)} ${Math.abs(match.wind) > 15 ? "STRONG" : Math.abs(match.wind) > 7 ? "STEADY" : "LIGHT"}`;
    this.byId<HTMLInputElement>("angle").value = String(tank.angle);
    this.byId<HTMLInputElement>("power").value = String(tank.power);
    this.byId("angle-output").innerHTML =
      `${Math.round(tank.angle)}<span>°</span>`;
    this.byId("power-output").innerHTML =
      `${Math.round(tank.power)}<span>%</span>`;
    this.byId("ammo-label").textContent = Number.isFinite(
      tank.ammo[tank.weapon],
    )
      ? `${tank.ammo[tank.weapon]} SHOTS LEFT`
      : "UNLIMITED AMMO";
    for (const input of ["angle", "power"]) {
      const el = this.byId<HTMLInputElement>(input);
      el.disabled = !scene.canAim;
      el.style.setProperty("--value", `${(+el.value / +el.max) * 100}%`);
    }
    document
      .querySelectorAll<HTMLButtonElement>("[data-adjust]")
      .forEach((button) => (button.disabled = !scene.canAim));
    document
      .querySelectorAll<HTMLButtonElement>("[data-weapon]")
      .forEach((button) => {
        const id = button.dataset.weapon as WeaponId,
          selected = tank.weapon === id;
        button.classList.toggle("selected", selected);
        button.setAttribute("aria-pressed", String(selected));
        button.disabled = !scene.canAim || tank.ammo[id] <= 0;
        button.querySelector(".weapon-ammo")!.textContent = Number.isFinite(
          tank.ammo[id],
        )
          ? String(tank.ammo[id])
          : "∞";
      });
    this.byId<HTMLButtonElement>("fire").disabled = !scene.canAim;
    this.byId("fire").querySelector("small")!.textContent = tank.ai
      ? "CPU IS AIMING"
      : match.phase === "flight"
        ? "SHOT IN FLIGHT"
        : "SPACE TO SEND IT";
    const status = !inGame
      ? "Six weapons. Destructible terrain. Zero hard feelings."
      : match.phase === "over"
        ? "Good game. Same time, same hill?"
        : scene.paused
          ? "Match paused."
          : match.phase === "flight"
            ? "Incoming. Let gravity do its thing."
            : tank.ai
              ? `${tank.name} is lining up a shot…`
              : `You’re up, ${tank.name}. ${weaponByName(tank.weapon)} loaded.`;
    this.byId("status").innerHTML = `<span class="live-dot"></span>${status}`;
    this.byId("sound").innerHTML = icon(
      scene.soundFX.enabled ? "sound" : "mute",
    );
    this.byId("sound").setAttribute(
      "aria-label",
      scene.soundFX.enabled ? "Mute sound" : "Enable sound",
    );
    if (inGame && match.phase === "over" && !this.dialog.open) this.gameOver();
  }
}
function weaponByName(id: WeaponId): string {
  return WEAPONS.find((w) => w.id === id)!.name;
}
