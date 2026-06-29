import * as THREE from 'three';
import type { CombatTextKind } from '../shared/types';

// Número de combate em 3D: nasce no impacto e se autoanima até desaparecer.
export class FloatingDamageText {
  readonly sprite: THREE.Sprite;
  private readonly material: THREE.SpriteMaterial;
  private readonly texture: THREE.CanvasTexture;
  private readonly start = new THREE.Vector3();
  private readonly drift: number;
  private readonly baseScale: number;
  private elapsed = 0;

  constructor(text: number | string, position: THREE.Vector3, variant: number, textKind: CombatTextKind = 'physical') {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D indisponível para o número de dano.');
    const label = String(text);

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = label.length > 4 ? '900 56px Segoe UI, Arial, sans-serif' : '900 72px Segoe UI, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 12;
    ctx.strokeStyle = textKind === 'magic'
      ? 'rgba(4, 23, 58, 0.94)'
      : textKind === 'incoming'
        ? 'rgba(62, 10, 14, 0.94)'
        : textKind === 'miss'
          ? 'rgba(12, 20, 28, 0.94)'
          : 'rgba(45, 19, 5, 0.92)';
    ctx.strokeText(label, 128, 64);
    ctx.fillStyle = textKind === 'magic'
      ? '#6ed8ff'
      : textKind === 'incoming'
        ? '#ff6574'
        : textKind === 'miss'
          ? '#d9efff'
          : '#ffe27a';
    ctx.fillText(label, 128, 64);

    this.texture = new THREE.CanvasTexture(canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.material = new THREE.SpriteMaterial({
      map: this.texture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    this.sprite = new THREE.Sprite(this.material);
    this.sprite.renderOrder = 1002;
    this.start.copy(position);
    this.drift = (variant % 2 === 0 ? -1 : 1) * (0.13 + (variant % 3) * 0.04);
    this.sprite.position.copy(this.start);
    this.baseScale = textKind === 'magic'
      ? 0.78
      : textKind === 'incoming'
        ? 0.88
        : textKind === 'miss'
          ? 0.82
          : 0.96;
    this.sprite.scale.set(this.baseScale, this.baseScale * 0.5, 1);
  }

  /** Retorna true quando o efeito terminou e pode ser removido da cena. */
  update(dt: number): boolean {
    this.elapsed += dt;
    const progress = Math.min(this.elapsed / 0.82, 1);
    const easeOut = 1 - (1 - progress) * (1 - progress);

    this.sprite.position.set(
      this.start.x + this.drift * easeOut,
      this.start.y + easeOut * 1.15,
      this.start.z,
    );
    const scale = this.baseScale * (0.96 + (1 - progress) * 0.18);
    this.sprite.scale.set(scale, scale * 0.5, 1);
    this.material.opacity = Math.max(0, 1 - progress * progress);
    return progress >= 1;
  }

  dispose(): void {
    this.sprite.removeFromParent();
    this.material.dispose();
    this.texture.dispose();
  }
}
