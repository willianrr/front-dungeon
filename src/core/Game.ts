import * as THREE from 'three';
import { Sfx } from '../audio/Sfx';
import type { NetworkClient } from '../net/NetworkClient';
import type { PlayerProfile } from '../shared/playerProfile';
import type { Terrain } from '../shared/Terrain';
import { GEM_DEFINITIONS, ITEM_ICON_URLS, RARITY_COLORS, glowColorForGem } from '../shared/itemMeta';
import type { ChestState, CombatEvent, CombatTextKind, DamageKind, EntityState, EquippedWeaponVisualState, LootState, WorldZone } from '../shared/types';
import { HUD, HUD_SKILL_ICON_URLS, preloadHudIcons } from '../ui/HUD';
import { CameraRig } from '../world/CameraRig';
import { CharacterModel, preloadWeaponModel, type HeroState } from '../world/CharacterModel';
import { ChestModels } from '../world/ChestModels';
import { ArcaneNovaEffect } from '../world/ArcaneNovaEffect';
import { createCharacter, createTargetMarker } from '../world/factory';
import { HealthBar3D } from '../world/HealthBar3D';
import { FloatingDamageText } from '../world/FloatingDamageText';
import { HitImpactEffect } from '../world/HitImpactEffect';
import { BossSlamEffect } from '../world/BossSlamEffect';
import { LootLabel3D } from '../world/LootLabel3D';
import { LootModels } from '../world/LootModels';
import { World, type RenderQualityPreset } from '../world/World';
import { WeaponGlowEffect } from '../world/WeaponGlow';
import { ZombieInstance, ZombieLibrary } from '../world/ZombieModel';
import { preloadBladeFireTexture } from '../world/BladeFireParticles';
import { Input } from './Input';
import { KeyboardMoveController } from './KeyboardMoveController';
import { ClientMovementPredictor } from './ClientMovementPredictor';
import { PerfOverlay } from '../ui/PerfOverlay';

interface View {
  group: THREE.Group;
  healthBar?: HealthBar3D;
  kind: 'player' | 'enemy';
  hero?: CharacterModel;
  heroLoading?: boolean;
  heroModelUrl?: string;
  heroFailedUrl?: string;
  equippedWeaponKey?: string | null;
  jumpArc?: number;
  wasJumping?: boolean;
  zombie?: ZombieInstance;
  initialized?: boolean;
  animAccum?: number;
}

interface LootView {
  group: THREE.Group;
  label?: LootLabel3D;
  labelColor: string;
  labelText: string;
  baseY: number;
  labelQueued: boolean;
  phase: number;
}

interface ChestView {
  group: THREE.Group;
  opened: boolean;
}

export type RenderQualityLevel = 'high' | 'medium' | 'low';
export type RenderQualityMode = RenderQualityLevel | 'auto';

const MARKER_DURATION = 0.6;
const CLOSE_TARGET_RADIUS = 3.4;
const CLOSE_CLICK_RADIUS = 2.8;
const LOOT_CLICK_RADIUS = 1.25;
const CHEST_CLICK_RADIUS = 1.45;
const LOOT_FALLBACK_GEOMETRY = new THREE.IcosahedronGeometry(0.3, 1);
const LOOT_CLICK_GEOMETRY = new THREE.SphereGeometry(LOOT_CLICK_RADIUS, 12, 8);
const LOOT_CLICK_MATERIAL = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
const CHEST_CLICK_GEOMETRY = new THREE.SphereGeometry(CHEST_CLICK_RADIUS, 14, 8);
const CHEST_CLICK_MATERIAL = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
const lootFallbackMaterials = new Map<string, THREE.MeshStandardMaterial>();
const CHEST_FALLBACK_GEOMETRY = new THREE.BoxGeometry(1.35, 0.86, 0.92);
const CHEST_FALLBACK_MATERIAL = new THREE.MeshStandardMaterial({ color: 0x7a4b24, roughness: 0.78, metalness: 0.08 });
const ENEMY_HEALTH_BAR_HEIGHT = 2.6;
const MAX_FLOATING_COMBAT_TEXTS = 36;

// --- Personagem 3D do heroi (.glb) ---
const HERO_MODEL_URL = '/models/warrior.glb';
const EQUIPPED_SWORD_MODEL_URL = '/items/Sword_Golden.glb';
const PRELOAD_LOOT_MODEL_URLS = [
  '/items/Coin.glb',
  '/items/Potion2_Filled.glb',
  '/items/Potion1_Filled.glb',
  EQUIPPED_SWORD_MODEL_URL,
  GEM_DEFINITIONS.jewel_bless.modelUrl,
  GEM_DEFINITIONS.jewel_soul.modelUrl,
] as const;
const HERO_SCALE = 1.0;
const HERO_FACING_OFFSET = 0; // se o heroi andar/atacar de costas, troque para Math.PI
const EQUIPPED_SWORD_TEST_ENHANCEMENT = 15;

function shouldForceWeaponGlowPreview(): boolean {
  return new URLSearchParams(window.location.search).has('weaponGlow');
}

// --- Pulo (avanco e feito no servidor; aqui so o arco vertical + animacao) ---
const JUMP_TIME = 0.5; // deve casar com jumpTime do backend
const JUMP_HEIGHT = 1.8;
const HERO_LOAD_TIMEOUT = 8000;
const ZOMBIE_LOAD_TIMEOUT = 9000;
const GAMEPLAY_ASSET_PRELOAD_TIMEOUT = 7000;
// Teto de PointLights simultaneas para as quais pre-compilamos os shaders.
// O three.js inclui a CONTAGEM de luzes na chave do programa, entao cada novo
// total de luzes recompila os materiais visiveis. O 1o hit vai de 0->1 (o maior
// congelamento); golpes/efeitos podem se sobrepor, entao aquecemos uma faixa.
const WARMUP_MAX_EFFECT_LIGHTS = 4;
const RENDER_QUALITY_STORAGE_KEY = 'aranna:render-quality:v1';
const RENDER_QUALITY_MODES: readonly RenderQualityMode[] = ['auto', 'high', 'medium', 'low'];
const AUTO_QUALITY_SAMPLE_SECONDS = 4;
const AUTO_QUALITY_COOLDOWN_SECONDS = 8;
const AUTO_QUALITY_DOWNGRADE_FPS = 44;
const AUTO_QUALITY_UPGRADE_FPS = 58;
const FRAME_STALL_WARN_MS = 120;
const FRAME_STALL_LOG_COOLDOWN_MS = 1500;
const FRAME_STALL_SEVERE_MS = 500;
// Fase 3 — culling de inimigos fora de tela + LOD de animação dos zumbis.
const LOCAL_PLAYER_CORRECTION_RATE = 4;
const REMOTE_RECONCILE_RATE = 28;
const LOCAL_PLAYER_IGNORE_CORRECTION_DISTANCE = 0.85;
const LOCAL_PLAYER_SNAP_CORRECTION_DISTANCE = 3;
const ENEMY_CULL_RADIUS = 2.6;        // raio (un. de mundo) da esfera testada no frustum
const ENEMY_CULL_CENTER_Y = 1.2;      // sobe o centro da esfera p/ a altura do corpo
const ENEMY_CULL_MAX_DISTANCE = 95;   // além disso o inimigo nunca é desenhado
const ENEMY_ANIM_NEAR_DISTANCE = 24;  // < : anima todo frame
const ENEMY_ANIM_FAR_DISTANCE = 50;   // entre near e far: ~15 Hz; além de far: ~8 Hz
const ENEMY_ANIM_MID_INTERVAL = 1 / 15;
const ENEMY_ANIM_FAR_INTERVAL = 1 / 8;
const RENDER_QUALITY_PRESETS: Record<RenderQualityLevel, RenderQualityPreset> = {
  high: {
    bloom: true,
    bloomStrength: 1.08,
    pixelRatioCap: 1.5,
    shadows: true,
    shadowMapSize: 2048,
  },
  medium: {
    bloom: false,
    bloomStrength: 0,
    pixelRatioCap: 1,
    shadows: false,
    shadowMapSize: 1536,
  },
  low: {
    bloom: false,
    bloomStrength: 0,
    pixelRatioCap: 0.75,
    shadows: false,
    shadowMapSize: 512,
  },
};

