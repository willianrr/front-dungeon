import * as THREE from 'three';

export class LootLabel3D {
  readonly sprite: THREE.Sprite;

  private readonly material: THREE.SpriteMaterial;
  private readonly texture: THREE.CanvasTexture;

  constructor(text: string, color: string) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D indisponivel para LootLabel3D.');

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'rgba(6, 8, 12, 0.78)';
    this.roundRect(ctx, 11, 14, 234, 36, 7);
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    this.roundRect(ctx, 11, 14, 234, 36, 7);
    ctx.stroke();

    ctx.font = '800 15px Segoe UI, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.92)';
    ctx.strokeText(text, 128, 32, 215);
    ctx.fillStyle = color;
    ctx.fillText(text, 128, 32, 215);

    this.texture = new THREE.CanvasTexture(canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.material = new THREE.SpriteMaterial({
      map: this.texture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    this.sprite = new THREE.Sprite(this.material);
    this.sprite.renderOrder = 1001;
    this.sprite.scale.set(2.35, 0.58, 1);
  }

  setWorldPosition(x: number, y: number, z: number): void {
    this.sprite.position.set(x, y, z);
  }

  faceCamera(camera: THREE.Camera): void {
    this.sprite.quaternion.copy(camera.quaternion);
  }

  dispose(): void {
    this.sprite.removeFromParent();
    this.material.dispose();
    this.texture.dispose();
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
}
