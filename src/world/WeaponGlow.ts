import * as THREE from 'three';
import { RARITY_GLOW_SCALE } from '../shared/itemMeta';
import type { ItemRarity } from '../shared/types';
import { BladeFireParticles } from './BladeFireParticles';

interface WeaponGlowSocket {
  worldLength: number;
  gripFromBottomRatio: number;
}

export interface WeaponGlowOptions {
  enhancementLevel: number;
  color?: THREE.ColorRepresentation;
  rarity?: ItemRarity;
  flameColor?: THREE.ColorRepresentation;
}

interface MaterialWithEmissive extends THREE.Material {
  emissive: THREE.Color;
  emissiveIntensity: number;
  metalness?: number;
  roughness?: number;
}

interface GlowMaterialState {
  material: MaterialWithEmissive;
  originalEmissive: THREE.Color;
  originalIntensity: number;
  glowIntensity: number;
}

interface GlowShell {
  mesh: THREE.Mesh;
  baseScale: number;
}

interface MaterialRestoreState {
  mesh: THREE.Mesh;
  originalMaterial: THREE.Material | THREE.Material[];
  clonedMaterials: THREE.Material[];
}

interface WeaponMaterialGlowResult {
  glowStates: GlowMaterialState[];
  restoreStates: MaterialRestoreState[];
}

const MAX_WEAPON_GLOW_LEVEL = 15;

let auraTexture: THREE.CanvasTexture | undefined;

function hasEmissive(material: THREE.Material): material is MaterialWithEmissive {
  const maybe = material as Partial<MaterialWithEmissive>;
  return maybe.emissive instanceof THREE.Color && typeof maybe.emissiveIntensity === 'number';
}

function enhancementColor(level: number): THREE.ColorRepresentation {
  if (level >= 13) return 0x9d8cff;
  if (level >= 10) return 0x6ad7ff;
  if (level >= 7) return 0x4f7dff;
  if (level >= 4) return 0x8fdcff;
  return 0xffffff;
}

function enhancementFactor(level: number, rarityBoost: number): number {
  const progress = THREE.MathUtils.clamp(level / MAX_WEAPON_GLOW_LEVEL, 0, 1);
  const rarityT = THREE.MathUtils.clamp((rarityBoost - 0.92) / (1.3 - 0.92), 0, 1);
  const rarityScale = THREE.MathUtils.lerp(0.94, 1.1, rarityT);
  return Math.min(1, Math.pow(progress, 1.45) * rarityScale);
}

function stageFactor(level: number, startLevel: number, maxLevel: number, power = 1.2): number {
  const t = THREE.MathUtils.clamp((level - startLevel) / (maxLevel - startLevel), 0, 1);
  return Math.pow(t, power);
}

function getAuraTexture(): THREE.CanvasTexture {
  if (auraTexture) return auraTexture;

  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Nao foi possivel criar textura de aura da arma.');

  const horizontal = ctx.createLinearGradient(0, 0, canvas.width, 0);
  horizontal.addColorStop(0, 'rgba(255,255,255,0)');
  horizontal.addColorStop(0.18, 'rgba(255,255,255,0.18)');
  horizontal.addColorStop(0.5, 'rgba(255,255,255,1)');
  horizontal.addColorStop(0.82, 'rgba(255,255,255,0.18)');
  horizontal.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = horizontal;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.globalCompositeOperation = 'destination-in';
  const vertical = ctx.createLinearGradient(0, 0, 0, canvas.height);
  vertical.addColorStop(0, 'rgba(255,255,255,0)');
  vertical.addColorStop(0.1, 'rgba(255,255,255,0.65)');
  vertical.addColorStop(0.52, 'rgba(255,255,255,1)');
  vertical.addColorStop(0.9, 'rgba(255,255,255,0.62)');
  vertical.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = vertical;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  auraTexture = new THREE.CanvasTexture(canvas);
  auraTexture.colorSpace = THREE.SRGBColorSpace;
  auraTexture.needsUpdate = true;
  return auraTexture;
}

