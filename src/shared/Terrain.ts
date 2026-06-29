import { hash2 } from './rng';

// Terreno procedural SEM Three.js. Expõe heightAt(x, z): a mesma função é
// usada para construir a malha 3D (renderer) e para posicionar/colidir
// entidades (simulação). Assim o visual e a lógica nunca discordam.

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

/** Ruído de valor com interpolação suave (uma oitava). */
function valueNoise(x: number, z: number, seed: number): number {
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const fx = smooth(x - x0);
  const fz = smooth(z - z0);
  const n00 = hash2(x0, z0, seed);
  const n10 = hash2(x0 + 1, z0, seed);
  const n01 = hash2(x0, z0 + 1, seed);
  const n11 = hash2(x0 + 1, z0 + 1, seed);
  const nx0 = n00 + (n10 - n00) * fx;
  const nx1 = n01 + (n11 - n01) * fx;
  return nx0 + (nx1 - nx0) * fz; // 0..1
}

/** Ruído fractal (várias oitavas somadas) -> 0..1. */
function fbm(x: number, z: number, seed: number): number {
  let amp = 1;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  for (let o = 0; o < 5; o++) {
    sum += amp * valueNoise(x * freq, z * freq, seed + o * 1013);
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}

export interface FlatSpot {
  x: number;
  z: number;
  r: number;
}

export class Terrain {
  readonly half: number;

  private readonly amplitude = 11;
  private readonly baseScale = 0.03;
  private readonly detailScale = 0.08;

  constructor(
    readonly seed: number,
    readonly size = 200,
    private readonly flatSpots: FlatSpot[] = [],
  ) {
    this.half = size / 2;
  }

  /** Altura do terreno (Y) num ponto do mundo. */
  heightAt(x: number, z: number): number {
    const base = fbm(x * this.baseScale + 1000, z * this.baseScale + 1000, this.seed);
    const detail = fbm(x * this.detailScale - 500, z * this.detailScale - 500, this.seed + 7) - 0.5;
    let h = (base - 0.5) * 2 * this.amplitude + detail * 2.5;
    h *= this.flattenFactor(x, z);
    return h;
  }

  /** Inclinação aproximada (0 = plano). Útil para colocar/colorir coisas. */
  slopeAt(x: number, z: number): number {
    const e = 1;
    const dx = this.heightAt(x + e, z) - this.heightAt(x - e, z);
    const dz = this.heightAt(x, z + e) - this.heightAt(x, z - e);
    return Math.hypot(dx, dz) / (2 * e);
  }

  // Achata o centro (área de spawn) e os "spots" informados (ex.: masmorra),
  // para que existam áreas planas jogáveis no meio do relevo.
  private flattenFactor(x: number, z: number): number {
    let f = this.spotFactor(x, z, 0, 0, 13, 32);
    for (const s of this.flatSpots) {
      f = Math.min(f, this.spotFactor(x, z, s.x, s.z, s.r, s.r + 10));
    }
    return f;
  }

  private spotFactor(x: number, z: number, cx: number, cz: number, inner: number, outer: number): number {
    const d = Math.hypot(x - cx, z - cz);
    if (d <= inner) return 0;
    if (d >= outer) return 1;
    return smooth((d - inner) / (outer - inner));
  }
}
