import { Game } from './core/Game';
import type { NetworkClient } from './net/NetworkClient';
import { ServerClient } from './net/ServerClient';
import { createWarriorProfile, type PlayerProfile } from './shared/playerProfile';
import { showServerEntry } from './ui/ServerEntry';
import './styles.css';

// Ponto de entrada: login/cadastro no backend -> personagem -> mundo via servidor.
// game.run() mostra a tela de loading, carrega o heroi e so entao comeca o loop.
const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const uiLayer = document.getElementById('ui-layer') as HTMLElement;
const loading = document.getElementById('loading') as HTMLElement | null;
const loadingBar = document.getElementById('loading-bar') as HTMLElement | null;
const loadingPct = document.getElementById('loading-pct') as HTMLElement | null;

void bootstrap();

async function bootstrap(): Promise<void> {
	const session = await showServerEntry();
	const server = new ServerClient(session.token, session.characterId);
	try {
		await server.connect();
	} catch (error) {
		window.alert(`Falha ao conectar no servidor: ${error instanceof Error ? error.message : String(error)}`);
		throw error;
	}
	await startGame(server, createWarriorProfile(session.name));
}

async function startGame(net: NetworkClient, profile: PlayerProfile): Promise<void> {
	if (loadingBar) loadingBar.style.width = '0%';
	if (loadingPct) loadingPct.textContent = '0%';
	loading?.removeAttribute('style');
	loading?.classList.remove('hidden');
	loading?.classList.add('active');
	const game = new Game(canvas, uiLayer, net, profile);
	await game.run();
}