function cloneAndGlowWeaponMaterials(root: THREE.Object3D, color: THREE.Color, intensity: number): WeaponMaterialGlowResult {
  const glowStates: GlowMaterialState[] = [];
  const restoreStates: MaterialRestoreState[] = [];

  const cloneMaterial = (material: THREE.Material): THREE.Material => {
    const cloned = material.clone();
    if (hasEmissive(cloned)) {
      glowStates.push({
        material: cloned,
        originalEmissive: cloned.emissive.clone(),
        originalIntensity: cloned.emissiveIntensity,
        glowIntensity: intensity * 0.08,
      });

      const upgradeTint = color.clone().multiplyScalar(Math.min(0.38, intensity));
      cloned.emissive.copy(cloned.emissive.clone().add(upgradeTint));
      cloned.emissiveIntensity = cloned.emissiveIntensity + intensity * 0.015;
      if (typeof cloned.metalness === 'number') cloned.metalness = Math.max(cloned.metalness, 0.55);
      if (typeof cloned.roughness === 'number') cloned.roughness = Math.min(cloned.roughness, 0.34);
      cloned.needsUpdate = true;
    }
    return cloned;
  };

  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    const originalMaterial = mesh.material;
    const clonedMaterial = Array.isArray(originalMaterial)
      ? originalMaterial.map(cloneMaterial)
      : cloneMaterial(originalMaterial);
    mesh.material = clonedMaterial;
    restoreStates.push({
      mesh,
      originalMaterial,
      clonedMaterials: Array.isArray(clonedMaterial) ? clonedMaterial : [clonedMaterial],
    });
  });

  return { glowStates, restoreStates };
}

export class WeaponGlowEffect {
  readonly group = new THREE.Group();

  private readonly outerAura = new THREE.Group();
  private readonly outerAuraGeometry: THREE.PlaneGeometry;
  private readonly outerAuraMaterial: THREE.MeshBasicMaterial;
  private readonly bladeFire?: BladeFireParticles;
  private readonly flameLight?: THREE.PointLight;
  private readonly aura: THREE.Mesh<THREE.CylinderGeometry, THREE.MeshBasicMaterial>;
  private readonly core: THREE.Mesh<THREE.CylinderGeometry, THREE.MeshBasicMaterial>;
  private readonly streaks: THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  private readonly particles: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>;
  private readonly light: THREE.PointLight;
  private readonly shellMaterial: THREE.MeshBasicMaterial;
  private readonly surfaceMaterial: THREE.MeshBasicMaterial;
  private readonly shells: GlowShell[] = [];
  private readonly materials: GlowMaterialState[];
  private readonly materialRestores: MaterialRestoreState[];
  private readonly streakPositions: Float32Array;
  private readonly streakSeeds: Float32Array;
  private readonly positions: Float32Array;
  private readonly seeds: Float32Array;
  private readonly levelFactor: number;
  private readonly elementFactor: number;
  private readonly auraFactor: number;
  private readonly particleFactor: number;
  private readonly shellFactor: number;
  private readonly streakFactor: number;
  private readonly lightFactor: number;
  private readonly bloomFactor: number;
  private readonly bladeLength: number;
  private readonly bladeBottom: number;
  private readonly bladeRadius: number;
  private readonly glowLength: number;
  private time = 0;

