import * as THREE from 'three';
import { type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { gltfLoader as loader } from './gltf';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { EntityAction } from '../shared/types';

// Os arquivos do Meshy têm o mesmo rig e cada um traz uma animação. Carregamos
// uma cena-base e reaproveitamos os clips das demais exportações no mesmo
// esqueleto. Assim cada inimigo é uma cópia independente e animável.

const ASSET_URLS = {
  walk: '/models/zombie/Meshy_AI_crie_um_zombie_3d_de__biped_Animation_Walking_withSkin.glb',
  run: '/models/zombie/Meshy_AI_crie_um_zombie_3d_de__biped_Animation_Running_withSkin.glb',
  attack: '/models/zombie/Meshy_AI_crie_um_zombie_3d_de__biped_Animation_Zombie_Scream_withSkin.glb',
  dead: '/models/zombie/Meshy_AI_crie_um_zombie_3d_de__biped_Animation_dying_backwards_withSkin.glb',
} as const;

type ZombieState = Extract<EntityAction, 'idle' | 'walk' | 'run' | 'attack' | 'dead'>;
type ClipKey = Exclude<ZombieState, 'idle'>;
function load(url: string): Promise<GLTF> {
  return new Promise((resolve, reject) => loader.load(url, resolve, undefined, reject));
}

export class ZombieInstance {
  readonly root: THREE.Group;
  private readonly mixer: THREE.AnimationMixer;
  private readonly actions = new Map<ZombieState, THREE.AnimationAction>();
  private state: ZombieState = 'idle';

  constructor(base: THREE.Group, clips: Map<ClipKey, THREE.AnimationClip>) {
    this.root = cloneSkeleton(base) as THREE.Group;
    this.root.scale.setScalar(1.08);
    this.root.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.frustumCulled = false;
      }
    });

    this.mixer = new THREE.AnimationMixer(this.root);
    for (const [state, clip] of clips) {
      const action = this.mixer.clipAction(clip);
      if (state === 'dead') {
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
      }
      this.actions.set(state, action);
    }
    this.setState('idle');
  }

  setState(next: ZombieState): void {
    if (next === this.state) return;
    const previous = this.actions.get(this.state);
    if (previous) previous.fadeOut(0.12);

    // Não há clip idle no pacote. Pausar a primeira pose de caminhada é uma
    // espera estável e evita carregar mais um GLB só para uma pose neutra.
    if (next === 'idle') {
      this.state = next;
      return;
    }

    const action = this.actions.get(next) ?? this.actions.get('walk');
    if (!action) return;
    action.reset();
    action.enabled = true;
    action.setEffectiveWeight(1);
    action.fadeIn(0.12);
    action.play();
    this.state = next;
  }

  update(dt: number): void {
    if (this.state !== 'idle') this.mixer.update(dt);
  }
}

export class ZombieLibrary {
  private base?: THREE.Group;
  private readonly clips = new Map<ClipKey, THREE.AnimationClip>();
  private loadPromise?: Promise<void>;

  get ready(): boolean {
    return !!this.base;
  }

  load(): Promise<void> {
    if (this.loadPromise) return this.loadPromise;
    this.loadPromise = Promise.all(Object.entries(ASSET_URLS).map(async ([key, url]) => [key, await load(url)] as const))
      .then((assets) => {
        const byKey = new Map(assets);
        const walking = byKey.get('walk');
        if (!walking) throw new Error('Modelo-base do zumbi não encontrado.');
        this.base = walking.scene;
        this.base.traverse((object) => {
          const mesh = object as THREE.Mesh;
          if (mesh.isMesh) {
            mesh.castShadow = true;
            mesh.frustumCulled = false;
          }
        });
        for (const [key, gltf] of byKey) {
          const clip = gltf.animations[0];
          if (clip) this.clips.set(key as ClipKey, clip);
        }
      })
      .catch((error) => {
        this.loadPromise = undefined;
        throw error;
      });
    return this.loadPromise;
  }

  create(): ZombieInstance | null {
    return this.base ? new ZombieInstance(this.base, this.clips) : null;
  }
}
