import * as THREE from 'three';

// Captura de entrada do usuario. Nao reage diretamente — apenas registra o que
// aconteceu para o Game consumir a cada frame (cliques, zoom, rotacao, correr,
// pular).

export class Input {
  /** Posicao atual do mouse em coordenadas normalizadas (-1..1). */
  readonly pointer = new THREE.Vector2();
  /** Direcao de rotacao da camera: -1 (Q), 0, +1 (E). */
  rotateDir = 0;
  /** True enquanto Shift estiver pressionado (correr). */
  running = false;

  private clickQueue: THREE.Vector2[] = [];
  private zoomDelta = 0;
  private jumpQueued = false;
  private potionQueued = false;
  private manaPotionQueued = false;
  private arcaneNovaQueued = false;
  private inventoryToggleQueued = false;
  private characterToggleQueued = false;
  private sfxMuteToggleQueued = false;
  private qualityToggleQueued = false;
  private readonly movementKeys = new Set<string>();

  constructor(canvas: HTMLCanvasElement) {
    canvas.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return; // so botao esquerdo
      this.clickQueue.push(this.toNDC(e, canvas));
    });

    canvas.addEventListener('pointermove', (e) => {
      this.toNDC(e, canvas, this.pointer);
    });

    canvas.addEventListener(
      'wheel',
      (e) => {
        this.zoomDelta += Math.sign(e.deltaY);
        e.preventDefault();
      },
      { passive: false },
    );

    window.addEventListener('keydown', (e) => {
      if (e.key === 'q' || e.key === 'Q') this.rotateDir = -1;
      if (e.key === 'e' || e.key === 'E') this.rotateDir = 1;
      if (e.key === 'Shift') this.running = true;
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(e.code)) this.movementKeys.add(e.code);
      if (e.code === 'Space') {
        this.jumpQueued = true;
        e.preventDefault();
      }
      if (e.code === 'Digit1') this.potionQueued = true;
      if (e.code === 'Digit2') this.arcaneNovaQueued = true;
      if (e.code === 'Digit3') this.manaPotionQueued = true;
      if (e.code === 'KeyI') this.inventoryToggleQueued = true;
      if (e.code === 'KeyC') this.characterToggleQueued = true;
      if (e.code === 'KeyM') this.sfxMuteToggleQueued = true;
      if (e.code === 'KeyF' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        this.qualityToggleQueued = true;
        e.preventDefault();
      }
    });
    window.addEventListener('keyup', (e) => {
      if (['q', 'Q', 'e', 'E'].includes(e.key)) this.rotateDir = 0;
      if (e.key === 'Shift') this.running = false;
      this.movementKeys.delete(e.code);
    });
  }

  /** Devolve e limpa os cliques acumulados desde o ultimo frame. */
  takeClicks(): THREE.Vector2[] {
    const clicks = this.clickQueue;
    this.clickQueue = [];
    return clicks;
  }

  /** Devolve e zera o acumulo de zoom desde o ultimo frame. */
  takeZoom(): number {
    const z = this.zoomDelta;
    this.zoomDelta = 0;
    return z;
  }

  /** True uma vez se o jogador apertou pular desde o ultimo frame. */
  takeJump(): boolean {
    const j = this.jumpQueued;
    this.jumpQueued = false;
    return j;
  }

  /** True uma vez quando o jogador pede para usar uma poção (tecla 1). */
  takeUsePotion(): boolean {
    const queued = this.potionQueued;
    this.potionQueued = false;
    return queued;
  }

  /** True uma vez quando o jogador pede para usar uma poção de mana (tecla 3). */
  takeUseManaPotion(): boolean {
    const queued = this.manaPotionQueued;
    this.manaPotionQueued = false;
    return queued;
  }

  /** True uma vez quando o jogador pede para conjurar Nova Arcana (tecla 2). */
  takeArcaneNova(): boolean {
    const queued = this.arcaneNovaQueued;
    this.arcaneNovaQueued = false;
    return queued;
  }

  /** True uma vez quando o jogador abre/fecha a mochila (tecla I). */
  takeInventoryToggle(): boolean {
    const queued = this.inventoryToggleQueued;
    this.inventoryToggleQueued = false;
    return queued;
  }

  /** True uma vez quando o jogador abre/fecha o personagem (tecla C). */
  takeCharacterToggle(): boolean {
    const queued = this.characterToggleQueued;
    this.characterToggleQueued = false;
    return queued;
  }

  /** True uma vez quando o jogador alterna sons do jogo (tecla M). */
  takeSfxMuteToggle(): boolean {
    const queued = this.sfxMuteToggleQueued;
    this.sfxMuteToggleQueued = false;
    return queued;
  }

  /** True uma vez quando o jogador alterna qualidade/performance (tecla F). */
  takeQualityToggle(): boolean {
    const queued = this.qualityToggleQueued;
    this.qualityToggleQueued = false;
    return queued;
  }

  /** Eixos de movimento do teclado no referencial da câmera. */
  getMoveAxes(): { strafe: number; forward: number } {
    const strafe = Number(this.movementKeys.has('KeyD')) - Number(this.movementKeys.has('KeyA'));
    const forward = Number(this.movementKeys.has('KeyW')) - Number(this.movementKeys.has('KeyS'));
    return { strafe, forward };
  }

  private toNDC(e: PointerEvent, canvas: HTMLCanvasElement, out = new THREE.Vector2()): THREE.Vector2 {
    const rect = canvas.getBoundingClientRect();
    out.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    out.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    return out;
  }
}
