# Aranna — ARPG Web 3D

Esqueleto base de um Action-RPG isométrico para navegador, inspirado em
*Dungeon Siege: Legends of Aranna*. Construído com **Three.js + TypeScript + Vite**,
com a arquitetura já preparada para virar **multiplayer online** (servidor em Go) sem reescrever o cliente.

## Como rodar

Pré-requisitos: [Node.js](https://nodejs.org) 18+ (testado no Node 22).

```bash
npm install      # instala as dependências
npm run dev      # abre em http://localhost:5173
```

O front usa o servidor Go por padrão. Deixe o backend rodando e acesse a URL principal do Vite,
sem `?server`.

Outros scripts:

```bash
npm run build    # type-check + bundle de produção em dist/
npm run preview  # serve o build de produção
```

> Se existir uma pasta `node_modules` vazia, pode apagá-la — o `npm install` recria tudo.
> Contas, personagens e progresso ficam no backend.

## Controles

| Ação | Comando |
| --- | --- |
| Mover o herói | Clique esquerdo no chão |
| Atacar | Clique esquerdo num inimigo |
| Girar a câmera | Teclas `Q` / `E` |
| Zoom | Scroll do mouse |
| Pular | `Espaço` |
| Usar poção de vida | `1` |
| Conjurar Nova Arcana | `2` |
| Usar poção de mana | `3` |
| Mutar/desmutar efeitos sonoros | `M` |
| Alternar qualidade/performance | `F` |

## O que já funciona

- Mundo 3D com chão, grade tática, iluminação e sombras.
- Herói controlado por **clique-para-mover** (raycast no chão), com câmera 3/4 que o segue.
- Zumbis 3D animados que nascem em ondas, perseguem e atacam o herói (aggro).
- Combate em tempo real, barras de vida flutuantes, morte, drops e **renascimento**.
- Progressão: XP ao matar inimigos, subida de nível (mais vida e dano).
- Habilidade ativa: Nova Arcana na tecla `2`, com custo de mana, cooldown e dano mágico em área.
- Persistência via backend para personagem, nível, atributos, quest, inventário e equipamento.
- Efeitos sonoros procedurais para loot, baús, poções, magia e impacto, com mute persistente.
- Impactos 3D curtos para golpes físicos e dano mágico, sincronizados com os eventos de combate.
- Números flutuantes de combate para dano causado, dano recebido e esquivas.
- Camera shake curto quando o herói sofre dano e no impacto do slam do boss.
- Boss zumbi da dungeon com slam telegrafado no chão; pule para evitar o impacto.
- Loot clicável e mochila com ícones dos itens; poções recuperam vida e mana.
- Drops probabilísticos para inimigos comuns, com recompensas garantidas e melhores no boss.
- Minimap/radar circular com jogador, inimigos, loot, baús e portal/saída.
- Qualidade de render ajustável e modo automático que reduz resolução/bloom quando o FPS cai.
- Baús 3D clicáveis na dungeon, com estado persistente no servidor e drops próprios.
- Dungeon com decoração 3D instanciada: pilares quebrados, cristais, entulho e sigilo do boss.
- Quest guiada: limpe o exterior, entre no portal e conclua a primeira dungeon.
- Navegação A* para o herói contornar árvores, rochas e ruínas.
- HUD com nível, vida, experiência, quest e inventário.
- **Camada de rede abstraída** (`NetworkClient`): o front fala com o servidor Go
  por REST e WebSocket.
- Rooms públicas automáticas no backend, com até 25 jogadores por room.

## Estrutura

```
src/
├── main.ts            Ponto de entrada
├── audio/
│   └── Sfx.ts          Efeitos sonoros procedurais via Web Audio
├── shared/            Tipos e matemática SEM Three.js (portável p/ servidor)
│   ├── types.ts         Command, EntityState, WorldSnapshot
│   └── mathx.ts         Vetores e helpers
├── net/
│   ├── NetworkClient.ts Interface cliente <-> servidor (a "costura")
│   ├── ServerClient.ts  Cliente WebSocket do jogo
│   └── api.ts           Cliente REST de contas/personagens
├── core/
│   ├── Game.ts          Loop, render dos snapshots, tradução de input -> comandos
│   └── Input.ts         Mouse e teclado
├── world/
│   ├── World.ts         Cena, luzes, sombras, chão
│   ├── CameraRig.ts     Câmera ARPG (segue, gira, zoom)
│   ├── factory.ts       Meshes (herói, inimigo, chão, marcador)
│   ├── ZombieModel.ts   Carrega e anima os zumbis GLB do Meshy
│   ├── LootModels.ts    Cache e renderização dos drops GLB
│   ├── ChestModels.ts   Cache e renderização dos baús GLB da dungeon
│   └── HealthBar3D.ts   Barra de vida flutuante (billboard)
└── ui/
    └── HUD.ts           Interface em DOM (vida, XP, tela de morte)
```

Veja **[ARQUITETURA.md](./ARQUITETURA.md)** para a explicação das decisões
(incluindo por que Go fica no backend e não no cliente) e o roadmap.
