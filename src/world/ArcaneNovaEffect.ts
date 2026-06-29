import * as THREE from 'three';

const NOVA_COLOR = 0x66d9ff;
const NOVA_CORE_COLOR = 0xd9fbff;

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

export class ArcaneNovaEffect {
  readonly group = new THREE.Group();

  private readonly ringMaterial = new THREE.MeshBasicMaterial({
    color: NOVA_COLOR,
    transparent: true,
    opacity: 0.82,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  private readonly haloMaterial = new THREE.MeshBasicMaterial({
    color: NOVA_CORE_COLOR,
    transparent: true,
    opacity: 0.38,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  private readonly ringGeometry = new THREE.RingGeometry(0.78, 1, 96);
  private readonly haloGeometry = new THREE.CircleGeometry(1, 96);
  private readonly ring: THREE.Mesh;
  private readonly halo: THREE.Mesh;
  private age = 0;

  constructor(position: THREE.Vector3, private readonly radius: number, private readonly duration = 0.58) {
    this.ring = new THREE.Mesh(this.ringGeometry, this.ringMaterial);
    this.halo = new THREE.Mesh(this.haloGeometry, this.haloMaterial);
    this.ring.rotation.x = -Math.PI / 2;
    this.halo.rotation.x = -Math.PI / 2;
    this.halo.position.y = 0.015;
    this.group.position.set(position.x, position.y + 0.08, position.z);
    this.group.renderOrder = 4;
    this.group.add(this.halo, this.ring);
  }

  update(dt: number): boolean {
    this.age += dt;
    const t = Math.min(this.age / this.duration, 1);
    const expanded = easeOutCubic(t);
    const ringScale = Math.max(0.1, this.radius * expanded);
    const haloScale = Math.max(0.1, this.radius * (0.28 + expanded * 0.42));
    this.ring.scale.setScalar(ringScale);
    this.halo.scale.setScalar(haloScale);
    this.ringMaterial.opacity = (1 - t) * 0.82;
    this.haloMaterial.opacity = (1 - t) * 0.3;
    this.group.position.y += dt * 0.16;
    return t >= 1;
  }

  dispose(): void {
    this.group.removeFromParent();
    this.ringGeometry.dispose();
    this.haloGeometry.dispose();
    this.ringMaterial.dispose();
    this.haloMaterial.dispose();
  }
}