// GAME = a parte "cliente": le snapshots da rede e os desenha; traduz cliques
// em comandos. Nunca altera o estado do jogo diretamente.

// Otimizacoes de performance aplicadas — Fase 1 (texturas/loader central) e
// Fase 3 (culling de inimigos + LOD de animacao). Ver PLANO-PERFORMANCE.md.
export class Game {
  private readonly net: NetworkClient;
  private readonly terrain: Terrain;
  private readonly world: World;
  private readonly rig: CameraRig;
  private readonly input: Input;
  private readonly hud: HUD;
  private readonly sfx = new Sfx();

  private readonly views = new Map<string, View>();
  private readonly latestEntities = new Map<string, EntityState>();
  private readonly enemyMeshes: THREE.Object3D[] = [];
  private readonly lootViews = new Map<string, LootView>();
  private readonly lootMeshes: THREE.Object3D[] = [];
  private readonly chestViews = new Map<string, ChestView>();
  private readonly chestMeshes: THREE.Object3D[] = [];
  private readonly enemyHp = new Map<string, number>();
  private readonly damageTexts: FloatingDamageText[] = [];
  private readonly hitEffects: HitImpactEffect[] = [];
  private readonly bossSlamEffects: BossSlamEffect[] = [];
  private readonly skillEffects: ArcaneNovaEffect[] = [];
  private readonly seenCombatEvents = new Set<string>();
  private readonly raycaster = new THREE.Raycaster();
  private readonly cullFrustum = new THREE.Frustum();
  private readonly cullViewProjection = new THREE.Matrix4();
  private readonly cullSphere = new THREE.Sphere();
  private readonly reconcileTarget = new THREE.Vector3();
  private readonly perf = new PerfOverlay();
  private readonly targetMarker: THREE.Mesh;
  private markerTimer = 0;
  private lastTime = 0;

  private playerModel: CharacterModel | null = null;
  private readonly zombies = new ZombieLibrary();
  private readonly lootModels = new LootModels();
  private readonly chestModels = new ChestModels();
  private jumpArc = 0;
  private wasJumping = false;
  private elapsed = 0;
  private zone: WorldZone = 'overworld';
  private readonly keyboardMove = new KeyboardMoveController();
  private readonly clientMovement = new ClientMovementPredictor();
  private equippedWeaponKey: string | null = null;
  private readonly forceWeaponGlowPreview = shouldForceWeaponGlowPreview();
  private useLightAssets = false;
  private damageTextSerial = 0;
  private selectedEnemyId: string | null = null;
  private hudDirty = true;
  private lastSnapshotTick = -1;
  private localPlayerMoving = false;
  private localPlayerRunning = false;
  private renderQualityMode: RenderQualityMode = this.readRenderQualityMode();
  private autoQualityLevel: RenderQualityLevel = this.initialAutoQualityLevel();
  private qualitySampleSeconds = 0;
  private qualitySampleFrames = 0;
  private qualityCooldown = 0;
  private lastFrameStallLog = 0;

