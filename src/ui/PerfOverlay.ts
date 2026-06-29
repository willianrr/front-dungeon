import type * as THREE from 'three';

// Overlay de diagnóstico de render: FPS, draw calls, triângulos, programas de
// shader e contagem de geometrias/texturas na GPU. Liga/desliga com F3.
// Custo desprezível: só toca o DOM quando visível e o FPS é uma média móvel.
export class PerfOverlay {
  private readonly el: HTMLDivElement;
  private visible = false;
  private fps = 60;
  private accMs = 0;
  private frames = 0;

  constructor() {
    this.el = document.createElement('div');
    this.el.style.cssText = [
      'position:fixed', 'top:8px', 'left:8px', 'z-index:99999',
      'font:12px/1.45 ui-monospace,Menlo,Consolas,monospace',
      'color:#9eff9e', 'background:rgba(0,0,0,0.62)', 'padding:6px 9px',
      'border-radius:6px', 'white-space:pre', 'pointer-events:none', 'display:none',
    ].join(';');
    (document.body ?? document.documentElement).appendChild(this.el);
    window.addEventListener('keydown', (e) => {
      if (e.code === 'F3') { e.preventDefault(); this.toggle(); }
    });
  }

  toggle(): void {
    this.visible = !this.visible;
    this.el.style.display = this.visible ? 'block' : 'none';
  }

  update(frameMs: number, info: THREE.WebGLRenderer['info'], quality: string): void {
    // Média móvel sobre ~0,5 s para um FPS estável de ler.
    this.accMs += frameMs;
    this.frames++;
    if (this.accMs >= 500) {
      this.fps = (this.frames * 1000) / this.accMs;
      this.accMs = 0;
      this.frames = 0;
    }
    if (!this.visible) return;
    const r = info.render;
    const m = info.memory;
    const progs = info.programs ? info.programs.length : 0;
    this.el.textContent =
      `FPS ${this.fps.toFixed(0)}  (${frameMs.toFixed(1)} ms)\n`
      + `draw calls ${r.calls}\n`
      + `triângulos ${(r.triangles / 1000).toFixed(1)}k\n`
      + `programas  ${progs}\n`
      + `geom / tex ${m.geometries} / ${m.textures}\n`
      + `qualidade  ${quality}  [F3]`;
  }
}
