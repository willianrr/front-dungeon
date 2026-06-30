import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import type { WorldData } from '../shared/worldgen';
import { createTerrainMesh } from './TerrainMesh';
import { buildProps } from './Props';
import type { ModelRegistry } from './ModelRegistry';
import type { WorldZone } from '../shared/types';

// O "palco": renderer, cena, ceu, luz, terreno, agua e props. O sol (e suas
// sombras) acompanha o jogador para manter as sombras nitidas onde a acao esta.

export interface RenderQualityPreset {
  bloom: boolean;
  bloomStrength: number;
  pixelRatioCap: number;
  shadows: boolean;
  shadowMapSize: number;
}

export class World {
  readonly scene = new THREE.Scene();
  readonly renderer: THREE.WebGLRenderer;

  private readonly composer: EffectComposer;
  private readonly renderPass: RenderPass;
  private readonly bloomPass: UnrealBloomPass;
  private readonly exteriorGround: THREE.Object3D;
  private readonly dungeonGround: THREE.Object3D;
  private readonly sun: THREE.DirectionalLight;
  private readonly sunDir = new THREE.Vector3();
  private readonly exterior = new THREE.Group();
  private readonly dungeon = new THREE.Group();
  private zone: WorldZone = 'overworld';
  private width = window.innerWidth;
  private height = window.innerHeight;
  private pixelRatioCap = 2;
  private bloomEnabled = true;
  private shadowsEnabled = true;
  private shadowMapSize = 2048;

