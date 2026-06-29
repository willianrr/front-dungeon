import * as THREE from 'three';

interface BladeFireParticle {
  age: number;
  angle: number;
  angularSpeed: number;
  life: number;
  maxSize: number;
  position: THREE.Vector3;
  radial: THREE.Vector3;
  velocity: THREE.Vector3;
}

interface BladeFireParticlesOptions {
  bladeBottom: number;
  bladeLength: number;
  bladeRadius: number;
  color: THREE.ColorRepresentation;
  intensity: number;
}

const FIRE_VERTEX_SHADER = `
uniform float pointMultiplier;
attribute float size;
attribute float angle;
attribute vec4 particleColor;
varying vec4 vColor;
varying vec2 vAngle;

void main() {
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  gl_PointSize = size * pointMultiplier / max(0.001, -mvPosition.z);
  vAngle = vec2(cos(angle), sin(angle));
  vColor = particleColor;
}
`;

const FIRE_FRAGMENT_SHADER = `
uniform sampler2D diffuseTexture;
varying vec4 vColor;
varying vec2 vAngle;

void main() {
  vec2 uv = gl_PointCoord - 0.5;
  uv = mat2(vAngle.x, vAngle.y, -vAngle.y, vAngle.x) * uv + 0.5;
  vec4 texel = texture2D(diffuseTexture, uv);
  gl_FragColor = vec4(vColor.rgb, vColor.a * texel.r);
}
`;

const fireTextureLoader = new THREE.TextureLoader();
let fireTexture: THREE.Texture | undefined;
let fireTexturePromise: Promise<THREE.Texture> | undefined;

function prepareFireTexture(texture: THREE.Texture): THREE.Texture {
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
}

export function preloadBladeFireTexture(): Promise<THREE.Texture> {
  if (fireTexture) return Promise.resolve(fireTexture);
  if (!fireTexturePromise) {
    fireTexturePromise = new Promise<THREE.Texture>((resolve, reject) => {
      const texture = fireTextureLoader.load(
        '/particle/unity-fire/fire-mask.png',
        () => resolve(texture),
        undefined,
        reject,
      );
      fireTexture = prepareFireTexture(texture);
    });
  }
  return fireTexturePromise;
}

function getFireTexture(): THREE.Texture {
  if (fireTexture) return fireTexture;
  fireTexture = prepareFireTexture(fireTextureLoader.load('/particle/unity-fire/fire-mask.png'));
  return fireTexture;
}

function alphaAt(t: number): number {
  if (t < 0.18) return THREE.MathUtils.lerp(0, 0.85, t / 0.18);
  if (t > 0.72) return THREE.MathUtils.lerp(0.85, 0, (t - 0.72) / 0.28);
  return 0.85;
}

export class BladeFireParticles {
  readonly points: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;

  private readonly color = new THREE.Color();
  private readonly geometry = new THREE.BufferGeometry();
  private readonly material: THREE.ShaderMaterial;
  private readonly particles: BladeFireParticle[] = [];
  private readonly positions: Float32Array;
  private readonly sizes: Float32Array;
  private readonly colors: Float32Array;
  private readonly angles: Float32Array;
  private readonly maxParticles: number;
  private spawnAccumulator = 0;
  private time = 0;

