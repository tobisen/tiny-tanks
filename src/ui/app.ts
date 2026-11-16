import {
  DEFAULT_SETTINGS,
  BATTLEFIELDS,
  PROFILE_IDS,
  INPUT_SPEED,
  quickPlaySettings,
  THEMES,
  WORLD,
  type Settings,
} from "../game/config";
import type { BattleScene } from "../game/scene";
import {
  ACHIEVEMENTS,
  accuracy,
  emptyRecord,
  formatDuration,
  readRecord,
  RECORD_KEY,
  resultFor,
  updateRecord,
  type AchievementId,
} from "../game/records";
import type { Match } from "../game/match";
import { AI_SKILLS } from "../game/ai-config";
import {
  SurvivalRun,
  SURVIVAL_KEY,
  readSurvivalRecord, SHOP, shopPrice, RUN_KEY, serializeRun, restoreRun, type ShopItem,
} from "../game/survival";
import { availableSupply, SUPPLY_NAMES } from "../game/supplies";
import { CHALLENGES, CHALLENGE_KEY, ChallengeSession, readChallengeBests, type ChallengeId } from "../game/challenges";
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
    napalm: '<path d="M12 2c3 7 7 8 7 13a7 7 0 0 1-14 0c0-3 2-6 4-8v6c4-2 4-6 3-11Z"/>',
    betty: '<path d="M2 17c4-15 7-15 10 0 3-9 6-9 10 0M2 21h20"/><circle cx="12" cy="17" r="2"/>',
    airstrike: '<path d="m3 6 9 3 9-3-9 7-9-7Zm3 10v5m6-7v7m6-5v5"/>',
    seismic: '<path d="m2 13 5-2 3 8 4-15 3 9 5-2M2 22h20"/>',
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
  private updateReady = false;
  private settingsReturn: "menu" | "pause" = "menu";
  private beforeHelpPaused = false;
  private record = emptyRecord();
  private challenge?: ChallengeSession;
  private challengeBests = readChallengeBests(null);
  private survival?: SurvivalRun;
  private survivalRecord = readSurvivalRecord(null);
  private survivalCounted = false;
  private recordedMatch?: Match;
  private pendingStart?: { mode: Settings["mode"]; seed?: number; supplied?: Match };
  private playerSignature = "";
  private achievementTimer?: ReturnType<typeof setTimeout>;
  constructor() {
    this.settings.reducedMotion = matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    try {
      this.survivalRecord = readSurvivalRecord(
        localStorage.getItem(SURVIVAL_KEY),
      );
      this.record = readRecord(localStorage.getItem(RECORD_KEY));
      const saved = JSON.parse(
        localStorage.getItem("tiny-tanks-settings") ?? "null",
      ) as Partial<Settings> | null;
      if (saved) {
        this.settings = {
          ...this.settings,
          crates: saved.crates !== false,
          supplies: saved.supplies !== false,
          environmentalEvents: saved.environmentalEvents === true,
          profile: PROFILE_IDS.includes(saved.profile!)
            ? saved.profile!
            : "rolling",
          preview: saved.preview !== false,
          reducedMotion:
            typeof saved.reducedMotion === "boolean"
              ? saved.reducedMotion
              : this.settings.reducedMotion,
          inputSpeed:
            saved.inputSpeed && Object.hasOwn(INPUT_SPEED, saved.inputSpeed)
              ? saved.inputSpeed
              : "normal",
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
          movement: typeof saved.movement === "boolean" ? saved.movement : true,
        };
      }
    } catch {
      /* Storage is optional. */
    }
    document.querySelector<HTMLDivElement>("#app")!.innerHTML = `
      <div class="shell">
        <header class="topbar"><a class="brand" href="#" aria-label="Tiny Tanks home">${tankLogo}<span>TINY TANKS</span></a><div class="topbar-center"><span class="live-dot"></span> ARSENAL & CHAOS</div><nav aria-label="Game actions"><button class="icon-button" id="sound" aria-label="Mute sound">${icon("sound")}</button><button class="icon-button" id="records" aria-label="Arcade record">${icon("flag")}</button><button class="icon-button" id="help" aria-label="How to play">${icon("help")}</button><button class="icon-button" id="pause" aria-label="Pause game" disabled>${icon("pause")}</button></nav></header>
        <div id="update-notice" class="guidance update-notice" role="status" hidden><span id="update-message"></span><button id="apply-update">Load update</button></div>
        <main>
          <div class="match-heading"><div><span class="eyebrow" id="match-mode">THE PROVING GROUNDS</span><h1 id="match-title">A good day to make a crater.</h1></div><div class="match-meta"><span class="theme-dot"></span><span id="theme-label">GREEN HILLS</span><span class="meta-divider">/</span><span id="turn-label">READY WHEN YOU ARE</span></div></div>
          <section class="battlefield" aria-label="Artillery battlefield">
            <div class="battle-top"><div id="players" class="players" aria-label="Tank health"></div><div class="wind-card">${icon("wind")}<div><span class="micro-label">WIND</span><strong id="wind-value">CALM</strong></div></div></div>
            <div class="stage"><div id="game" aria-label="Tiny Tanks game canvas"></div>
              <div id="menu" class="menu"><div class="menu-content"><p class="eyebrow"><span class="tiny-star">✳</span> ARSENAL & CHAOS / V.${__APP_VERSION__}</p><h2>TINY<br>TANKS<span>.</span></h2><p class="menu-description">Take your shot. Move mountains.<br>Try to keep your friends.</p><div class="menu-actions"><button class="button primary quick-play" id="quick-play"><span>Quick Play<small>YOU + 2 CPU · RANDOM MAP</small></span>${icon("arrow")}</button><button class="button secondary survival-play" id="play-survival">Survival <span>HOW LONG CAN YOU LAST?</span></button><button class="button secondary" id="play-challenges">Challenges <span>5 TACTICAL PUZZLES</span></button><button class="button secondary" id="play-ai">Custom match</button><button class="button secondary" id="play-local">Local multiplayer <span>2–4 P</span></button></div><div class="menu-links"><button id="settings">${icon("settings")} Match settings</button><span>·</span><button id="menu-stats">Statistics</button><span>·</span><button id="menu-help">How to play ${icon("arrow")}</button></div></div><div class="field-note"><span>EST. 2026</span><strong>MAKE A LITTLE<br>BIG TROUBLE.</strong><span>MOVE FOR SUPPLIES. STAY FOR THE MAYHEM.</span></div></div>
              <div class="field-coordinates" aria-hidden="true"><span>TT / FIELD OPERATIONS</span><span>01 — NO SMALL EXPLOSIONS</span></div>
            </div>
            <div id="controls" class="controls"><div class="weapon-section"><div class="control-heading"><span class="micro-label">01 / LOADOUT</span><span id="ammo-label">UNLIMITED AMMO</span></div><div class="weapons" role="group" aria-label="Weapon selection">${WEAPONS.map((w, i) => `<button class="weapon${i === 0 ? " selected" : ""}" data-weapon="${w.id}" style="--weapon-color:#${w.color.toString(16).padStart(6, "0")}" title="${w.name} — ${w.description}" aria-label="${w.name}" aria-pressed="${i === 0}"><span class="weapon-key">${(i + 1) % 10}</span>${icon(w.id === "standard" ? "shell" : w.id)}<span class="weapon-name">${w.short}</span><span class="weapon-ammo">${Number.isFinite(w.ammo) ? w.ammo : "∞"}</span></button>`).join("")}</div><p id="weapon-info" class="weapon-info"></p>
              <div id="air-controls" hidden><label for="air-target">AIR STRIKE TARGET · <output id="air-target-output">SELECT POSITION</output></label><input id="air-target" aria-label="Air Strike target position" type="range" min="48" max="1232" value="640"><p>Tap the battlefield or move the target slider. FIRE confirms.</p></div>
              <div class="equipment"><button id="shield" class="equipment-button" aria-label="Activate Energy Shield">Shield</button><button id="refill" class="equipment-button" hidden>Refill fuel</button><button id="challenge-restart" class="equipment-button" hidden>Restart challenge</button></div></div>
            <div class="aim-control"><div class="control-heading"><label class="micro-label" for="angle">02 / ANGLE</label><output id="angle-output" for="angle">55<span>°</span></output></div><div class="range-line"><button class="adjust" data-adjust="angle:-1" aria-label="Decrease angle">−</button><input id="angle" type="range" min="0" max="180" step="0.1" value="55" aria-label="Firing angle"><button class="adjust" data-adjust="angle:1" aria-label="Increase angle">+</button></div><div class="range-labels"><span>RIGHT 0°</span><span>LEFT 180°</span></div></div>
            <div class="aim-control"><div class="control-heading"><label class="micro-label" for="power">03 / POWER</label><output id="power-output" for="power">64<span>%</span></output></div><div class="range-line"><button class="adjust" data-adjust="power:-1" aria-label="Decrease power">−</button><input id="power" type="range" min="0" max="100" step="0.1" value="64" aria-label="Firing power"><button class="adjust" data-adjust="power:1" aria-label="Increase power">+</button></div><div class="range-labels"><span>A LITTLE</span><span>A LOT</span></div></div>
            <div class="move-controls" aria-label="Movement controls">
              <div class="control-heading"><span class="micro-label">04 / MOVE</span><span id="fuel-label">FUEL 100%</span></div>
              <div class="move-buttons">
                <button class="move-button" data-move="-1" aria-label="Move left">◀ MOVE LEFT</button>
                <button class="move-button" data-move="1" aria-label="Move right">MOVE RIGHT ▶</button>
              </div>
            </div>
            <button class="fire-button" id="fire" disabled>${icon("target")}<span>FIRE<small>SPACE TO SEND IT</small></span>${icon("arrow")}</button></div>
          </section>
          <div id="challenge-objective" class="challenge-objective" hidden></div><div id="guidance" class="guidance" hidden><span></span><button id="guidance-dismiss" aria-label="Dismiss tip">Got it</button></div><div class="battle-brief"><span id="profile-label"></span><span id="supply-status"></span><span id="survival-hud" hidden></span><span id="battle-notice" role="status" aria-live="polite"></span></div><div class="under-field"><span id="status" role="status" aria-live="polite"><span class="live-dot"></span> Ten weapons. Destructible terrain. Zero hard feelings.</span><span class="keyboard-hints"><kbd>←</kbd><kbd>→</kbd> angle <kbd>↑</kbd><kbd>↓</kbd> power <kbd>A</kbd><kbd>D</kbd> move <kbd>1–0</kbd> weapons</span></div>
        </main>
        <footer><span>BUILT FOR GOOD OLD-FASHIONED RIVALRY.</span><div><button id="install" hidden>INSTALL GAME ↗</button><span>NO ACCOUNTS. NO ADS. JUST ARTILLERY.</span><span class="version">V.${__APP_VERSION__}</span></div></footer>
      </div><div id="achievement-toast" class="achievement-toast" role="status" aria-live="polite" hidden></div>`;
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
      if (this.pendingStart) {
        const pending = this.pendingStart;
        this.pendingStart = undefined;
        this.start(pending.mode, pending.seed, pending.supplied);
      }
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
    this.click("apply-update", () => {
      if (this.updateReady && (this.screen === "menu" || this.scene?.match.phase === "over")) window.location.reload();
    });
    this.click("quick-play", () => {
      this.settings = quickPlaySettings(Math.random, this.settings);
      this.start("ai");
    });
    this.click("play-survival", () => {
      let saved: SurvivalRun | undefined;
      try { saved = restoreRun(localStorage.getItem(RUN_KEY)); } catch { /* Optional storage. */ }
      if (saved) { this.survival = saved; this.survivalCounted = false; this.survivalResults(); }
      else this.startSurvival();
    });
    this.click("play-challenges", () => this.showChallenges());
    this.click("challenge-restart", () => this.startChallenge(this.challenge!.id));
    this.click("guidance-dismiss", () => this.byId("guidance").hidden = true);
    this.click("shield", () => {
      if (!this.scene?.canAim) return;
      if (this.scene.match.activateShield()) {
        this.tip("shield", "Shield uses this turn. It absorbs weapon and fire damage, expires after your next action, and does not stop falls.");
        this.scene.clearInput(); this.sync();
      }
    });
    this.click("refill", () => { if (this.scene?.canAim) this.scene.match.refillFuel(); this.sync(); });
    this.byId<HTMLInputElement>("air-target").addEventListener("input", () => {
      if (this.scene?.canAim) this.scene.match.selectAirTarget(+this.byId<HTMLInputElement>("air-target").value);
      this.sync();
    });
    this.click("menu-stats", () => this.showRecord());
    this.click("records", () => this.showRecord());
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
        button.addEventListener("pointerdown", (e) => {
          e.preventDefault();
          button.setPointerCapture(e.pointerId);
          const [axis, direction] = button.dataset.adjust!.split(":");
          this.scene?.holdAim(
            e.pointerId,
            axis as "angle" | "power",
            +direction,
          );
        });
        const stop = (e: PointerEvent) => this.scene?.releaseAim(e.pointerId);
        button.addEventListener("pointerup", stop);
        button.addEventListener("pointercancel", stop);
        button.addEventListener("lostpointercapture", stop);
        button.addEventListener("click", (e) => {
          if (e.detail !== 0 || !this.scene?.canAim) return;
          const [axis, direction] = button.dataset.adjust!.split(":");
          const tank = this.scene.match.current;
          this.scene.setAim(
            tank.angle + (axis === "angle" ? +direction : 0),
            tank.power + (axis === "power" ? +direction : 0),
          );
        });
      });
    document
      .querySelectorAll<HTMLButtonElement>("[data-move]")
      .forEach((button) => {
        const direction = Number(button.dataset.move!) as -1 | 1;
        const activate = (event: PointerEvent) => {
          event.preventDefault();
          button.setPointerCapture(event.pointerId);
          this.scene?.move(direction);
          this.scene?.holdMove(event.pointerId, direction);
          this.scene?.soundFX.unlock();
        };
        const stop = (event: PointerEvent) => {
          this.scene?.releaseMove(event.pointerId);
          if (button.hasPointerCapture(event.pointerId))
            button.releasePointerCapture(event.pointerId);
        };
        button.addEventListener("pointerdown", activate);
        button.addEventListener("pointerup", stop);
        button.addEventListener("pointercancel", stop);
        button.addEventListener("lostpointercapture", stop);
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
      if (event.code === "KeyS") this.byId<HTMLButtonElement>("shield").click();
      if (/^Digit[0-9]$/.test(event.code))
        this.selectWeapon(WEAPONS[(Number(event.code.slice(-1)) + 9) % 10].id);
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
      this.scene.match.airTarget = undefined;
      if (id === "napalm") this.tip("napalm", "Orange ground burns for 3 completed turns, up to 5 damage per turn. Move out of the marked zone before firing.");
      if (id === "airstrike") this.tip("airstrike", "Choose a position on the battlefield or target slider, then press FIRE to confirm the strike.");
      this.scene.soundFX.select(WEAPONS.findIndex((w) => w.id === id));
      this.sync();
    }
  }
  private start(mode: Settings["mode"], seed?: number, supplied?: Match): void {
    if (!supplied) this.challenge = undefined;
    if (!this.ready || !this.scene) {
      this.pendingStart = { mode, seed, supplied };
      return;
    }
    if (mode !== "survival") this.survival = undefined;
    this.dialog.close();
    this.screen = "game";
    this.settings.mode = mode;
    this.save();
    this.scene.soundFX.unlock();
    this.scene.startMatch(supplied?.settings ?? this.settings, false, seed, supplied);
    if (mode === "survival") this.survival?.applyResources(this.scene.match);
    this.sync();
  }
  private startSurvival(): void {
    if (this.survival && !this.survivalCounted) {
      this.survival.finish();
      this.saveSurvival(true);
    }
    this.survival = new SurvivalRun(Date.now(), this.settings);
    this.survivalCounted = false;
    this.settings = this.survival.settings;
    this.start("survival", this.survival.battleSeed);
  }
  private saveSurvival(completed = false): void {
    if (!this.survival) return;
    this.survivalRecord = this.survival.record(
      this.survivalRecord,
      completed && !this.survivalCounted,
    );
    if (completed) this.survivalCounted = true;
    try {
      localStorage.setItem(SURVIVAL_KEY, JSON.stringify(this.survivalRecord));
      if (this.survival.awaitingContinue && !this.survival.ended) localStorage.setItem(RUN_KEY, serializeRun(this.survival));
      else localStorage.removeItem(RUN_KEY);
    } catch {
      /* Optional local record. */
    }
  }
  private survivalResults(): void {
    const run = this.survival!;
    const cleared = run.awaitingContinue && !run.ended;
    this.open(`${this.heading(
      "SURVIVAL / BATTLE " + run.battle,
      cleared ? "Hill secured. Keep going?" : "Run over. A good fight.",
    )}
      <div id="survival-results" class="record-grid">
        <div><strong>${run.survived}</strong><span>BATTLES SURVIVED</span></div>
        <div><strong>${run.kills}</strong><span>ENEMIES ELIMINATED</span></div>
        <div><strong>${number(run.damage)}</strong><span>DAMAGE DEALT</span></div>
        <div><strong>${accuracy(run)}%</strong><span>ACCURACY</span></div>
        <div><strong>${run.score}</strong><span>SURVIVAL SCORE</span></div>
        <div><strong>${this.survivalRecord.bestStreak}</strong><span>BEST STREAK</span></div>
      </div>
      ${
        cleared
          ? `<p>Carry your tank into a new battlefield. Recovery: +${run.recovery} HP · ${run.recoveryAmmo}. Mega Bombs stay scarce.</p>
        <section id="survival-shop" class="survival-shop"><h3>FIELD SHOP · <span id="shop-credits">${run.credits}</span> CREDITS <small>+${run.lastCredits} earned</small></h3><p>Optional supplies for the next battle. Purchases apply immediately.</p>
        <label for="shop-weapon">Ammunition<select id="shop-weapon">${WEAPONS.filter(w => Number.isFinite(w.ammo)).map(w => `<option value="${w.id}" ${w.id === "betty" ? "selected" : ""}>${w.name} (${run.ammo[w.id]}/${w.ammo})</option>`).join("")}</select></label>
        <div class="shop-grid">${(Object.keys(SHOP) as ShopItem[]).map(id => `<button class="equipment-button" data-buy="${id}"><strong>${SHOP[id].name} · <span data-price="${id}">${SHOP[id].price}</span> credits</strong><small>${SHOP[id].description}</small></button>`).join("")}</div><p id="shop-feedback" role="status">${Math.ceil(run.health)} HP · ${run.shieldCharges} shields · ${run.fuelReserves} fuel reserve</p></section>
        <button class="button primary" id="survival-continue">Continue to battle ${run.battle + 1} ${icon("arrow")}</button>
        <button class="button secondary" id="survival-end">End run</button>`
          : `<button class="button primary" id="survival-new">New survival run ${icon("arrow")}</button>`
      }
      <button class="text-button" id="results-home">Main menu</button>`);
    this.dialog.querySelector("[data-close]")?.remove();
    if (cleared) {
      this.tip("shop", "Credits reward victories, damage, accurate shots and chains. Supplies are optional: Continue skips the shop immediately.");
      const updateShop = () => {
        const weapon = this.byId<HTMLSelectElement>("shop-weapon").value as WeaponId;
        this.byId("shop-credits").textContent = String(run.credits);
        this.byId<HTMLSelectElement>("shop-weapon").querySelectorAll("option").forEach(option => {
          const w = WEAPONS.find(w => w.id === option.value)!;
          option.textContent = `${w.name} (${run.ammo[w.id]}/${w.ammo})`;
        });
        this.dialog.querySelector('[data-price="ammo"]')!.textContent = String(shopPrice("ammo", weapon));
        this.dialog.querySelectorAll<HTMLButtonElement>("[data-buy]").forEach(button => {
          const item = button.dataset.buy as ShopItem;
          button.disabled = run.credits < shopPrice(item, weapon) ||
            (item === "ammo" && run.ammo[weapon] >= WEAPONS.find(w => w.id === weapon)!.ammo) ||
            (item === "repair" && run.health >= 100) || (item === "fuel" && (run.fuelReserves >= 1 || !run.settings.movement)) ||
            (item === "shield" && run.shieldCharges >= 3);
        });
      };
      this.byId("shop-weapon").addEventListener("change", updateShop);
      this.dialog.querySelectorAll<HTMLButtonElement>("[data-buy]").forEach(button => button.addEventListener("click", () => {
        const weapon = this.byId<HTMLSelectElement>("shop-weapon").value as WeaponId;
        if (run.purchase(button.dataset.buy as ShopItem, weapon)) {
          this.scene?.soundFX.select(4);
          this.byId("shop-feedback").textContent = `Supplies secured · ${Math.ceil(run.health)} HP · ${run.shieldCharges} shields · ${run.fuelReserves} fuel reserve · ${run.ammo[weapon]} ${weaponByName(weapon)} rounds`;
          this.saveSurvival(); updateShop();
        }
      }));
      updateShop();
      this.click("survival-continue", () => {
        run.continue();
        this.saveSurvival();
        this.settings = run.settings;
        this.start("survival", run.battleSeed);
      });
      this.click("survival-end", () => {
        run.finish();
        this.saveSurvival(true);
        this.survivalResults();
      });
    } else this.click("survival-new", () => this.startSurvival());
    this.click("results-home", () => this.home());
  }
  private home(): void {
    if (this.survival && !this.survivalCounted) {
      this.survival.finish();
      this.saveSurvival(true);
    }
    this.survival = undefined;
    this.challenge = undefined;
    if (this.settings.mode === "survival") this.settings.mode = "ai";
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
    this.dialog.classList.remove("results-modal");
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
    this.scene.clearInput();
    this.scene.paused = true;
    this.open(
      `${this.heading("TAKE A BREATHER", "Hold your fire.")}<p>The hills aren’t going anywhere. Yet.</p><div class="modal-actions"><button class="button primary" id="resume">Resume match ${icon("arrow")}</button><button class="button secondary" id="restart">${this.survival ? "Restart survival run" : "Restart match"}</button><button class="button secondary" id="pause-settings">Sound & match settings</button><button class="text-button" id="home">Back to main menu</button></div>`,
    );
    this.click("resume", () => {
      this.dialog.close();
      this.resume();
    });
    this.click("restart", () =>
      this.challenge ? this.startChallenge(this.challenge.id) : this.survival ? this.startSurvival() : this.start(this.settings.mode),
    );
    this.click("pause-settings", () => this.showSettings("pause"));
    this.click("home", () => this.home());
    this.sync();
  }
  private showSettings(from: "menu" | "pause"): void {
    this.settingsReturn = from;
    const s = this.settings;
    this
      .open(`${this.heading("YOUR BATTLE, YOUR RULES", "Set the scene.")}<p>${from === "pause" ? "Sound, aiming & motion apply now; battle rules apply on restart." : "Make yourself at home. Then blow it up."}</p><form id="settings-form" class="settings-grid">
      <label>Players / tanks<select name="players">${[2, 3, 4].map((n) => `<option value="${n}" ${s.players === n ? "selected" : ""}>${n} tanks (${n - 1} AI in solo)</option>`).join("")}</select></label>
      <label>AI difficulty<select name="difficulty">${["easy", "normal", "hard"].map((d) => `<option value="${d}" ${s.difficulty === d ? "selected" : ""}>${d[0].toUpperCase() + d.slice(1)}</option>`).join("")}</select><small id="ai-description">${AI_SKILLS[s.difficulty].description}</small></label>
      <label>Landscape<select name="theme">${Object.entries(THEMES)
        .map(
          ([id, t]) =>
            `<option value="${id}" ${s.theme === id ? "selected" : ""}>${t.name}</option>`,
        )
        .join("")}</select></label>
      <label>Battlefield<select name="profile">${Object.entries(BATTLEFIELDS)
        .map(
          ([id, profile]) =>
            `<option value="${id}" ${s.profile === id ? "selected" : ""}>${profile.name}</option>`,
        )
        .join(
          "",
        )}</select><small id="profile-description">${BATTLEFIELDS[s.profile].description}</small></label>
      <label>Starting health<select name="health">${[75, 100, 150].map((n) => `<option value="${n}" ${s.health === n ? "selected" : ""}>${n} HP</option>`).join("")}</select></label>
      <label class="toggle-label">Wind<input name="wind" type="checkbox" ${s.wind ? "checked" : ""}></label>
      <label class="toggle-label">Explosive crates<input name="crates" type="checkbox" ${s.crates ? "checked" : ""}></label>
      <label class="toggle-label">Supply Drops<input name="supplies" type="checkbox" ${s.supplies ? "checked" : ""}></label>
      <label class="toggle-label">Environmental Events<input name="environmentalEvents" type="checkbox" ${s.environmentalEvents ? "checked" : ""}></label>
      <label class="toggle-label">Aim preview<input name="preview" type="checkbox" ${s.preview ? "checked" : ""}></label>
      <label class="toggle-label">Reduced motion<input name="reducedMotion" type="checkbox" ${s.reducedMotion ? "checked" : ""}></label>
      <label class="toggle-label">Tank movement<input name="movement" type="checkbox" ${s.movement ? "checked" : ""}></label>
      <label>Aiming speed<select name="inputSpeed">${Object.keys(INPUT_SPEED)
        .map(
          (id) =>
            `<option value="${id}" ${s.inputSpeed === id ? "selected" : ""}>${id[0].toUpperCase() + id.slice(1)}</option>`,
        )
        .join("")}</select></label>
      <label class="toggle-label">Sound effects<input name="sound" type="checkbox" ${this.scene?.soundFX.enabled ? "checked" : ""}></label>
      <label class="volume-label">Volume<input name="volume" type="range" min="0" max="100" value="${Math.round((this.scene?.soundFX.volume ?? 0.65) * 100)}"></label>
      <button class="button primary full-width" type="submit">Save settings ${icon("arrow")}</button></form>`);
    const form = this.byId<HTMLFormElement>("settings-form");
    form.addEventListener("input", () => {
      const profileDescription = this.byId("profile-description");
      if (profileDescription)
        profileDescription.textContent =
          BATTLEFIELDS[
            (form.elements.namedItem("profile") as HTMLSelectElement)
              .value as Settings["profile"]
          ].description;
      this.byId("ai-description").textContent =
        AI_SKILLS[
          (form.elements.namedItem("difficulty") as HTMLSelectElement)
            .value as Settings["difficulty"]
        ].description;
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
        profile: data.get("profile") as Settings["profile"],
        supplies: data.has("supplies"),
        environmentalEvents: data.has("environmentalEvents"),
        health: +data.get("health")!,
        wind: data.has("wind"),
        crates: data.has("crates"),
        preview: data.has("preview"),
        reducedMotion: data.has("reducedMotion"),
        movement: data.has("movement"),
        inputSpeed: data.get("inputSpeed") as Settings["inputSpeed"],
      };
      this.save();
      if (this.survival)
        Object.assign(this.survival.preferences, {
          preview: this.settings.preview,
          reducedMotion: this.settings.reducedMotion,
          inputSpeed: this.settings.inputSpeed,
          movement: this.settings.movement,
          supplies: this.settings.supplies,
          environmentalEvents: this.settings.environmentalEvents,
        });
      if (this.settingsReturn === "pause") {
        if (this.scene)
          Object.assign(this.scene.match.settings, {
            preview: this.settings.preview,
            reducedMotion: this.settings.reducedMotion,
            movement: this.settings.movement,
            inputSpeed: this.settings.inputSpeed,
          });
        this.pause();
      } else {
        this.dialog.close();
        this.scene?.startMatch(this.settings, true, 2026);
      }
      this.sync();
    });
  }
  private tip(id: string, message: string): void {
    try {
      const key = `tiny-tanks-tip-${id}-v1`;
      if (localStorage.getItem(key)) return;
      localStorage.setItem(key, "seen");
    } catch { /* Tips still work without storage. */ }
    this.byId("guidance").querySelector("span")!.textContent = message;
    this.byId("guidance").hidden = false;
  }
  private showChallenges(): void {
    if (this.scene) { this.scene.paused = true; this.scene.clearInput(); }
    try { this.challengeBests = readChallengeBests(localStorage.getItem(CHALLENGE_KEY)); } catch { /* Optional bests. */ }
    this.open(`${this.heading("FIVE SMALL BATTLES", "The proving grounds.")}<p>Fixed terrain. Limited supplies. Every puzzle is open from the start.</p><div class="challenge-grid">${CHALLENGES.map((c, i) => `<button class="equipment-button" data-challenge="${c.id}"><strong>${i + 1}. ${c.name} ${this.challengeBests[c.id] ? "★" : ""}</strong><span>${c.objective}</span><small>${this.challengeBests[c.id] ? `Best: ${this.challengeBests[c.id]} shots` : c.hint}</small></button>`).join("")}</div>`);
    this.dialog.querySelectorAll<HTMLButtonElement>("[data-challenge]").forEach(button => button.addEventListener("click", () => this.startChallenge(button.dataset.challenge as ChallengeId)));
  }
  private startChallenge(id: ChallengeId): void {
    this.challenge = new ChallengeSession(id, this.settings);
    this.start("ai", this.challenge.match.seed, this.challenge.match);
  }
  private showHelp(): void {
    this.beforeHelpPaused = this.scene?.paused ?? false;
    if (this.scene && this.screen === "game") this.scene.paused = true;
    this.open(
      `${this.heading("FIELD MANUAL / 001", "Aim high. Hit hard.")}<p>Last tank standing wins. Each turn, pick a weapon, set your angle and power, and send it.</p><div class="help-steps"><div><b>01</b><p><strong>Find your angle.</strong><br>0° fires right. 90° fires up. 180° fires left. Use ← / → or the angle slider.</p></div><div><b>02</b><p><strong>Give it some power.</strong><br>More power sends your shell further. Adjust with ↑ / ↓. Watch the wind before firing.</p></div><div><b>03</b><p><strong>Make a crater.</strong><br>Press Space or FIRE. Direct hits hurt most. Craters drop tanks and cause fall damage. Number keys 1–0 switch weapons. Orange crates explode and can trigger their neighbors. Use them to your advantage.</p></div></div><p class="help-note">Move with A/D or hold the move buttons. Parachutes bring repair, fuel and limited ammo; move into a landed supply to collect it. Gusts are announced before firing, and marked tremors briefly lock controls while shallow ground settles. S activates a 30 HP Energy Shield instead of firing; falls bypass it. Air Strike: select a battlefield position or use the target slider, then confirm FIRE. Napalm burns for three completed turns, so move away. Betty bounces; Seismic reshapes the ground. Survival carries health and ammunition between battles and offers an optional four-category credit shop. Five deterministic challenges teach precision and combinations. Local multiplayer: pass the device when the next tank’s name appears. Escape pauses. On mobile, use the sliders or hold the + / − buttons. Aim preview, input speed, and reduced motion are in Match settings.</p><button class="button primary" id="got-it">Got it. Let’s play. ${icon("arrow")}</button>`,
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
    if (this.challenge) {
      const c = this.challenge;
      const success = c.result === "success";
      if (success) {
        const shots = c.match.tanks[0].shots;
        this.challengeBests[c.id] = Math.min(this.challengeBests[c.id] ?? Infinity, shots);
        try { localStorage.setItem(CHALLENGE_KEY, JSON.stringify(this.challengeBests)); } catch { /* Optional bests. */ }
      }
      this.open(`${this.heading(success ? "CHALLENGE COMPLETE ★" : "TRY AGAIN", success ? `${c.definition.name} mastered.` : "One more try.")}<p id="challenge-result">${success ? "Success" : "Challenge failed"} · ${c.definition.objective}</p><p>${c.match.tanks[0].shots} shots · ${c.progress}</p><button class="button primary" id="challenge-retry">Restart challenge</button><button class="button secondary" id="challenge-list">All challenges</button><button class="text-button" id="results-home">Main menu</button>`);
      this.dialog.querySelector("[data-close]")?.remove();
      this.click("challenge-retry", () => this.startChallenge(c.id));
      this.click("challenge-list", () => this.showChallenges());
      this.click("results-home", () => this.home());
      return;
    }
    if (this.survival) {
      this.survivalResults();
      return;
    }
    const match = this.scene!.match,
      winner = match.tanks.find((t) => t.id === match.winnerId);
    this.open(
      `${this.heading("THE DUST HAS SETTLED", winner ? `${winner.name} takes the hill.` : "Mutual destruction.")}<p>${winner ? "One tiny tank. One very big victory." : "Nobody survived that one. Call it a draw."} ${match.turn} turns · <strong>${formatDuration(match.elapsed)}</strong> active play · best chain ${match.longestChain}×</p><div class="results"><div class="result-row result-heading"><span>TANK</span><span>KILLS</span><span>DAMAGE</span><span>SHOTS</span><span>HIT %</span></div>${[
        ...match.tanks,
      ]
        .sort((a, b) => b.health - a.health || b.damage - a.damage)
        .map(
          (t) =>
            `<div class="result-row"><strong style="color:${t.color}">${t.id === winner?.id ? "★ " : ""}${t.name}</strong><span>${t.kills}</span><span>${number(t.damage)}</span><span>${t.shots}</span><span>${accuracy(t)}%</span></div>`,
        )
        .join(
          "",
        )}</div><p class="result-note">Accuracy = shots that damaged an opponent. Kills = tanks destroyed.</p><div class="modal-actions"><button class="button primary" id="rematch">One more round ${icon("arrow")}</button><div class="result-options"><button class="button secondary" id="same-map">Replay this map</button><button class="button secondary" id="results-home">Main menu</button></div></div>`,
    );
    this.dialog.classList.add("results-modal");
    this.dialog.querySelector("[data-close]")?.remove();
    const rematch = (same: boolean) => {
      this.settings = { ...match.settings };
      this.start(match.settings.mode, same ? match.seed : undefined);
    };
    this.click("rematch", () => rematch(false));
    this.click("same-map", () => rematch(true));
    this.click("results-home", () => this.home());
  }
  private saveRecord(): void {
    try {
      localStorage.setItem(RECORD_KEY, JSON.stringify(this.record));
    } catch {
      /* Records remain available for this session. */
    }
  }
  private notifyAchievements(ids: AchievementId[]): void {
    if (!ids.length) return;
    const toast = this.byId("achievement-toast");
    toast.innerHTML = `<span>★ ACHIEVEMENT UNLOCKED</span><strong>${ids.map((id) => ACHIEVEMENTS.find((a) => a.id === id)!.name).join(" · ")}</strong>`;
    toast.hidden = false;
    clearTimeout(this.achievementTimer);
    this.achievementTimer = setTimeout(() => {
      toast.hidden = true;
    }, 4500);
  }
  private captureRecord(match: Match): void {
    if (
      match.tanks[0].longestChain >= 2 &&
      !this.record.achievements.includes("chain-reaction")
    ) {
      this.record.achievements.push("chain-reaction");
      this.saveRecord();
      this.notifyAchievements(["chain-reaction"]);
    }
    if (match.phase !== "over" || this.recordedMatch === match) return;
    this.recordedMatch = match;
    if (this.survival) {
      this.survival.recordBattle(match);
      this.saveSurvival(this.survival.ended);
    }
    if (this.challenge) return;
    const updated = updateRecord(this.record, resultFor(match));
    this.record = updated.record;
    this.saveRecord();
    this.notifyAchievements(updated.unlocked);
  }
  private showRecord(): void {
    if (this.scene && this.screen === "game") {
      this.scene.paused = true;
      this.scene.clearInput();
    }
    const r = this.record;
    this.open(
      `${this.heading("LOCAL ARCADE RECORD", "A little bragging rights.")}<p>Your record as Clover (Player 1), across completed solo and local matches. Saved on this device.</p><div class="record-grid">${[
        [r.wins, "WINS"],
        [r.losses, "LOSSES"],
        [r.matches, "MATCHES"],
        [r.damage, "DAMAGE DEALT"],
        [r.bestAccuracy + "%", "BEST ACCURACY"],
        [r.biggestHit, "LARGEST HIT"],
        [r.longestChain + "×", "LONGEST CHAIN"],
      ]
        .map(
          ([value, label]) =>
            `<div><strong>${value}</strong><span>${label}</span></div>`,
        )
        .join(
          "",
        )}</div><p class="survival-record">SURVIVAL · Best streak <strong>${this.survivalRecord.bestStreak}</strong> · Best score <strong>${this.survivalRecord.bestScore}</strong> · Runs ${this.survivalRecord.runs}</p><div class="achievement-list">${ACHIEVEMENTS.map((a) => `<div class="achievement ${r.achievements.includes(a.id) ? "earned" : ""}"><span>${r.achievements.includes(a.id) ? "★" : "◇"}</span><div><strong>${a.name}</strong><p>${a.description}</p></div></div>`).join("")}</div>`,
    );
  }
  offerUpdate(): void {
    this.updateReady = true;
    this.sync();
  }
  sync(): void {
    const scene = this.scene;
    if (!scene?.match) return;
    const match = scene.match,
      tank = match.current,
      inGame = this.screen === "game";
    if (inGame) this.captureRecord(match);
    const canUpdate = !inGame || match.phase === "over";
    this.byId("update-notice").hidden = !this.updateReady;
    this.byId<HTMLButtonElement>("apply-update").disabled = !canUpdate;
    this.byId("update-message").textContent = canUpdate
      ? "A new version is ready. Your saved records and settings will be kept."
      : "A new version is ready. Finish your match or return to the menu to update.";
    this.byId("menu").hidden = inGame;
    if (!inGame) {
      let checkpoint = false;
      try { checkpoint = !!restoreRun(localStorage.getItem(RUN_KEY)); } catch { /* Optional checkpoint. */ }
      this.byId("play-survival").innerHTML = checkpoint ? 'Resume Survival <span>RETURN TO FIELD SHOP</span>' : 'Survival <span>HOW LONG CAN YOU LAST?</span>';
    }
    document.querySelector(".battlefield")!.classList.toggle("home", !inGame);
    this.byId("controls").classList.toggle("inactive", !inGame);
    this.byId<HTMLButtonElement>("pause").disabled =
      !inGame || match.phase === "over";
    this.byId("match-mode").textContent = inGame
      ? this.challenge ? `CHALLENGE · ${this.challenge.definition.name.toUpperCase()}` : match.settings.mode === "survival"
        ? "SURVIVAL · BATTLE " + this.survival?.battle
        : match.settings.mode === "ai"
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
    const playersHTML = match.tanks
      .map(
        (t) =>
          `<div class="player-card ${inGame && t.id === tank.id ? "active" : ""} ${t.health <= 0 ? "eliminated" : ""}" style="--tank-color:${t.color}"><span class="player-avatar">${tankLogo}</span><div class="player-details"><div><strong>${t.name}</strong><span>${t.ai ? "CPU" : match.settings.mode !== "local" ? "YOU" : `P${t.id + 1}`}</span></div><div class="health-track"><i style="width:${(t.health / match.settings.health) * 100}%"></i></div></div><span class="health-number">${number(t.health)}<small>HP</small></span></div>`,
      )
      .join("");
    if (playersHTML !== this.playerSignature) {
      this.byId("players").innerHTML = playersHTML;
      this.playerSignature = playersHTML;
    }
    this.byId("profile-label").textContent =
      BATTLEFIELDS[match.settings.profile].name;
    const drops = match.supplies.filter(availableSupply);
    this.byId("supply-status").textContent =
      inGame && match.settings.supplies
        ? drops.length
          ? drops.map((s) => `${SUPPLY_NAMES[s.kind]} · ${s.state}`).join(" / ")
          : "SUPPLY DROPS ON"
        : "";
    this.byId("battle-notice").textContent = inGame
      ? match.notice
      : "Four battlefields. Three supplies. One more round.";
    this.byId("survival-hud").hidden = !this.survival;
    this.byId("survival-hud").textContent = this.survival
      ? `STREAK ${this.survival.survived} · SCORE ${this.survival.score}`
      : "";
    const weapon = WEAPONS.find((w) => w.id === tank.weapon)!;
    this.byId("weapon-info").innerHTML =
      `<strong>${weapon.name}</strong> ${weapon.description}`;
    document.body.classList.toggle(
      "reduced-motion",
      match.settings.reducedMotion,
    );
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
    this.byId("air-controls").hidden = !inGame || tank.weapon !== "airstrike";
    this.byId<HTMLInputElement>("air-target").disabled = !scene.canAim;
    if (match.airTarget !== undefined) this.byId<HTMLInputElement>("air-target").value = String(match.airTarget);
    this.byId("air-target-output").textContent = match.airTarget === undefined ? "SELECT POSITION" : `x=${Math.round(match.airTarget)} · FIRE TO CONFIRM`;
    this.byId<HTMLButtonElement>("shield").disabled = !scene.canAim || tank.shieldCharges <= 0 || tank.shield > 0;
    this.byId("shield").textContent = `S · SHIELD ${tank.shield > 0 ? Math.ceil(tank.shield) + " ACTIVE" : "×" + tank.shieldCharges}`;
    this.byId("refill").hidden = !inGame || tank.fuelReserves <= 0;
    this.byId<HTMLButtonElement>("refill").disabled = !scene.canAim || tank.fuel >= WORLD.moveFuel;
    this.byId("challenge-restart").hidden = !this.challenge || !inGame;
    this.byId("challenge-objective").hidden = !this.challenge || !inGame;
    this.byId("challenge-objective").textContent = this.challenge ? `${this.challenge.definition.objective} · ${this.challenge.progress} · ${this.challenge.definition.hint}` : "";
    this.byId<HTMLButtonElement>("fire").disabled = !scene.canAim || tank.ammo[tank.weapon] <= 0 || (tank.weapon === "airstrike" && match.airTarget === undefined);
    this.byId("fire").querySelector("small")!.textContent =
      match.phase === "warning"
        ? "GROUND WARNING"
        : match.phase === "flight"
          ? "SHOT IN FLIGHT"
          : match.phase === "settle"
            ? "RESOLVING IMPACT"
            : tank.ai
              ? "CPU IS AIMING"
              : tank.weapon === "airstrike" ? match.airTarget === undefined ? "SELECT TARGET FIRST" : "CONFIRM AIR STRIKE" : "SPACE TO SEND IT";
    const status = !inGame
      ? "Ten weapons. Destructible terrain. Zero hard feelings."
      : match.phase === "over"
        ? "Good game. Same time, same hill?"
        : scene.paused
          ? "Match paused."
          : match.phase === "warning"
            ? "Ground tremor incoming. Hold your fire."
            : match.phase === "flight"
              ? "Incoming. Let gravity do its thing."
              : match.phase === "settle"
                ? "Let the dust settle…"
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
    const fuel = tank.fuel / WORLD.moveFuel;
    this.byId("fuel-label").textContent = `FUEL ${Math.round(fuel * 100)}%`;
    const moveButtons =
      document.querySelectorAll<HTMLButtonElement>(".move-button");
    moveButtons.forEach((button) => {
      const enabled =
        inGame && match.phase === "aim" && !tank.ai && match.settings.movement;
      button.disabled = !enabled || tank.fuel <= 0;
      button.classList.toggle("disabled", !enabled || tank.fuel <= 0);
    });
    document
      .querySelector(".move-controls")
      ?.classList.toggle(
        "inactive",
        !inGame || !match.settings.movement || tank.ai || match.phase !== "aim",
      );
    if (inGame && match.phase === "over" && !this.dialog.open) this.gameOver();
  }
}
function weaponByName(id: WeaponId): string {
  return WEAPONS.find((w) => w.id === id)!.name;
}

const number = (value: number): string => String(+value.toFixed(2));
