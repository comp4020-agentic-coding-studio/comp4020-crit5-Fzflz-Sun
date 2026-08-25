// DOM-based HUD: icons and numbers only, wired up here so renderer.ts stays
// free of anything that isn't world-space drawing.
import type { GameState } from "./types";

export interface HudRefs {
  healthValue: HTMLElement;
  ammoValue: HTMLElement;
  enemiesValue: HTMLElement;
  endOverlay: HTMLElement;
}

export function getHudRefs(root: ParentNode): HudRefs {
  const req = (id: string): HTMLElement => {
    const el = root.querySelector<HTMLElement>(`#${id}`);
    if (!el) throw new Error(`missing HUD element #${id}`);
    return el;
  };
  return {
    healthValue: req("hud-health-value"),
    ammoValue: req("hud-ammo-value"),
    enemiesValue: req("hud-enemies-value"),
    endOverlay: req("end-overlay"),
  };
}

export function updateHud(state: GameState, refs: HudRefs): void {
  refs.healthValue.textContent = String(Math.max(0, Math.ceil(state.player.health)));
  refs.ammoValue.textContent = String(state.player.ammo);
  refs.enemiesValue.textContent = String(state.enemies.filter((e) => e.alive).length);

  const ended = state.phase !== "playing";
  refs.endOverlay.hidden = !ended;
  refs.endOverlay.classList.toggle("is-win", state.phase === "won");
  refs.endOverlay.classList.toggle("is-lose", state.phase === "lost");
}