  constructor(canvas: HTMLCanvasElement, uiLayer: HTMLElement, net: NetworkClient, profile: PlayerProfile) {
    this.net = net;
    const worldData = this.net.getWorld();
    this.terrain = worldData.terrain;

    this.world = new World(canvas, worldData);
    this.rig = new CameraRig(window.innerWidth / window.innerHeight);
    this.input = new Input(canvas);
    this.hud = new HUD(uiLayer, profile, worldData);
    this.applyRenderQuality();

    this.targetMarker = createTargetMarker();
    this.world.scene.add(this.targetMarker);

    this.hud.onRespawn = () => this.net.send({ type: 'respawn', entityId: this.net.playerId });
    this.hud.onEquipItem = (itemId) => this.net.send({ type: 'equip-item', entityId: this.net.playerId, itemId });
    this.hud.onUseItem = (item) => this.net.send({ type: 'use-item', entityId: this.net.playerId, item });
    this.hud.onUnequipSlot = (slot) => this.net.send({ type: 'unequip-slot', entityId: this.net.playerId, slot });
    this.hud.onAllocateAttribute = (attribute) => this.net.send({
      type: 'allocate-attribute',
      entityId: this.net.playerId,
      attribute,
    });

    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  /** Carrega o heroi, mostra a tela de loading e so entao inicia o loop. */
  async run(): Promise<void> {
    const loading = document.getElementById('loading');
    const bar = document.getElementById('loading-bar');
    const pct = document.getElementById('loading-pct');

    const lightAssets = this.shouldUseLightAssets();
    this.useLightAssets = lightAssets;
    const hero = new CharacterModel();
    if (bar) bar.style.width = '8%';
    if (pct) pct.textContent = '8%';
    if (!lightAssets) {
      const zombieLoad = this.zombies.load();
      const gameplayPreload = this.preloadGameplayAssets();
      try {
        await this.withTimeout(hero.load(HERO_MODEL_URL, HERO_SCALE, (frac) => {
          const p = Math.round(frac * 72);
          if (bar) bar.style.width = `${p}%`;
          if (pct) pct.textContent = `${p}%`;
        }), HERO_LOAD_TIMEOUT);
        this.world.scene.add(hero.root);
        this.playerModel = hero;
      } catch (err) {
        console.warn('[Game] falha ao carregar o heroi (usando placeholder):', err);
      }

      try {
        await this.withTimeout(zombieLoad, ZOMBIE_LOAD_TIMEOUT);
        if (bar) bar.style.width = '86%';
        if (pct) pct.textContent = '86%';
      } catch (err) {
        console.warn('[Game] falha ao carregar zumbis (usando placeholders):', err);
        void zombieLoad.then(() => {
          for (const view of this.views.values()) this.attachZombie(view);
        }).catch(() => {});
      }

      try {
        await this.withTimeout(gameplayPreload, GAMEPLAY_ASSET_PRELOAD_TIMEOUT);
      } catch (err) {
        console.warn('[Game] preload de assets de gameplay nao terminou a tempo:', err);
      }
      if (bar) bar.style.width = '92%';
      if (pct) pct.textContent = '92%';
    } else {
      if (bar) bar.style.width = '100%';
      if (pct) pct.textContent = '100%';
    }

    // Desenha um quadro completo primeiro: isso cria na cena as views reais
    // (zumbis, loot e baus do primeiro snapshot) que tambem queremos aquecer.
    this.renderOnce();

    if (!lightAssets) {
      // Com a cena ja povoada, aquece os shaders DIRETO na world.scene real
      // (luzes/fog/sombras de verdade). Isso elimina os congelamentos do
      // primeiro drop de cada item e do primeiro hit (0->1 PointLight).
      try {
        await this.warmupGameplayRendering();
      } catch (err) {
        console.warn('[Game] warmup de gameplay falhou (ignorado):', err);
      }
      if (bar) bar.style.width = '100%';
      if (pct) pct.textContent = '100%';
    }

    if (loading) loading.classList.add('hidden');

    this.lastTime = performance.now();
    requestAnimationFrame(this.frame);
  }

  private withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => reject(new Error(`Tempo de carregamento excedido (${ms}ms).`)), ms);
      promise.then(
        (value) => {
          window.clearTimeout(timer);
          resolve(value);
        },
        (error) => {
          window.clearTimeout(timer);
          reject(error);
        },
      );
    });
  }

  // Apenas I/O (rede + parse + upload de textura). NAO toca na world.scene,
  // entao roda em paralelo com o carregamento do heroi/zumbis sem corrida. O
  // aquecimento de shaders acontece depois, em warmupGameplayRendering().
  private async preloadGameplayAssets(): Promise<void> {
    const fireTexturePromise = preloadBladeFireTexture();
    await Promise.all([
      this.lootModels.preload(PRELOAD_LOOT_MODEL_URLS),
      this.chestModels.preload(),
      preloadWeaponModel(EQUIPPED_SWORD_MODEL_URL),
      preloadHudIcons([...Object.values(ITEM_ICON_URLS), ...Object.values(HUD_SKILL_ICON_URLS)]),
      fireTexturePromise,
    ]);
    this.world.renderer.initTexture(await fireTexturePromise);
  }

  // Aquece os shaders de TUDO que aparece no jogo, mas direto na world.scene
  // real (mesmas luzes/fog/sombras/tonemapping). Como o three.js inclui a
  // contagem de luzes e a fog na chave do programa, os shaders compilados numa
  // cena "de mentira" nao eram reaproveitados aqui — por isso o primeiro drop
  // de cada item e o primeiro hit travavam. Pagamos esse custo no loading.
  private async warmupGameplayRendering(): Promise<void> {
    await this.warmupZoneRendering('overworld');
    try {
      await this.warmupZoneRendering('dungeon');
    } catch (err) {
      console.warn('[Game] warmup da dungeon falhou (ignorado):', err);
    }
    // O jogo sempre comeca no overworld; o primeiro frame ressincroniza a zona.
    this.world.setZone('overworld');
    this.zone = 'overworld';
  }

  private async warmupZoneRendering(zone: WorldZone): Promise<void> {
    const scene = this.world.scene;
    const camera = this.rig.camera;
    this.world.setZone(zone);

    const FAR_BELOW = -1000; // fora de qualquer enquadramento, caso sobre 1 frame
    // Wrappers cuja geometria/material sao COMPARTILHADOS (prototipos/caches):
    // so removemos da cena, nunca dispomos.
    const temporaryObjects: THREE.Object3D[] = [];
    // Recursos criados aqui (efeitos/labels/brilho): dispose seguro no fim.
    const disposables: Array<{ dispose(): void }> = [];
    const ownedGeometries: THREE.BufferGeometry[] = [];
    const ownedMaterials: THREE.Material[] = [];
    const warmupLights: THREE.PointLight[] = [];

    const addTemporary = (object: THREE.Object3D): THREE.Object3D => {
      object.position.y += FAR_BELOW;
      object.traverse((child) => {
        // Forca o desenho mesmo fora da tela: assim as texturas sobem pra GPU e
        // os programas sao realmente usados (frustum culling pularia o objeto).
        (child as THREE.Mesh).frustumCulled = false;
        // Luzes internas dos efeitos/brilho nao entram na contagem controlada.
        if ((child as THREE.PointLight).isPointLight) child.visible = false;
      });
      scene.add(object);
      temporaryObjects.push(object);
      return object;
    };

    try {
      // 1) Loot/baus: meshes "fallback" (geometria/material reais de
      //    reconcileLoot/reconcileChests) + areas de clique.
      const fallbackSample: LootState = {
        id: 'warmup', kind: 'sword', name: 'warmup', icon: '', modelUrl: '',
        position: { x: 0, y: 0, z: 0 }, count: 1, rarity: 'lendario',
      };
      const lootFallback = addTemporary(new THREE.Mesh(LOOT_FALLBACK_GEOMETRY, this.lootFallbackMaterial(fallbackSample)));
      lootFallback.castShadow = true;
      addTemporary(new THREE.Mesh(LOOT_CLICK_GEOMETRY, LOOT_CLICK_MATERIAL));
      const chestFallback = addTemporary(new THREE.Mesh(CHEST_FALLBACK_GEOMETRY, CHEST_FALLBACK_MATERIAL));
      chestFallback.castShadow = true;
      chestFallback.receiveShadow = true;
      addTemporary(new THREE.Mesh(CHEST_CLICK_GEOMETRY, CHEST_CLICK_MATERIAL));

      // 2) Modelos GLB de loot e bau (clones COMPARTILHAM geometria/material do
      //    prototipo em cache: nunca dispor, apenas remover da cena).
      const lootModels = await Promise.all(PRELOAD_LOOT_MODEL_URLS.map((url) => this.lootModels.createModel(url)));
      for (const model of lootModels) addTemporary(model);
      const chestModels = await Promise.all([
        this.chestModels.createModel(false),
        this.chestModels.createModel(true),
      ]);
      for (const model of chestModels) addTemporary(model);

      // 3) Inimigo (skinned mesh = programa proprio). O primeiro hit mira nele,
      //    entao garantimos o material dele aquecido em todas as contagens de luz.
      const zombie = this.zombies.create();
      if (zombie) {
        zombie.update(1 / 60);
        addTemporary(zombie.root);
      }

      // 4) Rotulos e numeros de combate (SpriteMaterial + fog).
      const label = new LootLabel3D('Jewel of Bless', glowColorForGem('bless'));
      addTemporary(label.sprite);
      disposables.push(label);
      for (const kind of ['physical', 'magic', 'incoming', 'miss'] as const) {
        const text = new FloatingDamageText(123, new THREE.Vector3(0, 0, 0), 0, kind);
        addTemporary(text.sprite);
        disposables.push(text);
      }

      // 5) Efeitos de acao (materiais additive + PointLight propria). Escondemos
      //    as luzes internas para controlar a contagem na varredura abaixo.
      const effects: Array<{ group: THREE.Group; dispose(): void }> = [
        new HitImpactEffect(new THREE.Vector3(0, 0, 0), 'physical', 0),
        new HitImpactEffect(new THREE.Vector3(0, 0, 0), 'magic', 1),
        new ArcaneNovaEffect(new THREE.Vector3(0, 0, 0), 6),
        new BossSlamEffect(new THREE.Vector3(0, 0, 0), 6, 'warning', 1),
        new BossSlamEffect(new THREE.Vector3(0, 0, 0), 6, 'impact', 0.46),
      ];
      for (const effect of effects) {
        addTemporary(effect.group);
        disposables.push(effect);
      }

      // 6) Brilho de arma (espada lendaria com chama): mesmos materiais do
      //    WeaponGlow equipado, num peso "dummy" para nao mexer no heroi real.
      const dummyWeapon = new THREE.Group();
      const weaponGeometry = new THREE.BoxGeometry(0.12, 1.55, 0.12);
      const weaponMaterial = new THREE.MeshStandardMaterial({
        color: 0xf0c64b, emissive: 0x111111, metalness: 0.65, roughness: 0.3,
      });
      ownedGeometries.push(weaponGeometry);
      ownedMaterials.push(weaponMaterial);
      const weaponMesh = new THREE.Mesh(weaponGeometry, weaponMaterial);
      weaponMesh.position.y = 0.78;
      dummyWeapon.add(weaponMesh);
      addTemporary(dummyWeapon);
      const glow = new WeaponGlowEffect(dummyWeapon, { worldLength: 1.55, gripFromBottomRatio: 0.16 }, {
        enhancementLevel: 15, color: glowColorForGem('bless'), flameColor: 0xff4f12, rarity: 'lendario',
      });
      glow.update(1 / 60);
      // IMPORTANTE: WeaponGlowEffect.dispose() NAO remove o grupo da cena, entao
      // adicionamos via addTemporary (que tambem o remove na limpeza). Sem isso o
      // brilho "vazava" e ficava parado na origem (a luz branca estranha).
      addTemporary(glow.group);
      disposables.push(glow);

      // 7) Varredura: para cada contagem de PointLights (0 ate o teto), faz um
      //    RENDER real. Render compila os shaders daquela contagem de forma
      //    sincrona/garantida E sobe as texturas dos objetos forcados a desenhar
      //    (frustumCulled=false). O custo do "primeiro hit"/"primeiro drop" sai
      //    daqui, na tela de loading, em vez de acontecer durante o jogo.
      for (let count = 0; count <= WARMUP_MAX_EFFECT_LIGHTS; count++) {
        while (warmupLights.length < count) {
          const light = new THREE.PointLight(0xffffff, 1, 12, 2);
          light.position.set(0, FAR_BELOW + 1, 0);
          scene.add(light);
          warmupLights.push(light);
        }
        this.world.render(camera);
      }
    } finally {
      for (const light of warmupLights) scene.remove(light);
      for (const item of disposables) item.dispose();
      for (const object of temporaryObjects) scene.remove(object);
      for (const geometry of ownedGeometries) geometry.dispose();
      for (const material of ownedMaterials) material.dispose();
    }
  }

  private shouldUseLightAssets(): boolean {
    const params = new URLSearchParams(window.location.search);
    return params.has('lite') || window.location.hostname.endsWith('.loca.lt');
  }

  private renderOnce(): void {
    this.net.update(0);
    const snapshot = this.net.getSnapshot();
    const playerState = snapshot.entities.find((e) => e.id === this.net.playerId);
    this.lastSnapshotTick = snapshot.tick;
    this.syncZone(snapshot.zone);
    this.reconcile(snapshot.entities, 0, true);
    this.syncCombatEvents(snapshot.combatEvents);
    this.reconcileLoot(snapshot.loot);
    this.reconcileChests(snapshot.chests);
    this.syncEquipment(snapshot.equippedWeapon);
    this.updateLootViews();
    this.updateZombieAnimations(0);
    this.updateCameraAndMarker(0);
    this.updatePlayerModel(playerState, 0);
    this.updateDamageTexts(0);
    this.updateHitEffects(0);
    this.updateBossSlamEffects(0);
    this.updateSkillEffects(0);
    this.hud.update(snapshot, playerState, this.selectedEnemy(snapshot.entities));
    this.hudDirty = false;
    this.world.render(this.rig.camera);
  }

  private readonly frame = (now: number): void => {
    const frameMs = now - this.lastTime;
    const dt = Math.min(frameMs / 1000, 0.05);
    const qualityDt = frameMs / 1000;
    this.lastTime = now;
    this.elapsed += dt;

    this.processInput(dt);
    this.updateAutoQuality(qualityDt);
    this.net.update(dt);
    const snapshot = this.net.getSnapshot();
    const playerState = snapshot.entities.find((e) => e.id === this.net.playerId);
    const snapshotChanged = snapshot.tick !== this.lastSnapshotTick;

    if (snapshotChanged) {
      this.lastSnapshotTick = snapshot.tick;
      this.syncZone(snapshot.zone);
      this.syncCombatEvents(snapshot.combatEvents);
      this.reconcileLoot(snapshot.loot);
      this.reconcileChests(snapshot.chests);
      this.syncEquipment(snapshot.equippedWeapon);
    }
    this.reconcile(snapshot.entities, dt, snapshotChanged);
    this.applyLocalPlayerMovement(dt);
    this.updateLootViews();
    this.updateCameraAndMarker(dt);
    this.updatePlayerModel(playerState, dt);
    this.updateZombieAnimations(dt);
    this.updateDamageTexts(dt);
    this.updateHitEffects(dt);
    this.updateBossSlamEffects(dt);
    this.updateSkillEffects(dt);
    if (snapshotChanged || this.hudDirty) {
      this.hud.update(snapshot, playerState, this.selectedEnemy(snapshot.entities));
      this.hudDirty = false;
    }
    this.world.render(this.rig.camera);
    this.handleFrameStallQuality(frameMs);
    this.logFrameStall(frameMs, snapshot);
    this.perf.update(frameMs, this.world.renderer.info, this.renderQualityMode === 'auto' ? 'auto:' + this.autoQualityLevel : this.renderQualityMode);

    requestAnimationFrame(this.frame);
  };

  private logFrameStall(frameMs: number, snapshot: { tick: number; entities: readonly EntityState[] }): void {
    if (frameMs < FRAME_STALL_WARN_MS) return;
    const now = performance.now();
    if (now - this.lastFrameStallLog < FRAME_STALL_LOG_COOLDOWN_MS) return;
    this.lastFrameStallLog = now;
    const info = this.world.renderer.info;
    console.warn(
      `[Game] frame lento ${frameMs.toFixed(0)}ms tick=${snapshot.tick} entities=${snapshot.entities.length} `
      + `damageTexts=${this.damageTexts.length} hitEffects=${this.hitEffects.length} skillEffects=${this.skillEffects.length} `
      + `bossEffects=${this.bossSlamEffects.length} drawCalls=${info.render.calls} triangles=${info.render.triangles}`,
    );
  }

  private selectedEnemy(entities: readonly EntityState[]): EntityState | undefined {
    if (!this.selectedEnemyId) return undefined;
    const enemy = entities.find((entity) => entity.id === this.selectedEnemyId && entity.kind === 'enemy' && entity.alive);
    if (!enemy) this.setSelectedEnemy(null);
    return enemy;
  }

  private setSelectedEnemy(id: string | null): void {
    if (id === this.selectedEnemyId) return;
    this.selectedEnemyId = id;
    this.hudDirty = true;
  }

  private readRenderQualityMode(): RenderQualityMode {
    const params = new URLSearchParams(window.location.search);
    const quality = params.get('quality');
    if (this.isRenderQualityMode(quality)) return quality;
    if (params.has('lite')) return 'low';

    try {
      const stored = window.localStorage.getItem(RENDER_QUALITY_STORAGE_KEY);
      if (this.isRenderQualityMode(stored)) return stored;
    } catch {
      // Sem storage, cai no modo automatico.
    }
    return 'auto';
  }

  private isRenderQualityMode(value: unknown): value is RenderQualityMode {
    return typeof value === 'string' && RENDER_QUALITY_MODES.includes(value as RenderQualityMode);
  }

  private initialAutoQualityLevel(): RenderQualityLevel {
    const cores = navigator.hardwareConcurrency ?? 8;
    if (window.devicePixelRatio >= 2 || cores <= 4) return 'low';
    return 'medium';
  }

  private cycleRenderQualityMode(): void {
    const index = RENDER_QUALITY_MODES.indexOf(this.renderQualityMode);
    this.renderQualityMode = RENDER_QUALITY_MODES[(index + 1) % RENDER_QUALITY_MODES.length];
    this.qualitySampleFrames = 0;
    this.qualitySampleSeconds = 0;
    this.qualityCooldown = AUTO_QUALITY_COOLDOWN_SECONDS;
    this.persistRenderQualityMode();
    this.applyRenderQuality();
  }

  private persistRenderQualityMode(): void {
    try {
      window.localStorage.setItem(RENDER_QUALITY_STORAGE_KEY, this.renderQualityMode);
    } catch {
      // Preferencia opcional; render continua normalmente sem persistencia.
    }
  }

  private updateAutoQuality(dt: number): void {
    if (this.renderQualityMode !== 'auto' || dt <= 0) return;
    this.qualityCooldown = Math.max(0, this.qualityCooldown - dt);
    this.qualitySampleSeconds += dt;
    this.qualitySampleFrames++;
    if (this.qualitySampleSeconds < AUTO_QUALITY_SAMPLE_SECONDS) return;

    const fps = this.qualitySampleFrames / this.qualitySampleSeconds;
    this.qualitySampleSeconds = 0;
    this.qualitySampleFrames = 0;
    if (this.qualityCooldown > 0) return;

    const previous = this.autoQualityLevel;
    if (fps < AUTO_QUALITY_DOWNGRADE_FPS) {
      this.autoQualityLevel = this.lowerQualityLevel(this.autoQualityLevel);
    } else if (fps > AUTO_QUALITY_UPGRADE_FPS) {
      this.autoQualityLevel = this.raiseQualityLevel(this.autoQualityLevel);
    }
    if (previous === this.autoQualityLevel) return;

    this.qualityCooldown = AUTO_QUALITY_COOLDOWN_SECONDS;
    this.applyRenderQuality();
  }

  private handleFrameStallQuality(frameMs: number): void {
    if (this.renderQualityMode !== 'auto' || frameMs < FRAME_STALL_WARN_MS) return;
    const previous = this.autoQualityLevel;
    this.autoQualityLevel = frameMs >= FRAME_STALL_SEVERE_MS
      ? 'low'
      : this.lowerQualityLevel(this.autoQualityLevel);
    if (this.autoQualityLevel === previous) return;

    this.qualitySampleSeconds = 0;
    this.qualitySampleFrames = 0;
    this.qualityCooldown = AUTO_QUALITY_COOLDOWN_SECONDS;
    console.info(`[Game] auto-quality reduziu para ${this.autoQualityLevel} apos frame de ${frameMs.toFixed(0)}ms`);
    this.applyRenderQuality();
  }

  private lowerQualityLevel(level: RenderQualityLevel): RenderQualityLevel {
    if (level === 'high') return 'medium';
    if (level === 'medium') return 'low';
    return 'low';
  }

  private raiseQualityLevel(level: RenderQualityLevel): RenderQualityLevel {
    if (level === 'low') return 'medium';
    if (level === 'medium') return 'high';
    return 'high';
  }

  private effectiveRenderQualityLevel(): RenderQualityLevel {
    return this.renderQualityMode === 'auto' ? this.autoQualityLevel : this.renderQualityMode;
  }

  private applyRenderQuality(): void {
    const level = this.effectiveRenderQualityLevel();
    this.world.setRenderQuality(RENDER_QUALITY_PRESETS[level]);
    this.hud.setRenderQuality(this.renderQualityMode, level);
  }

  private processInput(dt: number): void {
    const menuRequested = this.input.takeInventoryToggle() || this.input.takeCharacterToggle();
    if (menuRequested) {
      this.sfx.play('ui');
      this.hud.toggleMenu();
    }

    if (this.input.takeSfxMuteToggle()) this.sfx.toggleMuted();
    if (this.input.takeQualityToggle()) {
      this.sfx.play('ui');
      this.cycleRenderQualityMode();
    }

    const zoom = this.input.takeZoom();
    if (zoom !== 0) this.rig.zoom(zoom);

    if (this.input.takeJump()) {
      this.sfx.unlock();
      this.net.send({ type: 'jump', entityId: this.net.playerId });
    }
    if (this.input.takeUsePotion()) {
      this.sfx.play('potion');
      this.net.send({ type: 'use-item', entityId: this.net.playerId, item: 'potion' });
    }
    if (this.input.takeUseManaPotion()) {
      this.sfx.play('potion');
      this.net.send({ type: 'use-item', entityId: this.net.playerId, item: 'mana_potion' });
    }
    if (this.input.takeArcaneNova()) {
      this.sfx.unlock();
      this.net.send({ type: 'cast-skill', entityId: this.net.playerId, skill: 'arcane-nova' });
    }

    this.processKeyboardMove(dt);

    for (const ndc of this.input.takeClicks()) this.handleClick(ndc);
  }

  private processKeyboardMove(dt: number): void {
    const movementChanged = this.input.takeMovementChanged();
    const axes = this.input.getMoveAxes();
    const player = this.views.get(this.net.playerId)?.group.position ?? this.latestEntities.get(this.net.playerId)?.position;
    const direction = this.rig.getMoveDirection(axes.strafe, axes.forward);
    const decision = this.keyboardMove.update({
      dt,
      movementChanged,
      axes,
      running: this.input.running,
      player,
      direction,
    });
    if (decision.type === 'none') return;
    this.net.send({
      type: 'move',
      entityId: this.net.playerId,
      target: decision.target,
      run: decision.run,
    });
  }

  private applyLocalPlayerMovement(dt: number): void {
    this.localPlayerMoving = false;
    this.localPlayerRunning = false;

    const view = this.views.get(this.net.playerId);
    const state = this.latestEntities.get(this.net.playerId);
    if (!view || (state && !state.alive)) return;

    const axes = this.input.getMoveAxes();
    const direction = this.rig.getMoveDirection(axes.strafe, axes.forward);
    const prediction = this.clientMovement.predict({
      dt,
      axes,
      running: this.input.running,
      direction,
      current: view.group.position,
      terrain: this.terrain,
      zone: this.zone,
    });
    if (!prediction) return;

    view.group.position.set(prediction.position.x, prediction.position.y, prediction.position.z);
    view.group.rotation.y = prediction.rotationY;
    this.localPlayerMoving = true;
    this.localPlayerRunning = prediction.running;
  }

  private handleClick(ndc: THREE.Vector2): void {
    this.sfx.unlock();
    this.raycaster.setFromCamera(ndc, this.rig.camera);

    const portal = this.zone === 'overworld' ? this.world.getDungeonPortal() : this.world.getDungeonExit();
    if (portal && this.raycaster.intersectObject(portal, true).length > 0) {
      this.setSelectedEnemy(null);
      this.sfx.play('arcane-nova');
      this.net.send({
        type: this.zone === 'overworld' ? 'enter-dungeon' : 'leave-dungeon',
        entityId: this.net.playerId,
      });
      return;
    }

    const chestHits = this.raycaster.intersectObjects(this.chestMeshes, true);
    if (chestHits.length > 0) {
      const id = this.findUserDataId(chestHits[0].object, 'chestId');
      const chest = id ? this.chestViews.get(id) : undefined;
      if (id && chest && !chest.opened) {
        this.setSelectedEnemy(null);
        this.sfx.play('chest');
        this.net.send({ type: 'open-chest', entityId: this.net.playerId, chestId: id });
        return;
      }
    }

    const lootHits = this.raycaster.intersectObjects(this.lootMeshes, true);
    if (lootHits.length > 0) {
      const id = this.findUserDataId(lootHits[0].object, 'lootId');
      if (id) {
        this.setSelectedEnemy(null);
        this.sfx.play('pickup');
        this.net.send({ type: 'collect', entityId: this.net.playerId, lootId: id });
        return;
      }
    }

    const enemyHits = this.raycaster.intersectObjects(this.enemyMeshes, true);
    if (enemyHits.length > 0) {
      const id = this.findUserDataId(enemyHits[0].object, 'entityId');
      if (id) {
        this.setSelectedEnemy(id);
        this.net.send({ type: 'attack', entityId: this.net.playerId, targetId: id });
        return;
      }
    }

    const groundHits = this.raycaster.intersectObject(this.world.getGroundMesh(), false);
    if (groundHits.length > 0) {
      const p = groundHits[0].point;
      const closeLoot = this.findLootNear(p);
      if (closeLoot) {
        this.setSelectedEnemy(null);
        this.sfx.play('pickup');
        this.net.send({ type: 'collect', entityId: this.net.playerId, lootId: closeLoot });
        return;
      }
      // Quando o inimigo ocupa o mesmo espaço do herói, o raycast pode cair no
      // chão. Um clique próximo ainda escolhe o zumbi mais próximo para combate.
      const closeTarget = this.findCloseEnemy();
      const player = this.views.get(this.net.playerId)?.group.position;
      if (closeTarget && player && Math.hypot(p.x - player.x, p.z - player.z) <= CLOSE_CLICK_RADIUS) {
        this.setSelectedEnemy(closeTarget);
        this.net.send({ type: 'attack', entityId: this.net.playerId, targetId: closeTarget });
        return;
      }
      this.setSelectedEnemy(null);
      this.net.send({
        type: 'move',
        entityId: this.net.playerId,
        target: { x: p.x, y: 0, z: p.z },
        run: this.input.running,
      });
      this.showMarker(p.x, p.y, p.z);
    }
  }

  private findUserDataId(object: THREE.Object3D | null, key: 'entityId' | 'lootId' | 'chestId'): string | null {
    let o: THREE.Object3D | null = object;
    while (o) {
      const id = o.userData?.[key];
      if (typeof id === 'string') return id;
      o = o.parent;
    }
    return null;
  }

  private reconcile(entities: EntityState[], dt: number, snapshotChanged = true): void {
    const seen = new Set<string>();
    this.latestEntities.clear();

    for (const e of entities) {
      seen.add(e.id);
      this.latestEntities.set(e.id, e);
      const view = this.views.get(e.id) ?? this.createView(e);
      const visualScale = this.entityVisualScale(e);
      view.group.scale.setScalar(visualScale);

      if (e.kind === 'enemy') this.enemyHp.set(e.id, e.hp);

      // Com o GLB do herói carregado, a cápsula de fallback nunca deve voltar
      // a ficar visível entre dois snapshots de simulação.
      view.group.visible = e.kind === 'player'
        ? e.alive && (e.id !== this.net.playerId || !this.playerModel)
        : e.alive || e.action === 'dead';
      const isLocalPlayer = e.id === this.net.playerId;
      if (!view.initialized || dt === 0) {
        view.group.position.set(e.position.x, e.position.y, e.position.z);
        view.group.rotation.y = e.rotationY;
        view.initialized = true;
      } else if (isLocalPlayer && !snapshotChanged) {
        // A pose local prevista no frame anterior continua valendo ate chegar um snapshot novo.
      } else {
        // A simulação envia poses a 30 Hz. Interpolar no render elimina a
        // sensação de "motion blur"/saltos sem alterar a lógica autoritativa.
        this.reconcileTarget.set(e.position.x, e.position.y, e.position.z);
        const correctionDistance = view.group.position.distanceTo(this.reconcileTarget);
        const localKeyboardActive = isLocalPlayer && this.isKeyboardMovementActive();
        const rate = localKeyboardActive
          ? LOCAL_PLAYER_CORRECTION_RATE
          : REMOTE_RECONCILE_RATE;
        const alpha = 1 - Math.exp(-rate * dt);
        if (isLocalPlayer && correctionDistance > LOCAL_PLAYER_SNAP_CORRECTION_DISTANCE) {
          view.group.position.copy(this.reconcileTarget);
        } else if (localKeyboardActive && correctionDistance <= LOCAL_PLAYER_IGNORE_CORRECTION_DISTANCE) {
          // A predicao local ja esta perto da simulacao; corrigir aqui causa tremidinha visual.
        } else {
          view.group.position.lerp(this.reconcileTarget, alpha);
        }
        if (!localKeyboardActive) {
          const delta = Math.atan2(
            Math.sin(e.rotationY - view.group.rotation.y),
            Math.cos(e.rotationY - view.group.rotation.y),
          );
          view.group.rotation.y += delta * alpha;
        }
      }
      view.zombie?.setState(e.action);

      if (view.healthBar) {
        view.healthBar.setHealth(e.hp, e.maxHp, e.level, e.kind === 'player' ? e.name : '');
        view.healthBar.setWorldPosition(
          view.group.position.x,
          view.group.position.y + ENEMY_HEALTH_BAR_HEIGHT * visualScale,
          view.group.position.z,
        );
        view.healthBar.faceCamera(this.rig.camera);
        view.healthBar.group.visible = e.alive;
      }

      if (e.kind === 'player' && e.id !== this.net.playerId) {
        this.ensureRemoteHero(view, e);
        this.updateRemoteHero(view, e, dt);
      }
    }

    for (const [id, view] of this.views) {
      if (seen.has(id)) continue;
      this.world.scene.remove(view.group);
      if (view.healthBar) this.world.scene.remove(view.healthBar.group);
      this.views.delete(id);
      this.enemyHp.delete(id);
      const idx = this.enemyMeshes.indexOf(view.group);
      if (idx >= 0) this.enemyMeshes.splice(idx, 1);
    }
  }

  private isKeyboardMovementActive(): boolean {
    const axes = this.input.getMoveAxes();
    return axes.strafe !== 0 || axes.forward !== 0;
  }

  private syncCombatEvents(events: readonly CombatEvent[]): void {
    for (const event of events) {
      if (this.seenCombatEvents.has(event.id)) continue;
      this.seenCombatEvents.add(event.id);
      if (event.type === 'skill-effect') {
        if (event.skill === 'arcane-nova') {
          this.sfx.play('arcane-nova');
          this.showArcaneNova(event.position, event.radius);
        }
        continue;
      }
      if (event.type === 'boss-slam-warning') {
        this.showBossSlamWarning(event.position, event.radius, event.delay);
        continue;
      }
      if (event.type === 'boss-slam-impact') {
        this.sfx.play('boss-slam');
        this.showBossSlamImpact(event.position, event.radius);
        continue;
      }
      const target = this.latestEntities.get(event.targetId);
      if (event.type === 'miss') {
        this.sfx.play('miss');
        this.showCombatText('ERROU', event.position, 'miss');
        continue;
      }
      if (target?.kind === 'player') {
        this.sfx.play(event.damageKind === 'magic' ? 'hit-magic' : 'hit-physical');
        this.showHitImpact(event.position, event.damageKind);
        if (target.id === this.net.playerId) {
          this.showCombatText(event.amount, event.position, 'incoming');
          this.rig.addShake(Math.min(0.42, 0.16 + event.amount / 90));
        } else {
          this.showDamageText(event.amount, event.position, event.damageKind);
        }
        continue;
      }
      if (target?.kind !== 'enemy') continue;
      this.sfx.play(event.damageKind === 'magic' ? 'hit-magic' : 'hit-physical');
      this.showHitImpact(event.position, event.damageKind);
      this.showDamageText(event.amount, event.position, event.damageKind);
    }

    if (this.seenCombatEvents.size > 500) {
      let removed = 0;
      for (const id of this.seenCombatEvents) {
        this.seenCombatEvents.delete(id);
        removed++;
        if (removed >= 120) break;
      }
    }
  }

  private showDamageText(amount: number, position: { x: number; y: number; z: number }, damageKind: DamageKind): void {
    this.showCombatText(amount, position, damageKind);
  }

  private showHitImpact(position: { x: number; y: number; z: number }, damageKind: DamageKind): void {
    if (this.hitEffects.length > 28) {
      const oldest = this.hitEffects.shift();
      oldest?.dispose();
    }
    const effect = new HitImpactEffect(
      new THREE.Vector3(position.x, position.y, position.z),
      damageKind,
      this.damageTextSerial,
    );
    this.hitEffects.push(effect);
    this.world.scene.add(effect.group);
  }

  private showCombatText(text: number | string, position: { x: number; y: number; z: number }, textKind: CombatTextKind): void {
    if (typeof text === 'number' && text <= 0) return;
    if (this.damageTexts.length >= MAX_FLOATING_COMBAT_TEXTS) {
      const oldest = this.damageTexts.shift();
      oldest?.dispose();
    }
    const verticalOffset = textKind === 'magic'
      ? 3.18
      : textKind === 'miss'
        ? 2.95
        : textKind === 'incoming'
          ? 3.05
          : 2.75;
    const effect = new FloatingDamageText(
      text,
      new THREE.Vector3(position.x, position.y + verticalOffset, position.z),
      this.damageTextSerial++,
      textKind,
    );
    this.damageTexts.push(effect);
    this.world.scene.add(effect.sprite);
  }

  private showArcaneNova(position: { x: number; y: number; z: number }, radius: number): void {
    const effect = new ArcaneNovaEffect(new THREE.Vector3(position.x, position.y, position.z), radius);
    this.skillEffects.push(effect);
    this.world.scene.add(effect.group);
  }

  private showBossSlamWarning(position: { x: number; y: number; z: number }, radius: number, delay: number): void {
    const effect = new BossSlamEffect(new THREE.Vector3(position.x, position.y, position.z), radius, 'warning', delay);
    this.bossSlamEffects.push(effect);
    this.world.scene.add(effect.group);
  }

  private showBossSlamImpact(position: { x: number; y: number; z: number }, radius: number): void {
    const effect = new BossSlamEffect(new THREE.Vector3(position.x, position.y, position.z), radius, 'impact', 0.46);
    this.bossSlamEffects.push(effect);
    this.world.scene.add(effect.group);
    this.rig.addShake(0.72);
    this.showHitImpact(position, 'physical');
  }

  private updateDamageTexts(dt: number): void {
    for (let index = this.damageTexts.length - 1; index >= 0; index--) {
      const effect = this.damageTexts[index];
      if (!effect.update(dt)) continue;
      effect.dispose();
      this.damageTexts.splice(index, 1);
    }
  }

  private updateHitEffects(dt: number): void {
    for (let index = this.hitEffects.length - 1; index >= 0; index--) {
      const effect = this.hitEffects[index];
      if (!effect.update(dt)) continue;
      effect.dispose();
      this.hitEffects.splice(index, 1);
    }
  }

  private updateBossSlamEffects(dt: number): void {
    for (let index = this.bossSlamEffects.length - 1; index >= 0; index--) {
      const effect = this.bossSlamEffects[index];
      if (!effect.update(dt)) continue;
      effect.dispose();
      this.bossSlamEffects.splice(index, 1);
    }
  }

  private updateSkillEffects(dt: number): void {
    for (let index = this.skillEffects.length - 1; index >= 0; index--) {
      const effect = this.skillEffects[index];
      if (!effect.update(dt)) continue;
      effect.dispose();
      this.skillEffects.splice(index, 1);
    }
  }

  private createView(e: EntityState): View {
    let view: View;

    if (e.kind === 'player') {
      const local = e.id === this.net.playerId;
      const healthBar = local ? undefined : new HealthBar3D();
      if (healthBar) this.world.scene.add(healthBar.group);
      const group = new THREE.Group();
      group.add(createCharacter(local ? 0x3b82f6 : 0x2f9f68, 0xf2c79b));
      view = { group, healthBar, kind: 'player' };
    } else {
      const group = new THREE.Group();
      group.add(createCharacter(0xb33a3a, 0x7a2222));
      const healthBar = new HealthBar3D();
      this.world.scene.add(healthBar.group);
      this.enemyMeshes.push(group);
      view = { group, healthBar, kind: 'enemy' };
      this.attachZombie(view);
    }

    view.group.userData.entityId = e.id;
    this.world.scene.add(view.group);
    this.views.set(e.id, view);
    return view;
  }

  private entityVisualScale(entity: EntityState): number {
    return entity.kind === 'enemy' ? entity.scale ?? 1 : 1;
  }

  private ensureRemoteHero(view: View, entity: EntityState): void {
    if (view.kind !== 'player' || entity.id === this.net.playerId || this.useLightAssets) return;
    const modelUrl = entity.modelUrl || HERO_MODEL_URL;
    if (view.hero && view.heroModelUrl === modelUrl) return;
    if (view.heroLoading && view.heroModelUrl === modelUrl) return;
    if (view.heroFailedUrl === modelUrl) return;

    view.heroLoading = true;
    view.heroModelUrl = modelUrl;
    const hero = new CharacterModel();
    void hero.load(modelUrl, HERO_SCALE).then(() => {
      if (view.heroModelUrl !== modelUrl) return;
      view.group.clear();
      view.group.add(hero.root);
      view.hero = hero;
      view.equippedWeaponKey = undefined;
      view.heroLoading = false;
    }).catch((error) => {
      view.heroLoading = false;
      view.heroFailedUrl = modelUrl;
      console.warn('[Game] falha ao carregar personagem remoto:', error);
    });
  }

  private updateRemoteHero(view: View, entity: EntityState, dt: number): void {
    const hero = view.hero;
    if (!hero) return;

    const jumping = !!entity.jumping;
    if (jumping && !view.wasJumping) view.jumpArc = 0;
    if (jumping) view.jumpArc = Math.min((view.jumpArc ?? 0) + dt, JUMP_TIME);
    view.wasJumping = jumping;
    const jumpArc = view.jumpArc ?? 0;
    const yOffset = jumping ? Math.sin(Math.PI * (jumpArc / JUMP_TIME)) * JUMP_HEIGHT : 0;

    hero.root.position.y = yOffset;
    hero.root.rotation.y = HERO_FACING_OFFSET;
    hero.root.visible = entity.alive;
    hero.setAttackSpeed(entity.attackSpeed ?? 1);
    this.syncRemoteEquipment(view, entity.equippedWeapon ?? null);
    hero.setState(this.heroStateFor(entity, jumping));
    hero.update(dt);
  }

  private attachZombie(view: View): void {
    if (view.kind !== 'enemy' || view.zombie) return;
    const zombie = this.zombies.create();
    if (!zombie) return;
    view.group.clear();
    view.group.add(zombie.root);
    view.zombie = zombie;
  }

  private updateZombieAnimations(dt: number): void {
    // Frustum da câmera (1x por frame) para não desenhar nem animar inimigos
    // fora de tela. Aqui só DESLIGAMOS a visibilidade; quem liga é o reconcile,
    // que conhece vivo/morto. As malhas seguem com frustumCulled=false, então
    // quando o grupo está visível não há pop-out de skinned mesh.
    const camera = this.rig.camera;
    let frustumReady = false;
    if (dt > 0) {
      camera.updateMatrixWorld();
      camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
      this.cullViewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      this.cullFrustum.setFromProjectionMatrix(this.cullViewProjection);
      frustumReady = true;
    }
    const focus = this.views.get(this.net.playerId)?.group.position;

    for (const [id, view] of this.views) {
      if (view.kind === 'enemy' && !view.zombie && this.zombies.ready) this.attachZombie(view);
      const zombie = view.zombie;
      if (!zombie || id === this.net.playerId) continue;

      let near = true;
      let far = false;
      if (focus) {
        const d = Math.hypot(view.group.position.x - focus.x, view.group.position.z - focus.z);
        if (d > ENEMY_CULL_MAX_DISTANCE) {
          view.group.visible = false;
          continue;
        }
        near = d < ENEMY_ANIM_NEAR_DISTANCE;
        far = d > ENEMY_ANIM_FAR_DISTANCE;
      }

      if (frustumReady && view.group.visible) {
        const scale = Math.max(1, view.group.scale.x);
        this.cullSphere.center.set(
          view.group.position.x,
          view.group.position.y + ENEMY_CULL_CENTER_Y * scale,
          view.group.position.z,
        );
        this.cullSphere.radius = ENEMY_CULL_RADIUS * scale;
        if (!this.cullFrustum.intersectsSphere(this.cullSphere)) view.group.visible = false;
      }

      // Invisível (fora de tela ou morto pelo reconcile): não gasta CPU animando.
      if (!view.group.visible) continue;

      if (near || !frustumReady) {
        zombie.update(dt);
        view.animAccum = 0;
      } else {
        const interval = far ? ENEMY_ANIM_FAR_INTERVAL : ENEMY_ANIM_MID_INTERVAL;
        view.animAccum = (view.animAccum ?? 0) + dt;
        if (view.animAccum >= interval) {
          zombie.update(view.animAccum);
          view.animAccum = 0;
        }
      }
    }
  }

  private findCloseEnemy(): string | null {
    const player = this.views.get(this.net.playerId)?.group.position;
    if (!player) return null;
    let id: string | null = null;
    let best = CLOSE_TARGET_RADIUS;
    for (const entity of this.latestEntities.values()) {
      if (entity.kind !== 'enemy' || !entity.alive) continue;
      const distance = Math.hypot(entity.position.x - player.x, entity.position.z - player.z);
      if (distance < best) {
        best = distance;
        id = entity.id;
      }
    }
    return id;
  }

  private findLootNear(point: THREE.Vector3): string | null {
    let id: string | null = null;
    let best = LOOT_CLICK_RADIUS;
    for (const [lootId, view] of this.lootViews) {
      const distance = Math.hypot(view.group.position.x - point.x, view.group.position.z - point.z);
      if (distance < best) {
        best = distance;
        id = lootId;
      }
    }
    return id;
  }

  private syncEquipment(weapon: EquippedWeaponVisualState | null): void {
    const visibleWeapon = this.forceWeaponGlowPreview
      ? {
        kind: 'sword',
        rarity: 'lendario',
        upgradeLevel: EQUIPPED_SWORD_TEST_ENHANCEMENT,
        glowGem: 'soul',
        element: 'fire',
      } satisfies EquippedWeaponVisualState
      : weapon;
    const key = this.equippedWeaponKeyFor(visibleWeapon);
    if (key === this.equippedWeaponKey) return;
    this.equippedWeaponKey = key;
    if (!this.playerModel) return;
    if (visibleWeapon?.kind === 'sword') {
      const glowColor = glowColorForGem(visibleWeapon.glowGem);
      void this.playerModel.equipWeapon(EQUIPPED_SWORD_MODEL_URL, {
        enhancementLevel: visibleWeapon.upgradeLevel,
        color: glowColor,
        flameColor: visibleWeapon.element === 'fire' ? 0xff4f12 : undefined,
        rarity: visibleWeapon.rarity,
      });
    }
    else this.playerModel.unequipWeapon();
  }

  private syncRemoteEquipment(view: View, weapon: EquippedWeaponVisualState | null): void {
    const key = this.equippedWeaponKeyFor(weapon);
    if (key === view.equippedWeaponKey) return;
    view.equippedWeaponKey = key;

    const model = view.hero;
    if (!model) return;
    if (weapon?.kind === 'sword') {
      const glowColor = glowColorForGem(weapon.glowGem);
      void model.equipWeapon(EQUIPPED_SWORD_MODEL_URL, {
        enhancementLevel: weapon.upgradeLevel,
        color: glowColor,
        flameColor: weapon.element === 'fire' ? 0xff4f12 : undefined,
        rarity: weapon.rarity,
      });
    } else {
      model.unequipWeapon();
    }
  }

  private equippedWeaponKeyFor(weapon: EquippedWeaponVisualState | null | undefined): string | null {
    return weapon
      ? `${weapon.kind}:${weapon.rarity}:${weapon.upgradeLevel}:${weapon.glowGem ?? ''}:${weapon.element ?? ''}`
      : null;
  }

  private lootLabelColor(item: LootState): string {
    if (item.rarity) return RARITY_COLORS[item.rarity];
    if (item.glowGem) return glowColorForGem(item.glowGem);
    return '#f0dfb2';
  }

  private lootFallbackMaterial(item: LootState): THREE.MeshStandardMaterial {
    const color = item.kind === 'sword'
      ? '#f0c64b'
      : item.kind === 'mana_potion'
        ? '#4b9bff'
      : item.kind === 'potion'
        ? '#d74b57'
        : item.glowGem
          ? glowColorForGem(item.glowGem)
          : '#f7dc69';
    const labelColor = this.lootLabelColor(item);
    const key = `${color}:${item.rarity ?? ''}:${item.glowGem ?? ''}`;
    let material = lootFallbackMaterials.get(key);
    if (!material) {
      material = new THREE.MeshStandardMaterial({
        color,
        emissive: item.rarity || item.glowGem ? new THREE.Color(labelColor).multiplyScalar(0.22) : 0x221108,
      });
      lootFallbackMaterials.set(key, material);
    }
    return material;
  }

  private queueLootLabel(id: string): void {
    const view = this.lootViews.get(id);
    if (!view || view.label || view.labelQueued) return;
    view.labelQueued = true;
    window.requestAnimationFrame(() => {
      const current = this.lootViews.get(id);
      if (!current || current.label) return;
      const label = new LootLabel3D(current.labelText, current.labelColor);
      current.label = label;
      this.world.scene.add(label.sprite);
    });
  }

  private reconcileLoot(loot: LootState[]): void {
    const seen = new Set<string>();
    for (const item of loot) {
      seen.add(item.id);
      let view = this.lootViews.get(item.id);
      if (!view) {
        const group = new THREE.Group();
        group.userData.lootId = item.id;
        const fallback = new THREE.Mesh(
          LOOT_FALLBACK_GEOMETRY,
          this.lootFallbackMaterial(item),
        );
        fallback.position.y = 0.3;
        fallback.castShadow = true;
        group.add(fallback);
        const clickArea = new THREE.Mesh(
          LOOT_CLICK_GEOMETRY,
          LOOT_CLICK_MATERIAL,
        );
        clickArea.name = 'loot-click-area';
        clickArea.position.y = 0.42;
        clickArea.userData.lootId = item.id;
        clickArea.userData.persistentClickArea = true;
        group.add(clickArea);
        this.world.scene.add(group);
        this.lootMeshes.push(group);
        view = {
          group,
          labelColor: this.lootLabelColor(item),
          labelQueued: false,
          labelText: item.name,
          baseY: item.position.y,
          phase: this.lootViews.size * 0.9,
        };
        this.lootViews.set(item.id, view);
        this.queueLootLabel(item.id);
        void this.lootModels.replacePlaceholder(group, item);
      }
      view.baseY = item.position.y;
      view.group.position.x = item.position.x;
      view.group.position.z = item.position.z;
    }

    for (const [id, view] of this.lootViews) {
      if (seen.has(id)) continue;
      this.world.scene.remove(view.group);
      view.label?.dispose();
      this.lootViews.delete(id);
      const index = this.lootMeshes.indexOf(view.group);
      if (index >= 0) this.lootMeshes.splice(index, 1);
    }
  }

  private updateLootViews(): void {
    for (const view of this.lootViews.values()) {
      view.group.position.y = view.baseY + 0.16 + Math.sin(this.elapsed * 3 + view.phase) * 0.1;
      view.group.rotation.y = this.elapsed * 1.7 + view.phase;
      if (view.label) {
        view.label.setWorldPosition(view.group.position.x, view.group.position.y + 0.98, view.group.position.z);
        view.label.faceCamera(this.rig.camera);
      }
    }
  }

  private reconcileChests(chests: ChestState[]): void {
    const seen = new Set<string>();
    for (const chest of chests) {
      seen.add(chest.id);
      let view = this.chestViews.get(chest.id);
      if (!view) {
        const group = new THREE.Group();
        group.userData.chestId = chest.id;
        const fallback = new THREE.Mesh(CHEST_FALLBACK_GEOMETRY, CHEST_FALLBACK_MATERIAL);
        fallback.position.y = 0.43;
        fallback.castShadow = true;
        fallback.receiveShadow = true;
        group.add(fallback);

        const clickArea = new THREE.Mesh(CHEST_CLICK_GEOMETRY, CHEST_CLICK_MATERIAL);
        clickArea.name = 'chest-click-area';
        clickArea.position.y = 0.74;
        clickArea.userData.chestId = chest.id;
        clickArea.userData.persistentClickArea = true;
        group.add(clickArea);

        this.world.scene.add(group);
        this.chestMeshes.push(group);
        view = { group, opened: chest.opened };
        this.chestViews.set(chest.id, view);
        void this.chestModels.replaceModel(group, chest.opened);
      } else if (view.opened !== chest.opened) {
        view.opened = chest.opened;
        void this.chestModels.replaceModel(view.group, chest.opened);
      }

      view.group.position.set(chest.position.x, chest.position.y, chest.position.z);
      view.group.rotation.y = chest.id.endsWith('east')
        ? -Math.PI * 0.72
        : chest.id.endsWith('west')
          ? Math.PI * 0.72
          : 0;
      view.group.scale.setScalar(chest.opened ? 1.03 : 1);
    }

    for (const [id, view] of this.chestViews) {
      if (seen.has(id)) continue;
      this.world.scene.remove(view.group);
      this.chestViews.delete(id);
      const index = this.chestMeshes.indexOf(view.group);
      if (index >= 0) this.chestMeshes.splice(index, 1);
    }
  }

  // Dirige o modelo 3D do heroi (posicao, rotacao, arco do pulo e animacao).
  private updatePlayerModel(player: EntityState | undefined, dt: number): void {
    const model = this.playerModel;
    if (!model || !player) return;

    // esconde a capsula de fallback assim que o modelo esta pronto
    const view = this.views.get(this.net.playerId);
    if (view) view.group.visible = false;

    // arco vertical do pulo (a simulacao ja moveu o personagem para a frente)
    const jumping = !!player.jumping;
    if (jumping && !this.wasJumping) this.jumpArc = 0;
    if (jumping) this.jumpArc = Math.min(this.jumpArc + dt, JUMP_TIME);
    this.wasJumping = jumping;
    const yOffset = jumping ? Math.sin(Math.PI * (this.jumpArc / JUMP_TIME)) * JUMP_HEIGHT : 0;

    const renderPose = view?.group;
    model.root.position.set(
      renderPose?.position.x ?? player.position.x,
      (renderPose?.position.y ?? player.position.y) + yOffset,
      renderPose?.position.z ?? player.position.z,
    );
    model.root.rotation.y = (renderPose?.rotation.y ?? player.rotationY) + HERO_FACING_OFFSET;
    model.root.visible = true;
    model.setAttackSpeed(player.attackSpeed ?? 1);

    const state = this.localPlayerMoving && !jumping && player.alive && player.action !== 'attack'
      ? this.localPlayerRunning ? 'run' : 'move'
      : this.heroStateFor(player, jumping);
    model.setState(state);
    model.update(dt);
  }

  private heroStateFor(entity: EntityState, jumping: boolean): HeroState {
    if (!entity.alive) return 'dead';
    if (jumping) return 'jump';
    if (entity.action === 'attack') return 'attack';
    if (entity.action === 'run') return 'run';
    if (entity.action === 'walk') return 'move';
    return 'idle';
  }

  private updateCameraAndMarker(dt: number): void {
    const player = this.views.get(this.net.playerId);
    if (player) {
      const p = player.group.position;
      this.rig.setTarget(p.x, p.y, p.z);
      this.world.updateSun(p.x, p.y, p.z);
    }
    this.rig.rotate(this.input.rotateDir, dt);
    this.rig.update(dt);

    if (this.markerTimer > 0) {
      this.markerTimer -= dt;
      const t = Math.max(this.markerTimer / MARKER_DURATION, 0);
      (this.targetMarker.material as THREE.MeshBasicMaterial).opacity = t * 0.9;
      const scale = 1 + (1 - t) * 0.8;
      this.targetMarker.scale.set(scale, scale, scale);
      this.targetMarker.visible = true;
    } else {
      this.targetMarker.visible = false;
    }
  }

  private showMarker(x: number, y: number, z: number): void {
    this.targetMarker.position.set(x, y + 0.05, z);
    this.markerTimer = MARKER_DURATION;
  }

  private syncZone(zone: WorldZone): void {
    if (zone === this.zone) return;
    this.zone = zone;
    this.world.setZone(zone);
  }

  private resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.world.resize(w, h);
    this.rig.resize(w / h);
  }
}