  constructor(weapon: THREE.Object3D, socket: WeaponGlowSocket, options: WeaponGlowOptions) {
    const level = THREE.MathUtils.clamp(options.enhancementLevel, 1, MAX_WEAPON_GLOW_LEVEL);
    const rarityBoost = options.rarity ? RARITY_GLOW_SCALE[options.rarity] : 1;
    this.levelFactor = enhancementFactor(level, rarityBoost);
    this.elementFactor = options.flameColor !== undefined ? Math.max(0.72, this.levelFactor) : this.levelFactor;
    this.auraFactor = stageFactor(level, 2, 10, 1.25);
    this.particleFactor = stageFactor(level, 4, 12, 1.2);
    this.streakFactor = stageFactor(level, 7, 15, 1.15);
    this.shellFactor = stageFactor(level, 9, 15, 1.3);
    this.lightFactor = stageFactor(level, 3, 15, 1.35);
    this.bloomFactor = stageFactor(level, 8, 15, 1.2);
    this.bladeLength = socket.worldLength * 0.88;
    this.bladeBottom = -socket.worldLength * socket.gripFromBottomRatio * 0.35;
    this.bladeRadius = THREE.MathUtils.lerp(0.085, 0.28, this.levelFactor);
    this.glowLength = this.bladeLength * 0.94;

    const color = new THREE.Color(options.color ?? enhancementColor(level));
    const bloomColor = color.clone().multiplyScalar(0.72 + this.levelFactor * 0.78 + this.bloomFactor * 1.45);
    const materialIntensity = Math.pow(this.levelFactor, 1.35) * 0.58 + this.bloomFactor * 0.38;
    const materialGlow = cloneAndGlowWeaponMaterials(weapon, color, materialIntensity);
    this.materials = materialGlow.glowStates;
    this.materialRestores = materialGlow.restoreStates;
    this.shellMaterial = new THREE.MeshBasicMaterial({
      color: bloomColor.clone().multiplyScalar(1.18),
      transparent: true,
      opacity: THREE.MathUtils.lerp(0, 0.24, this.shellFactor),
      blending: THREE.AdditiveBlending,
      depthTest: true,
      depthWrite: false,
      side: THREE.BackSide,
    });
    this.shellMaterial.toneMapped = false;
    this.surfaceMaterial = new THREE.MeshBasicMaterial({
      color: bloomColor.clone().multiplyScalar(0.9),
      transparent: true,
      opacity: THREE.MathUtils.lerp(0, 0.08, this.shellFactor),
      blending: THREE.AdditiveBlending,
      depthTest: true,
      depthWrite: false,
      side: THREE.FrontSide,
    });
    this.surfaceMaterial.toneMapped = false;
    this.createWeaponShells(weapon);

    this.group.name = 'weapon-upgrade-glow';

    const centerY = this.bladeBottom + this.bladeLength * 0.5;
    const visibleEffectLength = this.glowLength;
    const visibleEffectCenterY = this.bladeBottom + visibleEffectLength * 0.5;
    const outerAuraWidth = this.bladeRadius * THREE.MathUtils.lerp(4.0, 6.6, this.levelFactor);
    this.outerAuraGeometry = new THREE.PlaneGeometry(outerAuraWidth, visibleEffectLength);
    this.outerAuraMaterial = new THREE.MeshBasicMaterial({
      color: bloomColor.clone().multiplyScalar(1.1),
      map: getAuraTexture(),
      transparent: true,
      opacity: THREE.MathUtils.lerp(0, 0.5, this.auraFactor),
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.outerAuraMaterial.toneMapped = false;
    for (const angle of [0, Math.PI / 2, Math.PI / 4]) {
      const ribbon = new THREE.Mesh(this.outerAuraGeometry, this.outerAuraMaterial);
      ribbon.position.y = visibleEffectCenterY;
      ribbon.rotation.y = angle;
      ribbon.renderOrder = 11;
      this.outerAura.add(ribbon);
    }

    if (options.flameColor !== undefined) {
      const flameColor = new THREE.Color(options.flameColor);
      const fireBladeRadius = Math.min(this.bladeRadius, 0.108);
      const fireIntensity = 0.72;
      this.bladeFire = new BladeFireParticles({
        bladeBottom: this.bladeBottom,
        bladeLength: this.bladeLength,
        bladeRadius: fireBladeRadius,
        color: flameColor,
        intensity: fireIntensity,
      });
      this.flameLight = new THREE.PointLight(flameColor, THREE.MathUtils.lerp(1.35, 3.4, fireIntensity), 5.8, 2);
      this.flameLight.position.set(0, centerY + this.bladeLength * 0.04, 0);
    }

    const auraMaterial = new THREE.MeshBasicMaterial({
      color: bloomColor,
      transparent: true,
      opacity: THREE.MathUtils.lerp(0, 0.3, this.auraFactor),
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    auraMaterial.toneMapped = false;
    this.aura = new THREE.Mesh(
      new THREE.CylinderGeometry(this.bladeRadius * 1.22, this.bladeRadius * 0.82, visibleEffectLength, 32, 1, true),
      auraMaterial,
    );
    this.aura.position.y = visibleEffectCenterY;
    this.aura.renderOrder = 12;

    const coreMaterial = new THREE.MeshBasicMaterial({
      color: bloomColor.clone().multiplyScalar(1.18),
      transparent: true,
      opacity: THREE.MathUtils.lerp(0, 0.26, this.auraFactor),
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    coreMaterial.toneMapped = false;
    this.core = new THREE.Mesh(
      new THREE.CylinderGeometry(this.bladeRadius * 0.26, this.bladeRadius * 0.16, visibleEffectLength * 0.86, 18, 1, true),
      coreMaterial,
    );
    this.core.position.y = visibleEffectCenterY + visibleEffectLength * 0.015;
    this.core.renderOrder = 13;

    const streakCount = Math.round(THREE.MathUtils.lerp(0, 38, this.streakFactor));
    this.streakPositions = new Float32Array(streakCount * 2 * 3);
    this.streakSeeds = new Float32Array(streakCount * 6);
    for (let i = 0; i < streakCount; i++) {
      const seed = i * 6;
      this.streakSeeds[seed] = Math.random() * Math.PI * 2;
      this.streakSeeds[seed + 1] = Math.random();
      this.streakSeeds[seed + 2] = Math.random();
      this.streakSeeds[seed + 3] = Math.random() > 0.5 ? 1 : -1;
      this.streakSeeds[seed + 4] = Math.random();
      this.streakSeeds[seed + 5] = Math.random();
    }
    const streakGeometry = new THREE.BufferGeometry();
    streakGeometry.setAttribute('position', new THREE.BufferAttribute(this.streakPositions, 3));
    const streakMaterial = new THREE.LineBasicMaterial({
      color: bloomColor.clone().multiplyScalar(1.35),
      transparent: true,
      opacity: THREE.MathUtils.lerp(0, 0.56, this.streakFactor),
      blending: THREE.AdditiveBlending,
      depthTest: true,
      depthWrite: false,
    });
    streakMaterial.toneMapped = false;
    this.streaks = new THREE.LineSegments(streakGeometry, streakMaterial);
    this.streaks.renderOrder = 14;

    const particleCount = Math.round(THREE.MathUtils.lerp(0, 104, this.particleFactor));
    this.positions = new Float32Array(particleCount * 3);
    this.seeds = new Float32Array(particleCount * 4);
    for (let i = 0; i < particleCount; i++) {
      const seed = i * 4;
      this.seeds[seed] = Math.random() * Math.PI * 2;
      this.seeds[seed + 1] = Math.random();
      this.seeds[seed + 2] = THREE.MathUtils.lerp(0.35, 1.35, Math.random());
      this.seeds[seed + 3] = Math.random();
    }

    const particleGeometry = new THREE.BufferGeometry();
    particleGeometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    const particleMaterial = new THREE.PointsMaterial({
      color: bloomColor.clone().multiplyScalar(1.12),
      size: THREE.MathUtils.lerp(0.034, 0.085, this.levelFactor),
      transparent: true,
      opacity: THREE.MathUtils.lerp(0, 0.7, this.particleFactor),
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    particleMaterial.toneMapped = false;
    this.particles = new THREE.Points(particleGeometry, particleMaterial);
    this.particles.renderOrder = 14;

    this.light = new THREE.PointLight(color, THREE.MathUtils.lerp(0, 2.7, this.lightFactor), 6.2, 2);
    this.light.position.set(0, centerY + this.bladeLength * 0.1, 0);

    this.group.add(this.outerAura, this.aura, this.core, this.streaks, this.particles, this.light);
    if (this.bladeFire) this.group.add(this.bladeFire.points);
    if (this.flameLight) this.group.add(this.flameLight);
    this.updateParticles(0);
  }

  update(dt: number): void {
    this.time += dt;

    const pulse = 0.74 + Math.sin(this.time * 4.8) * 0.18 + Math.sin(this.time * 11.5) * 0.08;
    for (const state of this.materials) {
      state.material.emissiveIntensity = state.originalIntensity + state.glowIntensity * pulse;
    }

    const auraPulse = 0.94 + Math.sin(this.time * 3.4) * 0.12;
    const outerPulse = 1.04 + Math.sin(this.time * 2.6) * 0.14 + Math.sin(this.time * 6.2) * 0.04;
    this.outerAura.scale.set(outerPulse, 1, outerPulse);
    this.outerAura.rotation.y += dt * 0.55;
    if (this.bladeFire) {
      this.bladeFire.update(dt);
      if (this.flameLight) {
        this.flameLight.intensity = THREE.MathUtils.lerp(1.35, 3.4, 0.72) * (0.74 + pulse * 0.46);
      }
    }
    this.aura.scale.set(auraPulse, 1, auraPulse);
    this.core.scale.set(0.9 + (1 - auraPulse) * 0.55, 1, 0.9 + (1 - auraPulse) * 0.55);
    this.aura.rotation.y += dt * 1.1;
    this.core.rotation.y -= dt * 1.8;
    this.outerAuraMaterial.opacity = THREE.MathUtils.lerp(0, 0.5, this.auraFactor) * (0.74 + pulse * 0.28);
    this.aura.material.opacity = THREE.MathUtils.lerp(0, 0.28, this.auraFactor) * (0.86 + pulse * 0.18);
    this.core.material.opacity = THREE.MathUtils.lerp(0, 0.2, this.auraFactor) * (0.75 + pulse * 0.25);
    this.streaks.material.opacity = THREE.MathUtils.lerp(0, 0.42, this.streakFactor) * (0.72 + pulse * 0.34);
    this.shellMaterial.opacity = THREE.MathUtils.lerp(0, 0.24, this.shellFactor) * (0.78 + pulse * 0.2);
    this.surfaceMaterial.opacity = THREE.MathUtils.lerp(0, 0.08, this.shellFactor) * (0.82 + pulse * 0.18);
    const shellPulse = 1 + Math.sin(this.time * 5.2) * THREE.MathUtils.lerp(0.004, 0.012, this.levelFactor);
    for (const shell of this.shells) shell.mesh.scale.setScalar(shell.baseScale * shellPulse);
    this.particles.rotation.y += dt * 0.7;
    this.particles.material.opacity = THREE.MathUtils.lerp(0, 0.7, this.particleFactor) * (0.74 + pulse * 0.3);
    this.light.intensity = THREE.MathUtils.lerp(0, 2.7, this.lightFactor) * (0.82 + pulse * 0.34);

    this.updateStreaks(this.time);
    this.updateParticles(this.time);
  }

  dispose(): void {
    this.outerAuraGeometry.dispose();
    this.outerAuraMaterial.dispose();
    this.bladeFire?.dispose();
    for (const shell of this.shells) shell.mesh.removeFromParent();
    this.shellMaterial.dispose();
    this.surfaceMaterial.dispose();
    this.aura.geometry.dispose();
    this.aura.material.dispose();
    this.core.geometry.dispose();
    this.core.material.dispose();
    this.streaks.geometry.dispose();
    this.streaks.material.dispose();
    this.particles.geometry.dispose();
    this.particles.material.dispose();
    for (const state of this.materialRestores) {
      state.mesh.material = state.originalMaterial;
      for (const material of state.clonedMaterials) material.dispose();
    }
  }

  private createWeaponShells(weapon: THREE.Object3D): void {
    const shellScale = 1 + THREE.MathUtils.lerp(0.018, 0.045, this.levelFactor);
    const weaponMeshes: THREE.Mesh<THREE.BufferGeometry>[] = [];

    weapon.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh || !(mesh.geometry instanceof THREE.BufferGeometry)) return;
      weaponMeshes.push(mesh as THREE.Mesh<THREE.BufferGeometry>);
    });

    for (const mesh of weaponMeshes) {
      const shell = new THREE.Mesh(mesh.geometry, this.shellMaterial);
      shell.name = 'weapon-upgrade-outer-shell';
      shell.frustumCulled = false;
      shell.renderOrder = 10;
      shell.scale.setScalar(shellScale);
      mesh.add(shell);
      this.shells.push({ mesh: shell, baseScale: shellScale });

      const surface = new THREE.Mesh(mesh.geometry, this.surfaceMaterial);
      surface.name = 'weapon-upgrade-surface-glow';
      surface.frustumCulled = false;
      surface.renderOrder = 11;
      surface.scale.setScalar(1.002);
      mesh.add(surface);
      this.shells.push({ mesh: surface, baseScale: 1.002 });
    }
  }

  private updateStreaks(time: number): void {
    const count = this.streakPositions.length / 6;
    const bladeTop = this.bladeBottom + this.glowLength * 0.98;
    for (let i = 0; i < count; i++) {
      const seed = i * 6;
      const flow = (this.streakSeeds[seed + 1] + time * THREE.MathUtils.lerp(0.22, 0.72, this.streakSeeds[seed + 2])) % 1;
      const angle = this.streakSeeds[seed] + time * THREE.MathUtils.lerp(0.6, 1.9, this.streakSeeds[seed + 4]) * this.streakSeeds[seed + 3];
      const radius = this.bladeRadius * THREE.MathUtils.lerp(0.42, 1.05, this.streakSeeds[seed + 5]);
      const length = this.glowLength * THREE.MathUtils.lerp(0.018, 0.052, this.streakSeeds[seed + 4]);
      const y = this.bladeBottom + this.glowLength * THREE.MathUtils.lerp(0.05, 0.9, flow);
      const endY = Math.min(bladeTop, y + length);
      const sideWobble = Math.sin(time * 9.5 + this.streakSeeds[seed] * 2.1) * this.bladeRadius * 0.14;
      const endAngle = angle + this.streakSeeds[seed + 3] * THREE.MathUtils.lerp(0.08, 0.22, this.streakSeeds[seed + 2]);

      const pos = i * 6;
      this.streakPositions[pos] = Math.cos(angle) * (radius + sideWobble);
      this.streakPositions[pos + 1] = y;
      this.streakPositions[pos + 2] = Math.sin(angle) * (radius - sideWobble);
      this.streakPositions[pos + 3] = Math.cos(endAngle) * radius * 0.8;
      this.streakPositions[pos + 4] = endY;
      this.streakPositions[pos + 5] = Math.sin(endAngle) * radius * 0.8;
    }

    const attribute = this.streaks.geometry.getAttribute('position');
    attribute.needsUpdate = true;
  }

  private updateParticles(time: number): void {
    for (let i = 0; i < this.positions.length / 3; i++) {
      const seed = i * 4;
      const angle = this.seeds[seed] + time * (1.4 + this.seeds[seed + 2]);
      const lift = ((this.seeds[seed + 1] + time * (0.18 + this.seeds[seed + 3] * 0.28)) % 1) * 0.94;
      const radius = this.bladeRadius * THREE.MathUtils.lerp(0.75, 1.55, this.seeds[seed + 3]);
      const wobble = Math.sin(time * 5.2 + this.seeds[seed]) * this.bladeRadius * 0.16;

      const pos = i * 3;
      this.positions[pos] = Math.cos(angle) * (radius + wobble);
      this.positions[pos + 1] = this.bladeBottom + lift * this.bladeLength;
      this.positions[pos + 2] = Math.sin(angle) * (radius - wobble);
    }

    const attribute = this.particles.geometry.getAttribute('position');
    attribute.needsUpdate = true;
  }
}
