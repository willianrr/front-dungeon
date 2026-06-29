import * as THREE from 'three';
import { clamp } from '../shared/mathx';

// Camera 3/4 estilo ARPG (Dungeon Siege / Diablo): fica acima e atras do heroi,
// olhando para baixo. Permite girar (Q/E) e dar zoom (scroll). O alvo e suavizado
// para que o relevo do terreno nao deixe a camera "tremida".

export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;

  private yaw = Math.PI * 0.25;
  private readonly pitch = THREE.MathUtils.degToRad(52);
  private distance = 20;
  private readonly minDist = 10;
  private readonly maxDist = 38;

  private readonly target = new THREE.Vector3();
  private readonly desired = new THREE.Vector3();
  private readonly shakeOffset = new THREE.Vector3();
  private readonly shakeLookTarget = new THREE.Vector3();
  private initialized = false;
  private shake = 0;
  private shakeTime = 0;

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(50, aspect, 0.1, 2000);
  }

  setTarget(x: number, y: number, z: number): void {
    this.desired.set(x, y + 1, z);
  }

  zoom(delta: number): void {
    this.distance = clamp(this.distance + delta * 2, this.minDist, this.maxDist);
  }

  rotate(dir: number, dt: number): void {
    this.yaw += dir * dt * 1.6;
  }

  addShake(intensity: number): void {
    this.shake = clamp(Math.max(this.shake, intensity), 0, 1);
  }

  /** Direção no chão relativa à tela: W segue para frente da câmera e D para a direita. */
  getMoveDirection(strafe: number, forward: number): { x: number; z: number } {
    const forwardX = -Math.sin(this.yaw);
    const forwardZ = -Math.cos(this.yaw);
    const rightX = Math.cos(this.yaw);
    const rightZ = -Math.sin(this.yaw);
    const x = rightX * strafe + forwardX * forward;
    const z = rightZ * strafe + forwardZ * forward;
    const length = Math.hypot(x, z);
    return length > 0 ? { x: x / length, z: z / length } : { x: 0, z: 0 };
  }

  update(dt: number): void {
    this.shakeTime += dt;
    if (!this.initialized) {
      this.target.copy(this.desired);
      this.initialized = true;
    }
    // suavizacao independente de framerate
    this.target.lerp(this.desired, 1 - Math.pow(0.0015, dt));

    const horiz = Math.cos(this.pitch) * this.distance;
    const height = Math.sin(this.pitch) * this.distance;
    this.camera.position.set(
      this.target.x + Math.sin(this.yaw) * horiz,
      this.target.y + height,
      this.target.z + Math.cos(this.yaw) * horiz,
    );

    if (this.shake > 0.001) {
      const strength = this.shake * this.shake;
      this.shakeOffset.set(
        Math.sin(this.shakeTime * 71) * 0.18 * strength,
        Math.sin(this.shakeTime * 97) * 0.08 * strength,
        Math.cos(this.shakeTime * 83) * 0.18 * strength,
      );
      this.camera.position.add(this.shakeOffset);
      this.shakeLookTarget.copy(this.target).addScaledVector(this.shakeOffset, 0.32);
      this.camera.lookAt(this.shakeLookTarget);
      this.shake = Math.max(0, this.shake - dt * 2.8);
      return;
    }

    this.camera.lookAt(this.target);
  }

  resize(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }
}
