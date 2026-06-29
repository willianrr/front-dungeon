import * as THREE from 'three';

type BossSlamPhase = 'impact' | 'warning';

const WARNING_COLOR = 0xff4f3f;
const IMPACT_COLOR = 0xffb14a;

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

export class BossSlamEffect {
  readonly group = new THREE.Group();

  private readonly geometries: THREE.BufferGeometry[] = [];
  private readonly materials: THREE.MeshBasicMaterial[] = [];
  private readonly ring: THREE.Mesh;
  private readonly fill: THREE.Mesh;
  private age = 0;

  constructor(
    position: THREE.Vector3,
    private readonly radius: number,
    private readonly phase: BossSlamPhase,
    private readonly duration: number,
  ) {
    const color = phase === 'warning' ? WARNING_COLOR : IMPACT_COLOR;
    const fillOpacity = phase === 'warning' ? 0.18 : 0.26;

    const ringMaterial = this.trackMaterial(new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: phase === 'warning' ? 0.74 : 0.88,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }));
    const fillMaterial = this.trackMaterial(new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: fillOpacity,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }));

    this.ring = new THREE.Mesh(this.trackGeometry(new THREE.RingGeometry(0.84, 1, 96)), ringMaterial);
    this.fill = new THREE.Mesh(this.trackGeometry(new THREE.CircleGeometry(1, 96)), fillMaterial);
    this.ring.rotation.x = -Math.PI / 2;
    this.fill.rotation.x = -Math.PI / 2;
    this.fill.position.y = 0.01;
    this.group.position.set(position.x, position.y + 0.06, position.z);
    this.group.renderOrder = phase === 'warning' ? 5 : 8;
    this.group.add(this.fill, this.ring);
  }

  update(dt: number): boolean {
    this.age += dt;
    const t = Math.min(this.age / this.duration, 1);

    if (this.phase === 'warning') {
      const pulse = 0.72 + Math.sin(this.age * 18) * 0.08 + t * 0.28;
      this.ring.scale.setScalar(this.radius * pulse);
      this.fill.scale.setScalar(this.radius);
      this.materials[0].opacity = 0.38 + Math.sin(this.age * 18) * 0.22 + t * 0.22;
      this.materials[1].opacity = (1 - t * 0.25) * 0.16;
    } else {
      const spread = easeOutCubic(t);
      this.ring.scale.setScalar(this.radius * (0.18 + spread * 1.1));
      this.fill.scale.setScalar(this.radius * (0.2 + spread * 0.55));
      this.materials[0].opacity = (1 - t) * 0.88;
      this.materials[1].opacity = (1 - t) * 0.24;
      this.group.position.y += dt * 0.1;
    }

    return t >= 1;
  }

  dispose(): void {
    this.group.removeFromParent();
    for (const geometry of this.geometries) geometry.dispose();
    for (const material of this.materials) material.dispose();
  }

  private trackGeometry<T extends THREE.BufferGeometry>(geometry: T): T {
    this.geometries.push(geometry);
    return geometry;
  }

  private trackMaterial<T extends THREE.MeshBasicMaterial>(material: T): T {
    this.materials.push(material);
    return material;
  }
}