  constructor(private readonly options: BladeFireParticlesOptions) {
    this.color.set(options.color);
    this.maxParticles = Math.round(THREE.MathUtils.lerp(42, 86, options.intensity));
    this.positions = new Float32Array(this.maxParticles * 3);
    this.sizes = new Float32Array(this.maxParticles);
    this.colors = new Float32Array(this.maxParticles * 4);
    this.angles = new Float32Array(this.maxParticles);

    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('size', new THREE.BufferAttribute(this.sizes, 1));
    this.geometry.setAttribute('particleColor', new THREE.BufferAttribute(this.colors, 4));
    this.geometry.setAttribute('angle', new THREE.BufferAttribute(this.angles, 1));
    this.geometry.setDrawRange(0, 0);

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        diffuseTexture: { value: getFireTexture() },
        pointMultiplier: { value: window.innerHeight * 0.58 },
      },
      vertexShader: FIRE_VERTEX_SHADER,
      fragmentShader: FIRE_FRAGMENT_SHADER,
      blending: THREE.AdditiveBlending,
      depthTest: true,
      depthWrite: false,
      transparent: true,
    });
    this.material.toneMapped = false;

    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 15;
  }

  update(dt: number): void {
    this.time += dt;
    this.spawnAccumulator += dt * THREE.MathUtils.lerp(42, 92, this.options.intensity);
    const spawnCount = Math.min(10, Math.floor(this.spawnAccumulator));
    this.spawnAccumulator -= spawnCount;
    for (let i = 0; i < spawnCount; i++) this.spawn();

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const particle = this.particles[i];
      particle.age += dt;
      if (particle.age >= particle.life) {
        this.particles.splice(i, 1);
        continue;
      }
      const t = particle.age / particle.life;
      particle.position.addScaledVector(particle.velocity, dt);
      particle.position.addScaledVector(particle.radial, dt * THREE.MathUtils.lerp(0.18, 0.46, t));
      particle.velocity.multiplyScalar(1 - dt * 0.65);
      particle.angle += particle.angularSpeed * dt;
    }

    this.updateGeometry();
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }

  private spawn(): void {
    if (this.particles.length >= this.maxParticles) this.particles.shift();

    const alongBlade = Math.random() ** 0.85;
    const sideAngle = Math.random() * Math.PI * 2;
    const radius = this.options.bladeRadius * THREE.MathUtils.lerp(0.5, 1.35, Math.random());
    const radial = new THREE.Vector3(Math.cos(sideAngle), 0, Math.sin(sideAngle));
    const baseY = this.options.bladeBottom + this.options.bladeLength * alongBlade;
    const lift = THREE.MathUtils.lerp(0.1, 0.55, this.options.intensity);

    this.particles.push({
      age: 0,
      angle: Math.random() * Math.PI * 2,
      angularSpeed: THREE.MathUtils.lerp(-2.8, 2.8, Math.random()),
      life: THREE.MathUtils.lerp(0.28, 0.58, Math.random()),
      maxSize: this.options.bladeRadius * THREE.MathUtils.lerp(1.8, 3.5, Math.random()) * THREE.MathUtils.lerp(0.85, 1.4, this.options.intensity),
      position: new THREE.Vector3(radial.x * radius, baseY, radial.z * radius),
      radial,
      velocity: new THREE.Vector3(
        radial.x * THREE.MathUtils.lerp(0.02, 0.12, Math.random()),
        lift,
        radial.z * THREE.MathUtils.lerp(0.02, 0.12, Math.random()),
      ),
    });
  }

  private updateGeometry(): void {
    const hot = this.color.clone().multiplyScalar(THREE.MathUtils.lerp(1.5, 2.8, this.options.intensity));
    const ember = new THREE.Color(0xffd05a);
    const count = this.particles.length;

    for (let i = 0; i < count; i++) {
      const particle = this.particles[i];
      const t = particle.age / particle.life;
      const positionIndex = i * 3;
      this.positions[positionIndex] = particle.position.x;
      this.positions[positionIndex + 1] = particle.position.y;
      this.positions[positionIndex + 2] = particle.position.z;

      this.sizes[i] = particle.maxSize * Math.sin(Math.PI * Math.min(1, t)) * THREE.MathUtils.lerp(0.8, 1.2, Math.sin(this.time * 9 + i) * 0.5 + 0.5);
      this.angles[i] = particle.angle;

      const color = hot.clone().lerp(ember, THREE.MathUtils.clamp(t * 1.2, 0, 1));
      const colorIndex = i * 4;
      this.colors[colorIndex] = color.r;
      this.colors[colorIndex + 1] = color.g;
      this.colors[colorIndex + 2] = color.b;
      this.colors[colorIndex + 3] = alphaAt(t);
    }

    this.geometry.setDrawRange(0, count);
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.size.needsUpdate = true;
    this.geometry.attributes.particleColor.needsUpdate = true;
    this.geometry.attributes.angle.needsUpdate = true;
  }
}
