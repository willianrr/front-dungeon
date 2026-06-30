import type { NetworkClient } from './NetworkClient';
import type { Command, WorldSnapshot } from '../shared/types';
import { generateWorld, type WorldData } from '../shared/worldgen';
import { WS_URL } from './runtimeConfig';

// Cliente ONLINE: fala WebSocket com o servidor Go autoritativo. O servidor
// manda a seed (regeneramos o mundo identico) e o WorldSnapshot a cada tick.
// O resto do jogo (render/input) fica isolado atras da interface NetworkClient.

// WS_URL vem de ./runtimeConfig (runtime > import.meta.env > localhost).
const SNAPSHOT_PARSE_WARN_MS = 8;
const SNAPSHOT_STATS_INTERVAL_MS = 3000;
const SNAPSHOT_DROP_LOG_THRESHOLD = 20;
const COMMAND_STATS_INTERVAL_MS = 3000;

function emptySnapshot(): WorldSnapshot {
  return {
    tick: 0,
    zone: 'overworld',
    entities: [],
    loot: [],
    chests: [],
    inventory: [],
    equipment: { head: null, chest: null, hands: null, legs: null, feet: null, weapon: null, offhand: null, trinket: null },
    equippedWeapon: null,
    combatEvents: [],
    quest: { title: '', objective: '', progress: 0, goal: 0, completed: false },
  };
}

export class ServerClient implements NetworkClient {
  playerId = 'player-1';

  private ws: WebSocket | null = null;
  private world: WorldData | null = null;
  private snapshot: WorldSnapshot = emptySnapshot();
  private pendingSnapshotRaw: string | null = null;
  private ready = false;
  private droppedPendingSnapshots = 0;
  private parsedSnapshots = 0;
  private parseTimeMs = 0;
  private lastStatsAt = 0;
  private sentCommandCounts = new Map<string, number>();
  private sentCommandBytes = 0;
  private lastCommandStatsAt = 0;

  constructor(private readonly token: string, private readonly characterId: number) {}

  /** Abre o WebSocket e resolve quando o mundo (welcome) e o 1o snapshot chegam. */
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const url = `${WS_URL}?token=${encodeURIComponent(this.token)}&characterId=${this.characterId}`;
      const ws = new WebSocket(url);
      this.ws = ws;
      let gotWelcome = false;

      // Sem isso, um servidor que conecta mas nao manda welcome/snapshot deixava
      // a tela preta para sempre. Agora falha com mensagem clara.
      const timeout = window.setTimeout(() => {
        if (this.ready) return;
        ws.close();
        reject(new Error('O servidor conectou mas nao enviou o estado inicial (welcome/snapshot). O backend esta rodando a versao nova (sim) e recompilado?'));
      }, 10000);

      const settleFail = (message: string) => {
        if (this.ready) return;
        window.clearTimeout(timeout);
        reject(new Error(message));
      };

      ws.addEventListener('error', () => settleFail('Falha na conexao com o servidor'));
      ws.addEventListener('close', () => settleFail('Conexao fechada antes de iniciar'));
      ws.addEventListener('message', (event) => {
        const raw = event.data as string;
        if (this.ready && raw.includes('"type":"snapshot"')) {
          if (this.pendingSnapshotRaw) this.droppedPendingSnapshots++;
          this.pendingSnapshotRaw = raw;
          return;
        }

        let msg: { type?: string; playerId?: string; seed?: number; snapshot?: WorldSnapshot };
        try {
          msg = JSON.parse(raw);
        } catch {
          return;
        }
        if (msg.type === 'welcome' && typeof msg.seed === 'number') {
          this.playerId = msg.playerId ?? this.playerId;
          this.world = generateWorld(msg.seed);
          gotWelcome = true;
        } else if (msg.type === 'snapshot' && msg.snapshot) {
          this.snapshot = msg.snapshot;
          if (gotWelcome && !this.ready) {
            this.ready = true;
            window.clearTimeout(timeout);
            resolve();
          }
        } else {
          console.warn('[ServerClient] mensagem inesperada do servidor (backend desatualizado?):', msg);
        }
      });
    });
  }

  getWorld(): WorldData {
    if (!this.world) throw new Error('ServerClient.getWorld() chamado antes de connect()');
    return this.world;
  }

  send(cmd: Command): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      const payload = JSON.stringify(cmd);
      this.ws.send(payload);
      this.recordSentCommand(cmd.type, payload.length);
    }
  }

  update(_dt: number): void {
    const raw = this.pendingSnapshotRaw;
    if (!raw) return;
    this.pendingSnapshotRaw = null;

    const start = performance.now();
    try {
      const msg = JSON.parse(raw) as { type?: string; snapshot?: WorldSnapshot };
      if (msg.type === 'snapshot' && msg.snapshot) this.snapshot = msg.snapshot;
    } catch {
      return;
    } finally {
      const elapsed = performance.now() - start;
      this.parsedSnapshots++;
      this.parseTimeMs += elapsed;
      if (elapsed >= SNAPSHOT_PARSE_WARN_MS) {
        console.warn(`[ServerClient] parse de snapshot lento: ${elapsed.toFixed(1)}ms`);
      }
      this.reportSnapshotStats();
    }
  }

  private reportSnapshotStats(): void {
    const now = performance.now();
    if (this.lastStatsAt === 0) this.lastStatsAt = now;
    if (now - this.lastStatsAt < SNAPSHOT_STATS_INTERVAL_MS) return;
    const avg = this.parsedSnapshots > 0 ? this.parseTimeMs / this.parsedSnapshots : 0;
    if (this.droppedPendingSnapshots >= SNAPSHOT_DROP_LOG_THRESHOLD || avg >= 1) {
      console.info(
        `[ServerClient] snapshots parseados=${this.parsedSnapshots} descartados_no_front=${this.droppedPendingSnapshots} parse_medio=${avg.toFixed(2)}ms`,
      );
    }
    this.parsedSnapshots = 0;
    this.parseTimeMs = 0;
    this.droppedPendingSnapshots = 0;
    this.lastStatsAt = now;
  }

  private recordSentCommand(type: string, bytes: number): void {
    this.sentCommandCounts.set(type, (this.sentCommandCounts.get(type) ?? 0) + 1);
    this.sentCommandBytes += bytes;
    const now = performance.now();
    if (this.lastCommandStatsAt === 0) this.lastCommandStatsAt = now;
    if (now - this.lastCommandStatsAt < COMMAND_STATS_INTERVAL_MS) return;

    let total = 0;
    const byType = [...this.sentCommandCounts.entries()]
      .map(([commandType, count]) => {
        total += count;
        return `${commandType}:${count}`;
      })
      .join(' ');
    if (total > 0) {
      console.info(`[ServerClient] comandos_enviados=${total} bytes=${this.sentCommandBytes} ${byType}`);
    }
    this.sentCommandCounts.clear();
    this.sentCommandBytes = 0;
    this.lastCommandStatsAt = now;
  }

  getSnapshot(): WorldSnapshot {
    return this.snapshot;
  }
}