  constructor(canvas: HTMLCanvasElement, world: WorldData, registry?: ModelRegistry) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(this.currentPixelRatio());
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.renderPass = new RenderPass(this.scene, new THREE.PerspectiveCamera());
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.08, 0.78, 0.82);
    this.composer = new EffectComposer(this.renderer);
    this.composer.setPixelRatio(this.currentPixelRatio());
    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.bloomPass);

    this.scene.fog = new THREE.FogExp2(0xaac4d6, 0.0062);

    const hemi = new THREE.HemisphereLight(0xbcd4ff, 0x4a4636, 0.55);
    this.scene.add(hemi);

    this.sun = new THREE.DirectionalLight(0xfff1d6, 2.3);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 160;
    this.sun.shadow.bias = -0.0004;
    const s = 42;
    this.sun.shadow.camera.left = -s;
    this.sun.shadow.camera.right = s;
    this.sun.shadow.camera.top = s;
    this.sun.shadow.camera.bottom = -s;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    this.setupSky(this.exterior);

    this.exteriorGround = createTerrainMesh(world.terrain);
    this.exterior.add(this.exteriorGround);

    this.exterior.add(this.createWater(world));
    buildProps(this.exterior, world, registry);
    this.scene.add(this.exterior);

    this.dungeonGround = this.buildDungeon(world);
    this.dungeon.visible = false;
    this.scene.add(this.dungeon);
  }

  setRenderQuality(preset: RenderQualityPreset): void {
    this.pixelRatioCap = preset.pixelRatioCap;
    this.renderer.setPixelRatio(this.currentPixelRatio());
    this.composer.setPixelRatio(this.currentPixelRatio());
    this.bloomEnabled = preset.bloom;
    this.bloomPass.enabled = preset.bloom;
    this.bloomPass.strength = preset.bloomStrength;
    if (this.shadowsEnabled !== preset.shadows) {
      this.shadowsEnabled = preset.shadows;
      this.renderer.shadowMap.enabled = preset.shadows;
      this.sun.castShadow = preset.shadows;
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }

    if (this.shadowMapSize !== preset.shadowMapSize) {
      this.shadowMapSize = preset.shadowMapSize;
      this.sun.shadow.mapSize.setScalar(preset.shadowMapSize);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }

    this.resize(this.width, this.height);
  }

  private setupSky(parent: THREE.Object3D): void {
    const sky = new Sky();
    sky.scale.setScalar(10000);
    const u = sky.material.uniforms;
    u['turbidity'].value = 6;
    u['rayleigh'].value = 1.6;
    u['mieCoefficient'].value = 0.005;
    u['mieDirectionalG'].value = 0.8;

    const elevation = THREE.MathUtils.degToRad(28);
    const azimuth = THREE.MathUtils.degToRad(155);
    this.sunDir.setFromSphericalCoords(1, Math.PI / 2 - elevation, azimuth);
    u['sunPosition'].value.copy(this.sunDir);

    parent.add(sky);
  }

  private createWater(world: WorldData): THREE.Mesh {
    const geo = new THREE.PlaneGeometry(world.size, world.size);
    geo.rotateX(-Math.PI / 2);
    const water = new THREE.Mesh(
      geo,
      new THREE.MeshStandardMaterial({
        color: 0x2b5d78,
        transparent: true,
        opacity: 0.78,
        roughness: 0.25,
        metalness: 0.1,
      }),
    );
    water.position.y = world.waterLevel;
    water.name = 'water';
    return water;
  }

  /** Reposiciona o sol relativo ao jogador (sombras nitidas perto da acao). */
  updateSun(x: number, y: number, z: number): void {
    if (this.zone !== 'overworld') return;
    this.sun.position.set(x + this.sunDir.x * 70, y + this.sunDir.y * 70 + 20, z + this.sunDir.z * 70);
    this.sun.target.position.set(x, y, z);
    this.sun.target.updateMatrixWorld();
  }

  /** Malha do terreno — alvo do raycaster de clique-para-mover. */
  getGroundMesh(): THREE.Object3D {
    return this.zone === 'overworld' ? this.exteriorGround : this.dungeonGround;
  }

  getDungeonPortal(): THREE.Object3D | undefined {
    return this.exterior.getObjectByName('dungeon-entrance');
  }

  getDungeonExit(): THREE.Object3D | undefined {
    return this.dungeon.getObjectByName('dungeon-exit');
  }

  setZone(zone: WorldZone): void {
    if (zone === this.zone) return;
    this.zone = zone;
    const outside = zone === 'overworld';
    this.exterior.visible = outside;
    this.dungeon.visible = !outside;
    this.scene.fog = outside ? new THREE.FogExp2(0xaac4d6, 0.0062) : new THREE.FogExp2(0x0b1016, 0.045);
    this.renderer.setClearColor(outside ? 0xaac4d6 : 0x05070b, 1);
  }

  private buildDungeon(world: WorldData): THREE.Object3D {
    const floorY = world.terrain.heightAt(0, 0) + 0.04;
    this.dungeon.name = 'dungeon';

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(46, 46, 1, 1),
      new THREE.MeshStandardMaterial({ color: 0x252a32, roughness: 0.96, metalness: 0.02 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = floorY;
    floor.receiveShadow = true;
    floor.name = 'dungeon-ground';
    this.dungeon.add(floor);

    const wallMaterial = new THREE.MeshStandardMaterial({ color: 0x45454a, roughness: 0.92, flatShading: true });
    const wall = (width: number, depth: number, x: number, z: number) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, 5.4, depth), wallMaterial);
      mesh.position.set(x, floorY + 2.7, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.dungeon.add(mesh);
    };
    wall(46, 1.2, 0, -23);
    wall(46, 1.2, 0, 23);
    wall(1.2, 46, -23, 0);
    wall(1.2, 46, 23, 0);

    this.addDungeonDecor(floorY);

    const exit = new THREE.Group();
    exit.name = 'dungeon-exit';
    exit.position.set(0, floorY, -18);
    const archMaterial = new THREE.MeshStandardMaterial({ color: 0x5c6070, roughness: 0.85 });
    for (const x of [-1.7, 1.7]) {
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.7, 3.8, 0.7), archMaterial);
      pillar.position.set(x, 1.9, 0);
      pillar.castShadow = true;
      exit.add(pillar);
    }
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.7, 0.8), archMaterial);
    lintel.position.set(0, 4.0, 0);
    lintel.castShadow = true;
    const portal = new THREE.Mesh(
      new THREE.PlaneGeometry(2.7, 3.3),
      new THREE.MeshBasicMaterial({ color: 0x3955a8, transparent: true, opacity: 0.78, side: THREE.DoubleSide }),
    );
    portal.position.set(0, 1.8, 0.38);
    exit.add(lintel, portal);
    this.dungeon.add(exit);

    const lanternMaterial = new THREE.MeshBasicMaterial({ color: 0xff9c4a });
    for (const [x, z] of [[-17, -17], [17, -17], [-17, 17], [17, 17]]) {
      const light = new THREE.PointLight(0xff7a33, 22, 20, 2);
      light.position.set(x, floorY + 3.3, z);
      const flame = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 8), lanternMaterial);
      flame.position.copy(light.position);
      this.dungeon.add(light, flame);
    }

    const ambient = new THREE.HemisphereLight(0x5d6c9d, 0x111016, 0.75);
    this.dungeon.add(ambient);
    return floor;
  }

  private addDungeonDecor(floorY: number): void {
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const rotation = new THREE.Quaternion();
    const scale = new THREE.Vector3();

    const pillarGeometry = new THREE.CylinderGeometry(0.5, 0.66, 3.2, 8, 1);
    const pillarMaterial = new THREE.MeshStandardMaterial({
      color: 0x55515a,
      roughness: 0.94,
      metalness: 0.02,
      flatShading: true,
    });
    const pillarPositions = [
      [-18, -18, 1.05], [-11.5, -18, 0.72], [11.5, -18, 0.82], [18, -18, 1.05],
      [-18, 18, 0.9], [-11.5, 18, 0.65], [11.5, 18, 0.76], [18, 18, 0.9],
      [-18, -6, 0.58], [18, -6, 0.58], [-18, 7, 0.62], [18, 7, 0.62],
    ] as const;
    const pillars = new THREE.InstancedMesh(pillarGeometry, pillarMaterial, pillarPositions.length);
    pillars.castShadow = true;
    pillars.receiveShadow = true;
    pillarPositions.forEach(([x, z, heightScale], index) => {
      position.set(x, floorY + (3.2 * heightScale) / 2, z);
      rotation.setFromAxisAngle(new THREE.Vector3(0, 1, 0), (index % 4) * Math.PI * 0.18);
      scale.set(1, heightScale, 1);
      matrix.compose(position, rotation, scale);
      pillars.setMatrixAt(index, matrix);
    });
    pillars.instanceMatrix.needsUpdate = true;
    this.dungeon.add(pillars);

    const crystalGeometry = new THREE.ConeGeometry(0.44, 1.45, 5, 1);
    const crystalMaterial = new THREE.MeshStandardMaterial({
      color: 0x7d9dff,
      emissive: 0x223c99,
      emissiveIntensity: 0.9,
      roughness: 0.36,
      metalness: 0.08,
      flatShading: true,
    });
    const crystalPositions = [
      [-15, -15, 1.15], [-7.5, -19, 0.82], [7.5, -19, 0.92], [15, -15, 1.15],
      [-19, 14, 0.74], [-14, 18, 1], [14, 18, 1], [19, 14, 0.74],
      [-20, 0, 0.68], [20, 0, 0.68],
    ] as const;
    const crystals = new THREE.InstancedMesh(crystalGeometry, crystalMaterial, crystalPositions.length);
    crystals.castShadow = true;
    crystals.receiveShadow = true;
    crystalPositions.forEach(([x, z, size], index) => {
      position.set(x, floorY + (1.45 * size) / 2, z);
      rotation.setFromAxisAngle(new THREE.Vector3(0, 1, 0), index * 0.73);
      scale.set(size, size, size);
      matrix.compose(position, rotation, scale);
      crystals.setMatrixAt(index, matrix);
    });
    crystals.instanceMatrix.needsUpdate = true;
    this.dungeon.add(crystals);

    const rubbleGeometry = new THREE.IcosahedronGeometry(0.34, 1);
    const rubbleMaterial = new THREE.MeshStandardMaterial({
      color: 0x3b3b40,
      roughness: 0.98,
      metalness: 0.01,
      flatShading: true,
    });
    const rubblePositions = [
      [-20, -20, 0.9], [-16, -21, 0.56], [-3.5, -20, 0.44], [3.2, -20.5, 0.52], [16, -21, 0.56], [20, -20, 0.9],
      [-20.5, -11, 0.48], [20.5, -11, 0.48], [-20.5, 10.5, 0.58], [20.5, 10.5, 0.58],
      [-18.5, 21, 0.62], [-8, 20.5, 0.46], [0, 19.5, 0.42], [8, 20.5, 0.46], [18.5, 21, 0.62],
    ] as const;
    const rubble = new THREE.InstancedMesh(rubbleGeometry, rubbleMaterial, rubblePositions.length);
    rubble.castShadow = true;
    rubble.receiveShadow = true;
    rubblePositions.forEach(([x, z, size], index) => {
      position.set(x, floorY + 0.18 * size, z);
      rotation.setFromEuler(new THREE.Euler(index * 0.31, index * 0.79, index * 0.47));
      scale.set(size * 1.25, size * 0.62, size);
      matrix.compose(position, rotation, scale);
      rubble.setMatrixAt(index, matrix);
    });
    rubble.instanceMatrix.needsUpdate = true;
    this.dungeon.add(rubble);

    const sigilMaterial = new THREE.MeshBasicMaterial({
      color: 0x7f2430,
      transparent: true,
      opacity: 0.28,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const bossSigil = new THREE.Mesh(new THREE.RingGeometry(4.6, 4.92, 96), sigilMaterial);
    bossSigil.rotation.x = -Math.PI / 2;
    bossSigil.position.set(0, floorY + 0.026, -8);
    bossSigil.renderOrder = 1;
    this.dungeon.add(bossSigil);
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.renderer.setSize(width, height, false);
    this.composer.setSize(width, height);
  }

  render(camera: THREE.Camera): void {
    if (this.bloomEnabled) {
      this.renderPass.camera = camera;
      this.composer.render();
      return;
    }
    this.renderer.render(this.scene, camera);
  }

  private currentPixelRatio(): number {
    return Math.max(0.65, Math.min(window.devicePixelRatio || 1, this.pixelRatioCap));
  }
}
