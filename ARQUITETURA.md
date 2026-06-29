# Arquitetura & Plano — Aranna

Documento de decisões técnicas e roadmap do projeto.

---

## 1. Stack escolhida

| Camada | Tecnologia | Por quê |
| --- | --- | --- |
| Renderização 3D | **Three.js** | Biblioteca 3D mais madura para web, enorme ecossistema, acesso direto a WebGL, carrega modelos `.glb`/`.gltf`. |
| Linguagem | **TypeScript** | Tipagem estática evita uma classe inteira de bugs num projeto que vai crescer. |
| Build / dev server | **Vite** | Start instantâneo, hot-reload, bundle otimizado para produção. |
| Backend | **Go** | Servidor autoritativo com concorrência excelente para netcode em tempo real. |

### Por que NÃO usar Go no cliente

Essa foi a pergunta original, então vale registrar a resposta:

- O que dá a sensação de "rápido" num jogo web é o **motor de renderização** (Canvas/WebGL),
  e isso roda em JavaScript/WebGL dentro do navegador. Trocar a linguagem da lógica do jogo
  não acelera a renderização.
- Go só roda no navegador via **WebAssembly**. É possível, mas traz atrito real: binário grande
  (vários MB), a ponte Go↔DOM/WebGL é verbosa e mais lenta que JS nativo, e você perde **todo**
  o ecossistema de engines/ferramentas web (que é em JS/TS).
- Resumo: para o cliente, TS + Three.js é mais rápido de desenvolver **e** de rodar.

### Onde o Go brilha

No **servidor**. Go foi feito para servidores concorrentes:
goroutines tornam trivial ter um game loop por sala + um handler por conexão. É exatamente
o tipo de carga de um servidor de jogo autoritativo. Veja a seção 4.

---

## 2. Visão geral da arquitetura

O projeto é dividido em **cliente** e **servidor**. O backend Go é autoritativo:
o front envia comandos, recebe snapshots e só cuida de render/input.

```
   INPUT (mouse/teclado)
        │  comandos (mover, atacar)
        ▼
 ┌─────────────┐   send(Command)   ┌──────────────────┐
 │   Game.ts   │ ───────────────►  │  NetworkClient    │  ◄── a "costura"
 │ (cliente:   │                   │  (interface)      │
 │  render +   │ ◄─────────────── │                   │
 │  input)     │  getSnapshot()    └──────────────────┘
 └─────────────┘   WorldSnapshot         │
        ▲                                │  implementado por:
        │ desenha o estado               ▼
        │                        ┌──────────────────┐
        └──────────────────────  │   ServerClient    │
                                  │  └─ backend Go    │  ◄── lógica autoritativa
                                  └──────────────────┘
```

Princípio-chave: **o cliente nunca altera o estado do jogo diretamente.** Ele só:
1. envia **comandos** (intenções do jogador) e
2. desenha o **snapshot** que recebe de volta.

Quem decide o que acontece é a simulação do backend Go. O `ServerClient` transporta
comandos e snapshots; o `Game.ts` não muda para renderizar esse estado.

### Camadas e responsabilidades

- **`shared/`** — tipos e matemática **sem** Three.js. É o contrato comum entre front e backend.
- **`back/sim/`** — o "cérebro": estado verdadeiro do mundo, aplica comandos, avança o tempo,
  resolve combate, XP, spawns, drops, inventário, quest e a troca de área.
- **`net/`** — a interface `NetworkClient`, o `ServerClient` WebSocket e o cliente REST do backend.
- **`core/`** — o cliente de fato: loop de jogo, reconciliação de meshes a partir dos snapshots,
  tradução de cliques em comandos.
- **`world/` e `ui/`** — apresentação pura (Three.js e DOM).

---

## 3. Sistemas do jogo

### Implementados (esqueleto)

- **Movimento clique-para-mover** — raycast do clique no chão → comando `move` → a simulação
  desloca a entidade suavemente, virando-a para a direção.
- **Combate** — clique num inimigo → comando `attack`; a entidade se aproxima até o alcance e
  ataca em intervalos (cooldown). Inimigos têm aggro e revidam.
- **Progressão** — matar inimigos dá XP; ao encher a barra, sobe de nível (mais vida e dano).
- **Spawns** — inimigos nascem em ondas até um teto, mantendo a arena viva.
- **Ciclo de vida** — morte remove o inimigo; morte do herói abre tela de renascimento.

### A implementar (ganchos já preparados)

- **Modelos e animação** — herói e zumbis são GLB animados; a ação vem do snapshot autoritativo.
- **Pathfinding** — A* sobre os blockers procedurais para as ordens de movimento do jogador.
- **Inventário e loot** — drops GLB coletáveis, ícones PNG e poção utilizável na mochila.
- **Mapa e colisões** — obstáculos no exterior e uma primeira câmara de dungeon carregada pelo portal.
- **Habilidades / skills** — o próximo comando natural é `cast`, agora que o snapshot carrega a ação das entidades.

---

## 4. Modo servidor (onde o Go entra)

O fluxo atual usa o backend Go como fonte de verdade:

1. **Servidor autoritativo.** O servidor Go roda a simulação a uma taxa fixa (30 Hz),
   recebe comandos dos jogadores e transmite snapshots por WebSocket.
   Jogadores entram em rooms publicas automaticas com limite de 25 por room.
2. **`ServerClient` no cliente.** `send()` manda comandos pela rede; `getSnapshot()` devolve
   o último estado recebido; `Game.ts` apenas renderiza esse snapshot.
3. **Persistência e contas.** O backend guarda contas, personagens e progresso, enquanto o
   front mantém somente preferências locais de UI/áudio/render.

Esquema do modo online:

```
Navegador A ─┐
             ├─ WebSocket ─► Servidor Go (Room + Simulation autoritativa, 30 Hz) ─► Postgres
Navegador B ─┘                     │
                                   └─► snapshots ─► todos os clientes
```

---

## 5. Roadmap por fases

- **Fase 0 — Esqueleto (concluída):** render 3D, câmera ARPG, clique-para-mover, combate,
  XP/nível, spawns, HUD, costura de rede.
- **Fase 1 — Gameplay:** concluídos herói GLTF, zumbis animados, A*, colisões, loot e primeira dungeon.
  Próximos: habilidades e variedade de inimigos.
- **Fase 2 — Conteúdo:** ampliar dungeon, NPCs, quests encadeadas, equipamentos e progresso persistido.
- **Fase 3 — Online:** servidor Go autoritativo, contas, persistência, party/co-op.
- **Fase 4 — Polimento:** áudio, efeitos visuais, balanceamento, deploy.

### Próximos passos concretos (sugestão de ordem)

1. Criar uma habilidade ativa (ex.: golpe em área) como novo `Command`.
2. Equipar arma/armadura da mochila e refletir visualmente no herói.
3. Transformar a primeira câmara em uma dungeon com salas, chefes e baús.
4. Ampliar a persistência do backend para personagem, quest e inventário.

---

## 6. Decisões de design que valem lembrar

- **Lógica separada da renderização.** Facilita manter a simulação no backend e o front focado em apresentação.
- **Snapshots em vez de mutação direta.** O cliente desenha "fotos" do estado enviadas pelo servidor —
  o mesmo modelo que sustenta o jogo online.
- **Placeholders geométricos.** Cápsulas/esferas deixam o foco nos sistemas; arte entra depois
  trocando um único arquivo.
