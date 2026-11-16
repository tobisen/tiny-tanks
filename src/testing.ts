// Imported only by the explicitly enabled Vite development harness. Vite
// removes this module and its scenario API from production builds.
import type { AppUI } from "./ui/app";
import type { BattleScene } from "./game/scene";
import type { GameEvent } from "./game/match";
import { spawnSupply } from "./game/supplies";
import { chooseSupplyMove } from "./game/ai-movement";
import { scheduleEnvironment } from "./game/environment";
export function installTestHarness(_ui: AppUI, scene: BattleScene) {
  const events: GameEvent[] = [];
  const target = scene as unknown as { handleEvent(event: GameEvent): void };
  const original = target.handleEvent.bind(scene);
  target.handleEvent = (event) => {
    events.push(structuredClone(event));
    original(event);
  };
  const api = {
    prepare(
      kind:
        | "supply"
        | "ai-supply"
        | "gust"
        | "tremor"
        | "events-off"
        | "survival-win"
        | "survival-loss"
        | "arsenal",
    ) {
      const settings = {
        ...scene.match.settings,
        crates: false,
        supplies: true,
        environmentalEvents: false,
        reducedMotion: true,
      };
      scene.startMatch(settings, false, 1);
      const g = scene.match;
      g.terrain.heights.fill(450);
      g.terrain.version++;
      g.tanks.forEach((t) => {
        t.y = 450;
      });
      g.wind = 0;
      events.length = 0;
      if (kind === "supply" || kind === "ai-supply") {
        if (kind === "ai-supply") {
          g.active = 1;
          g.current.x = 400;
          g.current.ai = true;
          g.settings.difficulty = "hard";
        }
        g.current.health = kind === "supply" ? 50 : 30;
        const d = spawnSupply(g)!;
        d.kind = "repair";
        d.x = g.current.x + (kind === "supply" ? 40 : -60);
        d.y = 60;
        // Select a fixed natural awareness draw for this bounded AI scenario.
        if (kind === "ai-supply") {
          d.state = "landed";
          d.y = 450;
          for (g.seed = 1; g.seed < 30; g.seed++)
            if (chooseSupplyMove(g)) break;
        }
      } else if (
        kind === "gust" ||
        kind === "tremor" ||
        kind === "events-off"
      ) {
        g.settings.supplies = false;
        g.settings.wind = true;
        g.settings.environmentalEvents = kind !== "events-off";
        const targetTurn = kind === "tremor" ? 10 : 6;
        // Use the real scheduler to find a seeded eligible turn; launch then
        // advances into that turn through the ordinary shot/settle pipeline.
        for (g.seed = 1; g.seed < 50; g.seed++) {
          g.turn = targetTurn;
          g.phase = "aim";
          g.tremor = undefined;
          g.events.length = 0;
          g.settings.environmentalEvents = true;
          scheduleEnvironment(g);
          if (
            g.events.some(
              (e) =>
                e.type === "environment" &&
                e.action === (kind === "tremor" ? "warning" : "gust"),
            )
          )
            break;
        }
        g.settings.environmentalEvents = kind !== "events-off";
        g.turn = targetTurn - 1;
        g.phase = "aim";
        g.tremor = undefined;
        g.wind = 0;
        g.notice = "";
        g.events.length = 0;
      } else if (kind === "arsenal") {
        g.settings.supplies = false; g.settings.environmentalEvents = false;
        g.tanks[0].x = 135; g.tanks[1].x = 700;
      } else {
        g.settings.supplies = false;
        if (kind === "survival-win") {
          g.current.health = 40;
          g.current.ammo.heavy = 0;
          g.current.ammo.betty = 0;
          g.current.ammo.mega = 0;
          g.tanks[1].x = 300;
          g.tanks[1].health = 8;
        } else g.current.health = 8;
      }
      scene.onChange();
    },
    snapshot() {
      return {
        turn: scene.match.turn,
        phase: scene.match.phase,
        seed: scene.match.seed,
        tanks: structuredClone(scene.match.tanks),
        supplies: structuredClone(scene.match.supplies),
        fires: structuredClone(scene.match.fires),
        projectiles: structuredClone(scene.match.projectiles),
        terrainVersion: scene.match.terrain.version,
        terrain: [135, 640, 700].map(x => scene.match.terrain.at(x)),
        events: structuredClone(events),
      };
    },
  };
  Object.assign(window, { __TINY_TANKS_TEST__: api });
  return api;
}

export type TestAPI = ReturnType<typeof installTestHarness>;
