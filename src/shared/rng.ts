// Geradores determinísticos (mesma seed => mesmo mundo). Sem dependências.
// Importante para o modo online: cliente e servidor geram o MESMO mundo a
// partir da seed, sem precisar transmitir o mapa inteiro.

/** PRNG rápido e determinístico (mulberry32). Retorna função -> [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Hash determinístico de uma célula (ix, iz) -> [0, 1). Base do ruído. */
export function hash2(ix: number, iz: number, seed: number): number {
  let h = (seed ^ Math.imul(ix, 374761393) ^ Math.imul(iz, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
