import * as THREE from 'three';
import { gltfLoader as loader } from './gltf';

interface ChestPrototype {
  root: THREE.Group;
  scale: number;
  yOffset: number;
}

export const CHEST_MODEL_URLS = {
  closed: '/items/Chest_Closed.glb',
  open: '/items/Chest_Open.glb',
} as const;

export class ChestModels {
  private readonly prototypes = new Map<string, Promise<ChestPrototype>>();

  async preload(): Promise<void> {
    await Promise.all(Object.values(CHEST_MODEL_URLS).map((url) => this.get(url).then(() => undefined)));
  }

  async createModel(opened: boolean): Promise<THREE.Object3D> {
    const prototype = await this.get(opened ? CHEST_MODEL_URLS.open : CHEST_MODEL_URLS.closed);
    const model = prototype.root.clone(true);
    model.scale.setScalar(prototype.scale);
    model.position.y = prototype.yOffset;
    return model;
  }

  async replaceModel(container: THREE.Group, opened: boolean): Promise<void> {
    const requestedState = opened ? 'open' : 'closed';
    container.userData.chestModelState = requestedState;
    try {
      const model = await this.createModel(opened);
      if (!container.parent || container.userData.chestModelState !== requestedState) return;
      const persistentChildren = container.children.filter((child) => child.userData.persistentClickArea === true);
      container.clear();
      container.add(model, ...persistentChildren);
    } catch (error) {
      console.warn('[ChestModels] nao foi possivel carregar bau:', error);
    }
  }

  private get(url: string): Promise<ChestPrototype> {
    let pending = this.prototypes.get(url);
    if (!pending) {
      pending = new Promise<ChestPrototype>((resolve, reject) => {
        loader.load(url, (gltf) => {
          const root = gltf.scene;
          root.traverse((object) => {
            const mesh = object as THREE.Mesh;
            if (mesh.isMesh) {
              mesh.castShadow = true;
              mesh.receiveShadow = true;
              mesh.frustumCulled = false;
            }
          });

          const bounds = new THREE.Box3().setFromObject(root);
          const size = bounds.getSize(new THREE.Vector3());
          const largest = Math.max(size.x, size.y, size.z, 0.001);
          const scale = 1.35 / largest;
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
