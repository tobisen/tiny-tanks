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
// An update waits until the next page load, so an active match is never interrupted.
registerSW({
  immediate: true,
  onRegisteredSW: (_url, registration) => {
    window.addEventListener("online", () => {
      void registration?.update();
    });
  },
});
