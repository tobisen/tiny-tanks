import Phaser from "phaser";
import { registerSW } from "virtual:pwa-register";
import { BattleScene } from "./game/scene";
import { WORLD } from "./game/config";
import { AppUI } from "./ui/app";
import "./styles/main.css";

const ui = new AppUI();
const scene = new BattleScene();
ui.attach(scene);
new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game",
  width: WORLD.width,
  height: WORLD.height,
  backgroundColor: "#7aa9ab",
  pixelArt: true,
  antialias: false,
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [scene],
  audio: { noAudio: true },
  render: { roundPixels: false },
});
// Activate new offline assets even when older tabs stay open. The UI controls
// page reloads so an update never interrupts a match in this client.
registerSW({
  immediate: true,
  onNeedReload: () => ui.offerUpdate(),
  onRegisteredSW: (_url, registration) => {
    const checkForUpdate = () => { void registration?.update().catch(() => {}); };
    window.addEventListener("online", checkForUpdate);
    window.addEventListener("focus", checkForUpdate);
  },
});

if (import.meta.env.DEV && import.meta.env.VITE_E2E_HARNESS === "1") {
  void import("./testing").then(({ installTestHarness }) =>
    installTestHarness(ui, scene),
  );
}
