import * as THREE from 'three';
import { type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { gltfLoader } from './gltf';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { getWeaponSocket } from './EquipmentSockets';
import { WeaponGlowEffect, type WeaponGlowOptions } from './WeaponGlow';

// Carrega um personagem .glb riggado (ex.: exportado do Meshy) e gerencia suas
// animacoes com um AnimationMixer. O jogo so chama setState('idle'|'run'|...)
// e este modulo cuida do crossfade entre os clipes.

export type HeroState = 'idle' | 'move' | 'run' | 'attack' | 'jump' | 'dead';

interface ClipMatch {
  names: readonly string[];
  prefer?: 'longest' | 'shortest';
}

interface WeaponPrototype {
  root: THREE.Group;
  center: THREE.Vector3;
  minY: number;
  size: THREE.Vector3;
  largest: number;
}

const characterSources = new Map<string, Promise<GLTF>>();
const weaponPrototypes = new Map<string, Promise<WeaponPrototype>>();

// Estado do jogo -> nomes possiveis do clipe no arquivo. O warrior.glb atual
// tem clipes em portugues e varios "PARADO" duplicados; por isso o idle prefere
// o mais longo em vez do primeiro encontrado pelo THREE.AnimationClip.findByName.
const CLIP_FOR: Record<HeroState, ClipMatch> = {
  idle: { names: ['PARADO', 'PARADO.002', 'Idle_02'], prefer: 'longest' },
  move: { names: ['ANDANDO', 'Walking'] },
  run: { names: ['ANDANDO', 'Running', 'Walking'] },
  attack: { names: ['ATACANDO', 'Attack'] },
  jump: { names: ['Jump_Over_Obstacle_2'] },
  dead: { names: ['Dead'] },
};

// Clipes que tocam uma vez (em vez de repetir).
const PLAY_ONCE: ReadonlySet<HeroState> = new Set<HeroState>(['dead', 'jump', 'attack']);
// O clipe ATACANDO dura 2,42 s. A velocidade maior faz ele caber no ciclo de
// combate sem prender o herói em uma única animação por vários golpes.
const PLAYBACK_RATE: Partial<Record<HeroState, number>> = { attack: 3 };

// Remove a translacao embutida (root motion) do quadril/raiz. O avanco real do
// personagem vem da Simulation; se o clipe tambem desloca o quadril, o mesh anda
// para frente e volta dentro da propria animacao.
function isRootPositionTrack(trackName: string): boolean {
  if (!trackName.endsWith('.position')) return false;
  const target = trackName.slice(0, -'.position'.length);
  const normalized = target.replace(/[^a-z0-9]/gi, '').toLowerCase();
  return normalized === 'hips'
    || /^hips\d*$/.test(normalized)
    || normalized === 'mixamorighips'
    || /^mixamorighips\d*$/.test(normalized)
    || normalized === 'armature'
    || /^armature\d*$/.test(normalized);
}

function stripRootMotion(clip: THREE.AnimationClip): THREE.AnimationClip {
  const tracks = clip.tracks.map((track) => {
    if (!isRootPositionTrack(track.name)) return track;
    const v = track.values;
    const values = Array.from(v);
    const baseX = values[0] ?? 0;
    const baseY = values[1] ?? 0;
    const baseZ = values[2] ?? 0;
    for (let i = 0; i < values.length; i += 3) {
      values[i] = baseX;
      values[i + 1] = baseY;
      values[i + 2] = baseZ;
    }
    return new THREE.VectorKeyframeTrack(track.name, Array.from(track.times), values);
  });
  return new THREE.AnimationClip(clip.name, clip.duration, tracks, clip.blendMode);
}

function retargetDuplicateRigClip(clip: THREE.AnimationClip): THREE.AnimationClip {
  const tracks = clip.tracks.map((track) => {
    const propertyStart = track.name.indexOf('.');
    if (propertyStart < 0) return track;

    const target = track.name.slice(0, propertyStart);
    const retargeted = target.replace(/_\d+$/u, '') + track.name.slice(propertyStart);
    if (retargeted === track.name) return track;

    const clone = track.clone();
    clone.name = retargeted;
    return clone;
  });
  return new THREE.AnimationClip(clip.name, clip.duration, tracks, clip.blendMode);
}

function hasSkinnedMesh(object: THREE.Object3D): boolean {
  let result = false;
  object.traverse((child) => {
    if ((child as THREE.SkinnedMesh).isSkinnedMesh) result = true;
  });
  return result;
}

function keepSingleRig(model: THREE.Group): void {
  const rigRoots = model.children.filter((child) => hasSkinnedMesh(child));
  if (rigRoots.length <= 1) return;

  const primary = rigRoots.find((child) => child.name === 'ANDANDO') ?? rigRoots[0];
  for (const child of rigRoots) {
    if (child !== primary) child.removeFromParent();
  }
}

function findClip(animations: readonly THREE.AnimationClip[], match: ClipMatch): THREE.AnimationClip | undefined {
  const candidates = animations.filter((clip) => match.names.includes(clip.name));
  if (candidates.length === 0) return undefined;
  if (match.prefer === 'longest') return candidates.reduce((best, clip) => (clip.duration > best.duration ? clip : best));
  if (match.prefer === 'shortest') return candidates.reduce((best, clip) => (clip.duration < best.duration ? clip : best));
  return candidates[0];
}

function loadWeaponPrototype(url: string): Promise<WeaponPrototype> {
  let pending = weaponPrototypes.get(url);
  if (!pending) {
    pending = new Promise<WeaponPrototype>((resolve, reject) => {
      gltfLoader.load(url, (gltf) => {
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
        resolve({
          root,
          center: bounds.getCenter(new THREE.Vector3()),
          minY: bounds.min.y,
          size,
          largest: Math.max(size.x, size.y, size.z, 0.001),
        });
      }, undefined, reject);
    });
    weaponPrototypes.set(url, pending);
  }
  return pending;
}

function loadCharacterSource(url: string, onProgress?: (frac: number) => void): Promise<GLTF> {
  let pending = characterSources.get(url);
  if (!pending) {
    pending = new Promise<GLTF>((resolve, reject) => {
      gltfLoader.load(
        url,
        resolve,
        (ev) => {
          if (onProgress && ev.total > 0) onProgress(ev.loaded / ev.total);
        },
        reject,
      );
    });
    characterSources.set(url, pending);
  }
  return pending;
}

export async function preloadWeaponModel(url: string): Promise<void> {
  await loadWeaponPrototype(url);
}

export class CharacterModel {
  readonly root = new THREE.Group();
  ready = false;

  private mixer?: THREE.AnimationMixer;
  private readonly actions = new Map<HeroState, THREE.AnimationAction>();
  private current?: HeroState;
  private oneShotRemaining = 0;
  private attackSpeed = 1;
  private equippedWeapon?: string;
  private equippedWeaponGlowKey = '';
  private weaponAnchor?: THREE.Group;
  private weaponObject?: THREE.Object3D;
  private weaponGlowSocket?: {
    gripFromBottomRatio: number;
    worldLength: number;
  };
  private weaponGlow?: WeaponGlowEffect;

  async load(url: string, scale = 1, onProgress?: (frac: number) => void): Promise<void> {
    const gltf = await loadCharacterSource(url, onProgress);

    const model = cloneSkeleton(gltf.scene) as THREE.Group;
    model.scale.setScalar(scale);
    keepSingleRig(model);
    model.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.frustumCulled = false; // evita sumir quando a anim sai da bbox de bind
      }
    });
    this.root.add(model);

    this.mixer = new THREE.AnimationMixer(model);
    (Object.entries(CLIP_FOR) as [HeroState, ClipMatch][]).forEach(([state, match]) => {
      let clip = findClip(gltf.animations, match);
      if (!clip) {
        if (import.meta.env.DEV) {
          console.warn(`[CharacterModel] nenhum clipe para "${state}" encontrado. Tentativas: ${match.names.join(', ')}.`);
        }
        return;
      }

      // A Simulation é a única dona da posição. Remover root motion de todos
      // os clips evita que andar/correr some deslocamento próprio e pareça
      // borrar ou puxar o personagem de volta a cada loop.
      clip = stripRootMotion(retargetDuplicateRigClip(clip));

      const action = this.mixer!.clipAction(clip);
      if (PLAY_ONCE.has(state)) {
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
      }
      this.actions.set(state, action);
    });

    this.ready = true;
    this.setState('idle');
  }

  setState(state: HeroState): void {
    if (!this.ready) return;
    if (this.oneShotRemaining > 0 && this.current && PLAY_ONCE.has(this.current) && state !== 'dead') return;
    if (state === this.current && (!PLAY_ONCE.has(state) || this.oneShotRemaining > 0)) return;

    const exact = this.actions.get(state);
    const next = exact ?? this.actions.get('idle');
    if (!next) return;

    const prev = this.current ? this.actions.get(this.current) : undefined;
    if (prev && prev !== next) prev.fadeOut(0.16);

    next.reset();
    next.enabled = true;
    next.setEffectiveWeight(1);
    const playbackRate = (PLAYBACK_RATE[state] ?? 1) * (state === 'attack' ? this.attackSpeed : 1);
    next.setEffectiveTimeScale(playbackRate);
    next.fadeIn(0.16);
    next.play();

    this.current = state;
    this.oneShotRemaining = exact && PLAY_ONCE.has(state)
      ? next.getClip().duration / playbackRate
      : 0;
  }

  update(dt: number): void {
    if (this.oneShotRemaining > 0) this.oneShotRemaining = Math.max(0, this.oneShotRemaining - dt);
    this.mixer?.update(dt);
    this.weaponGlow?.update(dt);
  }

  setAttackSpeed(multiplier: number): void {
    this.attackSpeed = Math.max(0.5, Math.min(3, multiplier));
  }

  /** Equipa um GLB na mão direita do rig. O item acompanha todas as animações. */
  async equipWeapon(url: string, glowOptions: Partial<WeaponGlowOptions> = {}): Promise<void> {
    const glowLevel = glowOptions.enhancementLevel ?? 0;
    const glowKey = `${glowLevel}:${String(glowOptions.color ?? '')}:${String(glowOptions.flameColor ?? '')}:${glowOptions.rarity ?? ''}`;
    if (!this.ready || (this.equippedWeapon === url && this.equippedWeaponGlowKey === glowKey)) return;
    if (this.equippedWeapon === url && this.weaponObject && this.weaponAnchor) {
      this.updateWeaponGlow(glowOptions, glowKey);
      return;
    }
    this.unequipWeapon();
    this.equippedWeapon = url;
    this.equippedWeaponGlowKey = '';

    try {
      const prototype = await loadWeaponPrototype(url);
      if (this.equippedWeapon !== url) return;

      const socket = getWeaponSocket(url);
      const hand = this.findSocketBone(socket.boneNames);
      if (!hand) throw new Error('Osso de arma/mão direita não encontrado no rig do herói.');

      const anchor = new THREE.Group();
      anchor.name = 'equipped-weapon';
      anchor.position.set(...socket.anchorPosition);
      anchor.rotation.set(...socket.anchorRotation);
      hand.add(anchor);

      const weapon = prototype.root.clone(true);
      // O Armature deste herói vem do Blender com escala 0,01. Compensamos a
      // escala herdada pelo osso para a espada ter tamanho consistente no mundo.
      const handScale = hand.getWorldScale(new THREE.Vector3());
      const inheritedScale = Math.max(handScale.x, handScale.y, handScale.z, 0.0001);
      const scale = socket.worldLength / prototype.largest / inheritedScale;
      weapon.scale.setScalar(scale);
      const gripY = (prototype.minY + prototype.size.y * socket.gripFromBottomRatio) * scale;
      // O GLB da Kenney já é orientado no eixo Y; o osso da mão cuida da
      // rotação durante idle, caminhada e ataque.
      weapon.position.set(-prototype.center.x * scale, -gripY, -prototype.center.z * scale);
      anchor.add(weapon);
      this.weaponAnchor = anchor;
      this.weaponObject = weapon;
      this.weaponGlowSocket = {
        gripFromBottomRatio: socket.gripFromBottomRatio,
        worldLength: socket.worldLength / inheritedScale,
      };
      this.updateWeaponGlow(glowOptions, glowKey);
    } catch (error) {
      this.equippedWeapon = undefined;
      this.equippedWeaponGlowKey = '';
      this.weaponObject = undefined;
      this.weaponGlowSocket = undefined;
      console.warn('[CharacterModel] falha ao equipar arma:', error);
    }
  }

  unequipWeapon(): void {
    this.weaponGlow?.group.removeFromParent();
    this.weaponGlow?.dispose();
    this.weaponGlow = undefined;
    this.weaponAnchor?.removeFromParent();
    this.weaponAnchor = undefined;
    this.weaponObject = undefined;
    this.weaponGlowSocket = undefined;
    this.equippedWeapon = undefined;
    this.equippedWeaponGlowKey = '';
  }

  private updateWeaponGlow(glowOptions: Partial<WeaponGlowOptions>, glowKey: string): void {
    if (!this.weaponAnchor || !this.weaponObject || !this.weaponGlowSocket) return;
    if (this.equippedWeaponGlowKey === glowKey) return;

    this.weaponGlow?.group.removeFromParent();
    this.weaponGlow?.dispose();
    this.weaponGlow = undefined;
    this.equippedWeaponGlowKey = glowKey;

    const glowLevel = glowOptions.enhancementLevel ?? 0;
    if (glowLevel <= 0 && glowOptions.flameColor === undefined) return;

    this.weaponGlow = new WeaponGlowEffect(this.weaponObject, this.weaponGlowSocket, {
      enhancementLevel: glowLevel,
      color: glowOptions.color,
      flameColor: glowOptions.flameColor,
      rarity: glowOptions.rarity,
    });
    this.weaponAnchor.add(this.weaponGlow.group);
  }

  private findSocketBone(names: readonly string[]): THREE.Object3D | undefined {
    let result: THREE.Object3D | undefined;
    this.root.traverse((object) => {
      if (!result && names.includes(object.name)) result = object;
    });
    return result;
  }
}
