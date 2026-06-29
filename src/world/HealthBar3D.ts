import * as THREE from 'three';

// Barra de vida flutuante (billboard) para inimigos. Fica como filha da CENA
// (não do inimigo) para que copiar a rotação da câmera produza um billboard
// perfeito, sem interferência da rotação da entidade.

export class HealthBar3D {
  readonly group = new THREE.Group();
  private readonly fill: THREE.Mesh;
  private readonly labelTexture: THREE.CanvasTexture;
  private readonly labelContext: CanvasRenderingContext2D;
  private readonly width = 1.3;
  private lastLabel = '';

  constructor() {
    const bg = new THREE.Mesh(
      new THREE.PlaneGeometry(this.width, 0.16),
      new THREE.MeshBasicMaterial({ color: 0x200707, depthTest: false }),
    );
    bg.renderOrder = 998;

    this.fill = new THREE.Mesh(
      new THREE.PlaneGeometry(this.width, 0.16),
      new THREE.MeshBasicMaterial({ color: 0x49d65a, depthTest: false }),
    );
    this.fill.renderOrder = 999;

    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas 2D indisponivel para HealthBar3D.');
    this.labelContext = context;
    this.labelTexture = new THREE.CanvasTexture(canvas);
    this.labelTexture.colorSpace = THREE.SRGBColorSpace;

    const label = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: this.labelTexture, transparent: true, depthTest: false }),
    );
    label.position.y = 0.24;
    label.scale.set(1.45, 0.36, 1);
    label.renderOrder = 1000;

    this.group.add(bg, this.fill, label);
  }

  setHealth(hp: number, maxHp: number, level: number, name = ''): void {
    this.setRatio(maxHp > 0 ? hp / maxHp : 0);
    const current = Math.max(0, Math.ceil(hp));
    const max = Math.max(0, Math.ceil(maxHp));
    const safeName = name.trim();
    const shortName = safeName.length > 13 ? `${safeName.slice(0, 12)}...` : safeName;
    const label = shortName ? `${shortName}  Nv ${level}  ${current}/${max}` : `Nv ${level}  ${current}/${max}`;
    if (label === this.lastLabel) return;

    this.lastLabel = label;
    const ctx = this.labelContext;
    ctx.clearRect(0, 0, 256, 64);
    ctx.fillStyle = 'rgba(8, 10, 14, 0.78)';
    this.roundRect(ctx, 22, 10, 212, 42, 10);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 226, 122, 0.72)';
    ctx.lineWidth = 2;
    this.roundRect(ctx, 22, 10, 212, 42, 10);
    ctx.stroke();
    let fontSize = shortName ? 19 : 24;
    do {
      ctx.font = `700 ${fontSize}px Segoe UI, Arial, sans-serif`;
      if (ctx.measureText(label).width <= 198 || fontSize <= 15) break;
      fontSize -= 1;
    } while (true);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff3c2';
    ctx.fillText(label, 128, 32);
    this.labelTexture.needsUpdate = true;
  }

  private setRatio(ratio: number): void {
    const r = Math.max(0, Math.min(1, ratio));
    this.fill.scale.x = r === 0 ? 0.0001 : r;
    // Mantém a barra "ancorada" à esquerda enquanto encolhe.
    this.fill.position.x = -(this.width * (1 - r)) / 2;
  }

  private roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number): void {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }

  setWorldPosition(x: number, y: number, z: number): void {
    this.group.position.set(x, y, z);
  }

  faceCamera(camera: THREE.Camera): void {
    this.group.quaternion.copy(camera.quaternion);
  }
}
