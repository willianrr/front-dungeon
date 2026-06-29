import * as THREE from 'three';
import { gltfLoader as loader } from './gltf';
import type { LootState } from '../shared/types';

interface LootPrototype {
  root: THREE.Group;
  scale: number;
  yOffset: number;
}

// Cacheia cada GLB de loot: dezenas de drops compartilham uma unica carga de
// rede e materiais/geometrias, mas cada um recebe seu proprio Group na cena.
export class LootModels {
  private readonly prototypes = new Map<string, Promise<LootPrototype>>();

  async preload(urls: readonly string[]): Promise<void> {
    await Promise.all(urls.map((url) => this.get(url).then(() => undefined)));
  }

  async createModel(url: string): Promise<THREE.Object3D> {
    const prototype = await this.get(url);
    const model = prototype.root.clone(true);
    model.scale.setScalar(prototype.scale);
    model.position.y = prototype.yOffset;
    return model;
  }

  async replacePlaceholder(container: THREE.Group, loot: LootState): Promise<void> {
    try {
      const model = await this.createModel(loot.modelUrl);

      if (!container.parent) return;
      const persistentChildren = container.children.filter((child) => child.userData.persistentClickArea === true);
      container.clear();
      container.add(model, ...persistentChildren);
    } catch (error) {
      console.warn(`[LootModels] Nao foi possivel carregar ${loot.modelUrl}:`, error);
    }
  }

  private get(url: string): Promise<LootPrototype> {
    let pending = this.prototypes.get(url);
    if (!pending) {
      pending = new Promise<LootPrototype>((resolve, reject) => {
        loader.load(url, (gltf) => {
          const root = gltf.scene;
          root.traverse((object) => {
            const mesh = object as THREE.Mesh;
            if (mesh.isMesh) {
              mesh.castShadow = true;
              mesh.frustumCulled = false;
            }
          });

          const bounds = new THREE.Box3().setFromObject(root);
          const size = bounds.getSize(new THREE.Vector3());
          const largest = Math.max(size.x, size.y, size.z, 0.001);
          const scale = 0.72 / largest;
          resolve({
            root,
            scale,
            yOffset: -bounds.min.y * scale,
          });
        }, undefined, reject);
      });
      this.prototypes.set(url, pending);
    }
    return pending;
  }
}
