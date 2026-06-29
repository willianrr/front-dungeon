// Pequena biblioteca de vetores SEM dependência de Three.js.
// Mantida "pura" de propósito: este código (e o de /sim) é a lógica
// autoritativa do jogo e poderia ser portado para um servidor em Go
// quase 1:1. O plano da mundo acontece no eixo XZ; Y é a altura.

export interface V3 {
  x: number;
  y: number;
  z: number;
}

export function v3(x = 0, y = 0, z = 0): V3 {
  return { x, y, z };
}

/** Distância no plano do chão (ignora a altura Y). */
export function distXZ(a: V3, b: V3): number {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.hypot(dx, dz);
}

/** Ângulo (em radianos) para "olhar" de `from` em direção a `to` no plano XZ. */
export function angleXZ(from: V3, to: V3): number {
  return Math.atan2(to.x - from.x, to.z - from.z);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
