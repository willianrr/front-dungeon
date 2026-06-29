import * as THREE from 'three';
import type { DamageKind } from '../shared/types';

const PHYSICAL_COLOR = 0xffd874;
const PHYSICAL_CORE_COLOR = 0xfff1b8;
const MAGIC_COLOR = 0x6ed8ff;
const MAGIC_CORE_COLOR = 0xe2fbff;

function easeOutQuad(t: number): number {
  return 1 - (1 - t) * (1 - t);
}

export class HitImpactEffect {
  readonly group = new THREE.Group();

  private readonly geometries: THREE.BufferGeometry[] = [];
  private readonly materials: THREE.Material[] = [];
  private readonly meshes: THREE.Mesh[] = [];
  private readonly duration: number;
  private age = 0;

  constructor(position: THREE.Vector3, private readonly damageKind: DamageKind, variant: number) {
    this.duration = damageKind === 'magic' ? 0.42 : 0.34;
    this.group.position.set(position.x, position.y + (damageKind === 'magic' ? 1.08 : 1.24), position.z);
    this.group.rotation.y = variant * 1.37;
    this.group.renderOrder = 9;

    if (damageKind === 'magic') this.buildMagicImpact(variant);
    else this.buildPhysicalImpact(variant);
  }

  update(dt: number): boolean {
    this.age += dt;
    const t = Math.min(this.age / this.duration, 1);
    const ease = easeOutQuad(t);
    const fade = Math.max(0, 1 - t);

    this.group.position.y += dt * (this.damageKind === 'magic' ? 0.3 : 0.18);
    this.group.rotation.y += dt * (this.damageKind === 'magic' ? 1.6 : 0.7);

    if (this.damageKind === 'magic') {
      this.meshes[0]?.scale.setScalar(0.35 + ease * 1.65);
      this.meshes[1]?.scale.setScalar(0.5 + ease * 0.72);
    } else {
      this.meshes[0]?.scale.set(0.72 + ease * 0.36, 0.72 + ease * 0.28, 1);
      this.meshes[1]?.scale.set(0.92 + ease * 0.3, 0.92 + ease * 0.22, 1);
      this.meshes[2]?.scale.setScalar(0.62 + ease * 0.42);
    }

    for (const material of this.materials) {
      const m = material as THREE.MeshBasicMaterial;
      m.opacity = fade * (this.damageKind === 'magic' ? 0.72 : 0.82);
    }
    return t >= 1;
  }

  dispose(): void {
    this.group.removeFromParent();
    for (const geometry of this.geometries) geometry.dispose();
    for (const material of this.materials) material.dispose();
  }

  private buildPhysicalImpact(variant: number): void {
    const slashMaterial = this.trackMaterial(new THREE.MeshBasicMaterial({
      color: PHYSICAL_COLOR,
      transparent: true,
      opacity: 0.82,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }));
    const coreMaterial = this.trackMaterial(new THREE.MeshBasicMaterial({
      color: PHYSICAL_CORE_COLOR,
      transparent: true,
      opacity: 0.76,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }));

    const slashA = this.trackMesh(
      new THREE.RingGeometry(0.52, 0.66, 32, 1, 0.18, Math.PI * 0.96),
      slashMaterial,
    );
    slashA.rotation.z = -0.68 + (variant % 3) * 0.12;

    const slashB = this.trackMesh(
      new THREE.RingGeometry(0.34, 0.44, 24, 1, 0.25, Math.PI * 0.75),
      slashMaterial.clone(),
    );
    this.materials.push(slashB.material as THREE.Material);
    slashB.rotation.z = 0.92 + (variant % 2) * 0.14;
    slashB.position.x = 0.1;
    slashB.position.y = -0.02;

    const spark = this.trackMesh(new THREE.CircleGeometry(0.18, 20), coreMaterial);
    spark.position.set(0.16, 0.02, 0.01);

    this.group.add(slashA, slashB, spark);
  }

  private buildMagicImpact(variant: number): void {
    const ringMaterial = this.trackMaterial(new THREE.MeshBasicMaterial({
      color: MAGIC_COLOR,
      transparent: true,
      opacity: 0.72,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }));
    const coreMaterial = this.trackMaterial(new THREE.MeshBasicMaterial({
      color: MAGIC_CORE_COLOR,
      transparent: true,
      opacity: 0.58,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }));

    const ring = this.trackMesh(new THREE.RingGeometry(0.28, 0.42, 48), ringMaterial);
    ring.rotation.x = -Math.PI / 2;
    ring.rotation.z = variant * 0.4;

    const core = this.trackMesh(new THREE.CircleGeometry(0.34, 40), coreMaterial);
    core.rotation.x = -Math.PI / 2;
    core.position.y = 0.02;

    this.group.add(ring, core);
  }

  private trackMesh(geometry: THREE.BufferGeometry, material: THREE.Material): THREE.Mesh {
    this.geometries.push(geometry);
    const mesh = new THREE.Mesh(geometry, material);
    this.meshes.push(mesh);
    return mesh;
  }

  private trackMaterial<T extends THREE.Material>(material: T): T {
    this.materials.push(material);
    return material;
  }
}
