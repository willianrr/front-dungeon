import type { Command, WorldSnapshot } from '../shared/types';
import type { WorldData } from '../shared/worldgen';

// ---------------------------------------------------------------------------
// Fronteira entre o renderer/input e o servidor autoritativo.
//
// O jogo so conversa com esta interface. A implementacao atual e o
// ServerClient, que fala WebSocket com o backend Go.
// ---------------------------------------------------------------------------

export interface NetworkClient {
  /** ID da entidade controlada por este cliente. */
  readonly playerId: string;

  /** Descricao estatica do mundo (terreno + props), derivada da seed do servidor. */
  getWorld(): WorldData;

  /** Envia uma intencao do jogador para o servidor. */
  send(cmd: Command): void;

  /**
   * Avanca qualquer trabalho local do cliente. No ServerClient, os snapshots
   * chegam de forma assincrona pelo WebSocket.
   */
  update(dt: number): void;

  /** Ultimo estado conhecido do mundo, para o cliente desenhar. */
  getSnapshot(): WorldSnapshot;
}
