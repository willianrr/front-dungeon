import { mulberry32 } from './rng';
import { Terrain } from './Terrain';

// Descrição estática do mundo: terreno + onde ficam props e obstáculos.
// Tudo derivado da seed de forma determinística.

export type PropKind = 'tree' | 'rock' | 'ruin';

export interface PropInstance {
  kind: PropKind;
  x: number;
  z: number;
  y: number; // altura do terreno no ponto (pré-calculada)
  rotationY: number;
  scale: number;
}

/** Obstáculo circular para colisão (consumido pela simulação). */
export interface Blocker {
  x: number;
  z: number;
  radius: number;
}

export interface WorldData {
  seed: number;
  size: number;
  waterLevel: number;
  terrain: Terrain;
  props: PropInstance[];
  blockers: Blocker[];
  spawn: { x: number; z: number };
  dungeon: { x: number; z: number };
}

export function generateWorld(seed: number): WorldData {
  const size = 200;
  const waterLevel = -2.2;
  const spawn = { x: 0, z: 0 };
  const dungeon = { x: 46, z: -34 };

  const terrain = new Terrain(seed, size, [{ x: dungeon.x, z: dungeon.z, r: 9 }]);

  const rand = mulberry32(seed ^ 0x9e3779b9);
  const props: PropInstance[] = [];
  const blockers: Blocker[] = [];
  const half = size / 2;

  for (let i = 0; i < 1600 && props.length < 270; i++) {
    const x = (rand() * 2 - 1) * (half - 6);
    const z = (rand() * 2 - 1) * (half - 6);

    if (Math.hypot(x, z) < 10) continue; // área de spawn limpa
    if (Math.hypot(x - dungeon.x, z - dungeon.z) < 12) continue; // entrada limpa

    const y = terrain.heightAt(x, z);
    if (y < waterLevel + 0.4) continue; // nada dentro d'água
    if (terrain.slopeAt(x, z) > 0.95) continue; // nada em encostas íngremes

    const r = rand();
    let kind: PropKind;
    let radius: number;
    let scale: number;
    if (r < 0.62) {
      kind = 'tree';
      scale = 0.8 + rand() * 0.8;
      radius = 0.7 * scale;
    } else if (r < 0.9) {
      kind = 'rock';
      scale = 0.6 + rand() * 1.1;
      radius = 0.9 * scale;
    } else {
      kind = 'ruin';
      scale = 0.9 + rand() * 0.7;
      radius = 1.3 * scale;
    }

    props.push({ kind, x, z, y, rotationY: rand() * Math.PI * 2, scale });
    blockers.push({ x, z, radius });
  }

  return { seed, size, waterLevel, terrain, props, blockers, spawn, dungeon };
}
