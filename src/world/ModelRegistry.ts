import * as THREE from 'three';
import { gltfLoader as loader } from './gltf';
import type { PropInstance, PropKind } from '../shared/worldgen';

// ---------------------------------------------------------------------------
// Encaixe para arte real (.glb / .gltf).
//
// Sem nada registrado, o jogo usa os props procedurais (formas geométricas).
// Para usar modelos reais, baixe packs gratuitos (ex.: Kenney, Quaternius,
// Poly Pizza), coloque os arquivos em `public/models/` e registre:
//
//   const registry = new ModelRegistry();
//   registry.register('tree', '/models/arvore.glb');
//   registry.register('rock', '/models/pedra.glb');
//
// depois passe `registry` ao criar o World (veja Game.ts).
// ---------------------------------------------------------------------------

export class ModelRegistry {
  private readonly map = new Map<PropKind, string>();

  register(kind: PropKind, url: string): void {
    this.map.set(kind, url);
  }

  get(kind: PropKind): string | undefined {
    return this.map.get(kind);
  }
}

export function loadGLTF(url: string): Promise<THREE.Group> {
  return new Promise((resolve, reject) => {
    loader.load(url, (gltf) => resolve(gltf.scene), undefined, reject);
  });
}

/** Carrega um modelo e o clona em cada posição de prop daquele tipo. */
export async function placeModels(scene: THREE.Object3D, url: string, list: PropInstance[]): Promise<void> {
  try {
    const model = await loadGLTF(url);
    model.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) mesh.castShadow = true;
    });
    for (const p of list) {
      const clone = model.clone(true);
      clone.position.set(p.x, p.y, p.z);
      clone.rotation.set(0, p.rotationY, 0);
      clone.scale.setScalar(p.scale);
      scene.add(clone);
    }
  } catch (err) {
    console.warn(`[ModelRegistry] Falha ao carregar ${url}:`, err);
  }
}
